import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserProfile, ProxyConfig, ProxyRuntimeStatus, RuntimeChannel } from '../../shared/types';
import { formatProxyServer } from './proxy';
import { writeKernelPolicyFile } from './kernel-runtime';
import { writeEnvironmentCheckPage } from './environment-check-page';
import type { LocalProxyManager } from './local-proxy';

export interface ChromiumLaunchPlanInput {
  executablePath: string;
  profile: BrowserProfile;
  proxy: ProxyConfig | null;
  proxyAuthExtensionDir?: string;
  proxyServerOverride?: string;
  googleApiEnvironment?: NodeJS.ProcessEnv;
  kernelPolicyPath?: string;
  startUrl?: string;
  startUrls?: string[];
}

export interface ChromiumLaunchPlan {
  executablePath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  startUrl?: string;
  startUrls: string[];
}

export interface BrowserController {
  launch(profile: BrowserProfile, proxy: ProxyConfig | null, options?: BrowserLaunchOptions): Promise<BrowserLaunchResult>;
  stop(profileId: string): Promise<void>;
  has(profileId: string): boolean;
}

export interface BrowserLaunchOptions {
  startUrls?: string[];
}

export interface BrowserLaunchResult {
  pid: number;
  runtimeChannel: RuntimeChannel;
  localProxy?: ProxyRuntimeStatus;
  kernelPolicyPath?: string;
  kernelVersion?: string;
}

export function buildChromiumLaunchPlan(input: ChromiumLaunchPlanInput): ChromiumLaunchPlan {
  const { fingerprintPolicy } = input.profile;
  const args = [
    `--user-data-dir=${input.profile.userDataDir}`,
    `--lang=${fingerprintPolicy.locale}`,
    `--window-size=${fingerprintPolicy.windowSize.width},${fingerprintPolicy.windowSize.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,OptimizationHints',
    `--force-webrtc-ip-handling-policy=${fingerprintPolicy.webrtcIpPolicy}`
  ];

  if (input.profile.runtimeChannel === 'custom-kernel') {
    if (!input.kernelPolicyPath) {
      throw new Error('自研内核缺少策略文件');
    }
    args.push(`--fingerbrowser-policy=${input.kernelPolicyPath}`);
  }

  if (fingerprintPolicy.permissionDefaults === 'deny') {
    args.push('--deny-permission-prompts');
  }

  if (input.proxy) {
    args.push(`--proxy-server=${input.proxyServerOverride ?? formatProxyServer(input.proxy)}`);
    if (input.proxy.bypassList.length > 0) {
      args.push(`--proxy-bypass-list=${input.proxy.bypassList.join(';')}`);
    }
    if (input.proxy.username && input.proxyAuthExtensionDir) {
      args.push(`--load-extension=${input.proxyAuthExtensionDir}`);
    }
  }

  const startUrls = [...(input.startUrl ? [input.startUrl] : []), ...(input.startUrls ?? [])];
  for (const startUrl of startUrls) {
    args.push(startUrl);
  }

  return {
    executablePath: input.executablePath,
    args,
    startUrl: input.startUrl,
    startUrls,
    env: {
      ...process.env,
      ...resolveGoogleApiEnvironment(input.googleApiEnvironment ?? process.env),
      TZ: fingerprintPolicy.timezone
    }
  };
}

function resolveGoogleApiEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const apiKey = environment.FINGERBROWSER_GOOGLE_API_KEY;
  const clientId = environment.FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_ID;
  const clientSecret = environment.FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_SECRET;
  if (!apiKey || !clientId || !clientSecret) {
    return {};
  }
  return {
    GOOGLE_API_KEY: apiKey,
    GOOGLE_DEFAULT_CLIENT_ID: clientId,
    GOOGLE_DEFAULT_CLIENT_SECRET: clientSecret
  };
}

export function writeProxyAuthExtension(options: {
  extensionDir: string;
  proxy: ProxyConfig;
  decryptedPassword: string;
}): string {
  mkdirSync(options.extensionDir, { recursive: true });
  const manifest = {
    manifest_version: 3,
    name: 'FingerBrowser Proxy Auth',
    version: '0.1.0',
    permissions: ['webRequest', 'webRequestAuthProvider'],
    host_permissions: ['<all_urls>'],
    background: {
      service_worker: 'background.js'
    }
  };
  const background = `
chrome.webRequest.onAuthRequired.addListener(
  () => ({
    authCredentials: {
      username: ${JSON.stringify(options.proxy.username)},
      password: ${JSON.stringify(options.decryptedPassword)}
    }
  }),
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);
`.trim();

  writeFileSync(path.join(options.extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(options.extensionDir, 'background.js'), `${background}\n`);
  return options.extensionDir;
}

export class ManagedBrowserController implements BrowserController {
  private readonly running = new Map<string, ChildProcess>();

  constructor(
    private readonly executablePath: string,
    private readonly spawnProcess: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => ChildProcess
  ) {}

  async launch(profile: BrowserProfile, proxy: ProxyConfig | null, options: BrowserLaunchOptions = {}): Promise<BrowserLaunchResult> {
    const plan = buildChromiumLaunchPlan({
      executablePath: this.executablePath,
      profile,
      proxy,
      kernelPolicyPath: profile.runtimeChannel === 'custom-kernel' ? writeKernelPolicyFile(profile) : undefined,
      startUrls: options.startUrls
    });
    const child = this.spawnProcess(plan.executablePath, plan.args, { env: plan.env });
    this.running.set(profile.id, child);
    child.once('exit', () => this.running.delete(profile.id));
    return {
      pid: child.pid ?? 0,
      runtimeChannel: profile.runtimeChannel,
      kernelPolicyPath: profile.runtimeChannel === 'custom-kernel' ? path.join(profile.userDataDir, 'fingerbrowser_policy.json') : undefined
    };
  }

  async stop(profileId: string): Promise<void> {
    const child = this.running.get(profileId);
    if (child) {
      child.kill();
      this.running.delete(profileId);
    }
  }

  has(profileId: string): boolean {
    return this.running.has(profileId);
  }
}

export class MockBrowserController implements BrowserController {
  private readonly running = new Set<string>();

  constructor(
    private readonly dataDir?: string,
    private readonly localProxyManager?: LocalProxyManager,
    private readonly decryptSecret?: (value: string) => string
  ) {}

  async launch(profile: BrowserProfile, proxy: ProxyConfig | null): Promise<BrowserLaunchResult> {
    this.running.add(profile.id);
    const localProxy = proxy
      ? await this.localProxyManager?.start(profile.id, {
          scheme: proxy.scheme,
          host: proxy.host,
          port: proxy.port,
          ...(proxy.username ? { username: proxy.username } : {}),
          ...(proxy.encryptedPassword && this.decryptSecret ? { password: this.decryptSecret(proxy.encryptedPassword) } : {})
        })
      : undefined;
    if (this.dataDir) {
      writeEnvironmentCheckPage({
        dataDir: this.dataDir,
        fingerprintPolicy: profile.fingerprintPolicy
      });
    }
    const kernelPolicyPath = profile.runtimeChannel === 'custom-kernel' ? writeKernelPolicyFile(profile) : undefined;
    return {
      pid: 4242,
      runtimeChannel: profile.runtimeChannel,
      localProxy,
      kernelPolicyPath,
      kernelVersion: profile.runtimeChannel === 'custom-kernel' ? 'e2e-kernel' : undefined
    };
  }

  async stop(profileId: string): Promise<void> {
    this.running.delete(profileId);
    await this.localProxyManager?.stop(profileId);
  }

  has(profileId: string): boolean {
    return this.running.has(profileId);
  }
}
