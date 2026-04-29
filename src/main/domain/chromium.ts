import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserProfile, ProxyConfig } from '../../shared/types';
import { formatProxyServer } from './proxy';

export interface ChromiumLaunchPlanInput {
  executablePath: string;
  profile: BrowserProfile;
  proxy: ProxyConfig | null;
  proxyAuthExtensionDir?: string;
}

export interface ChromiumLaunchPlan {
  executablePath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface BrowserController {
  launch(profile: BrowserProfile, proxy: ProxyConfig | null): Promise<{ pid: number }>;
  stop(profileId: string): Promise<void>;
  has(profileId: string): boolean;
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

  if (fingerprintPolicy.permissionDefaults === 'deny') {
    args.push('--deny-permission-prompts');
  }

  if (input.proxy) {
    args.push(`--proxy-server=${formatProxyServer(input.proxy)}`);
    if (input.proxy.bypassList.length > 0) {
      args.push(`--proxy-bypass-list=${input.proxy.bypassList.join(';')}`);
    }
    if (input.proxy.username && input.proxyAuthExtensionDir) {
      args.push(`--load-extension=${input.proxyAuthExtensionDir}`);
    }
  }

  return {
    executablePath: input.executablePath,
    args,
    env: {
      ...process.env,
      TZ: fingerprintPolicy.timezone
    }
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

  async launch(profile: BrowserProfile, proxy: ProxyConfig | null): Promise<{ pid: number }> {
    const plan = buildChromiumLaunchPlan({
      executablePath: this.executablePath,
      profile,
      proxy
    });
    const child = this.spawnProcess(plan.executablePath, plan.args, { env: plan.env });
    this.running.set(profile.id, child);
    child.once('exit', () => this.running.delete(profile.id));
    return { pid: child.pid ?? 0 };
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

  async launch(profile: BrowserProfile): Promise<{ pid: number }> {
    this.running.add(profile.id);
    return { pid: 4242 };
  }

  async stop(profileId: string): Promise<void> {
    this.running.delete(profileId);
  }

  has(profileId: string): boolean {
    return this.running.has(profileId);
  }
}
