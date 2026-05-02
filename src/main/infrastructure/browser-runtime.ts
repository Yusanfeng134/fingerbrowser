import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { BrowserProfile, ProxyConfig } from '../../shared/types';
import {
  buildChromiumLaunchPlan,
  type BrowserLaunchOptions,
  type BrowserLaunchResult,
  type BrowserController,
  MockBrowserController
} from '../domain/chromium';
import type { SecretBox } from '../domain/encryption';
import { writeEnvironmentCheckPage } from '../domain/environment-check-page';
import { writeKernelPolicyFile, type KernelRuntimeManager } from '../domain/kernel-runtime';
import type { LocalProxyManager } from '../domain/local-proxy';
import type { ChromiumInstaller } from './chromium-installer';

export function createBrowserController(options: {
  chromiumInstaller: ChromiumInstaller;
  kernelRuntimeManager: KernelRuntimeManager;
  localProxyManager: LocalProxyManager;
  dataDir: string;
  secretBox: SecretBox;
  isE2E: boolean;
}): BrowserController {
  if (options.isE2E) {
    return new MockBrowserController(options.dataDir, options.localProxyManager, (value) => options.secretBox.decrypt(value));
  }
  return new ExternalChromiumController(
    options.chromiumInstaller,
    options.kernelRuntimeManager,
    options.localProxyManager,
    options.dataDir,
    options.secretBox
  );
}

class ExternalChromiumController implements BrowserController {
  private readonly running = new Map<string, ChildProcess>();

  constructor(
    private readonly chromiumInstaller: ChromiumInstaller,
    private readonly kernelRuntimeManager: KernelRuntimeManager,
    private readonly localProxyManager: LocalProxyManager,
    private readonly dataDir: string,
    private readonly secretBox: SecretBox
  ) {}

  async launch(profile: BrowserProfile, proxy: ProxyConfig | null, options: BrowserLaunchOptions = {}): Promise<BrowserLaunchResult> {
    const officialInstallation = profile.runtimeChannel === 'official' ? await this.chromiumInstaller.ensureInstalled() : null;
    const kernelInstallation =
      profile.runtimeChannel === 'custom-kernel' ? await this.kernelRuntimeManager.ensureInstalled() : null;
    let localProxy = undefined as Awaited<ReturnType<LocalProxyManager['start']>> | undefined;
    let kernelPolicyPath: string | undefined;

    if (proxy) {
      localProxy = await this.localProxyManager.start(profile.id, {
        scheme: proxy.scheme,
        host: proxy.host,
        port: proxy.port,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.encryptedPassword ? { password: this.secretBox.decrypt(proxy.encryptedPassword) } : {})
      });
    }

    mkdirSync(profile.userDataDir, { recursive: true });
    if (profile.runtimeChannel === 'custom-kernel') {
      kernelPolicyPath = writeKernelPolicyFile(profile);
    }
    const environmentCheckPage = writeEnvironmentCheckPage({
      dataDir: this.dataDir,
      fingerprintPolicy: profile.fingerprintPolicy,
      proxyDiagnostic: options.proxyDiagnostic
    });
    const plan = buildChromiumLaunchPlan({
      executablePath: kernelInstallation?.executablePath ?? officialInstallation?.executablePath ?? '',
      profile,
      proxy,
      proxyServerOverride: localProxy ? `http://${localProxy.listenHost}:${localProxy.listenPort}` : undefined,
      kernelPolicyPath,
      googleApiEnvironment: options.googleApiEnvironment,
      startUrl: environmentCheckPage.url,
      startUrls: options.startUrls
    });
    const child = spawn(plan.executablePath, plan.args, {
      env: plan.env,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    this.running.set(profile.id, child);
    child.once('exit', () => {
      this.running.delete(profile.id);
      void this.localProxyManager.stop(profile.id);
    });
    return {
      pid: child.pid ?? 0,
      runtimeChannel: profile.runtimeChannel,
      localProxy,
      kernelPolicyPath,
      kernelVersion: kernelInstallation?.manifest.version
    };
  }

  async stop(profileId: string): Promise<void> {
    const child = this.running.get(profileId);
    if (!child) {
      return;
    }
    child.kill();
    this.running.delete(profileId);
    await this.localProxyManager.stop(profileId);
  }

  has(profileId: string): boolean {
    return this.running.has(profileId);
  }
}
