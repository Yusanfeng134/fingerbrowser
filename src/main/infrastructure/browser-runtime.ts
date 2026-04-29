import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { BrowserProfile, ProxyConfig } from '../../shared/types';
import {
  buildChromiumLaunchPlan,
  type BrowserController,
  MockBrowserController,
  writeProxyAuthExtension
} from '../domain/chromium';
import type { SecretBox } from '../domain/encryption';
import type { ChromiumInstaller } from './chromium-installer';

export function createBrowserController(options: {
  chromiumInstaller: ChromiumInstaller;
  dataDir: string;
  secretBox: SecretBox;
  isE2E: boolean;
}): BrowserController {
  if (options.isE2E) {
    return new MockBrowserController();
  }
  return new ExternalChromiumController(options.chromiumInstaller, options.dataDir, options.secretBox);
}

class ExternalChromiumController implements BrowserController {
  private readonly running = new Map<string, ChildProcess>();

  constructor(
    private readonly chromiumInstaller: ChromiumInstaller,
    private readonly dataDir: string,
    private readonly secretBox: SecretBox
  ) {}

  async launch(profile: BrowserProfile, proxy: ProxyConfig | null): Promise<{ pid: number }> {
    const installation = await this.chromiumInstaller.ensureInstalled();
    let proxyAuthExtensionDir: string | undefined;

    if (proxy?.username && proxy.encryptedPassword) {
      proxyAuthExtensionDir = path.join(this.dataDir, 'proxy-extensions', profile.id);
      writeProxyAuthExtension({
        extensionDir: proxyAuthExtensionDir,
        proxy,
        decryptedPassword: this.secretBox.decrypt(proxy.encryptedPassword)
      });
    }

    mkdirSync(profile.userDataDir, { recursive: true });
    const plan = buildChromiumLaunchPlan({
      executablePath: installation.executablePath,
      profile,
      proxy,
      proxyAuthExtensionDir
    });
    const child = spawn(plan.executablePath, plan.args, {
      env: plan.env,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    this.running.set(profile.id, child);
    child.once('exit', () => this.running.delete(profile.id));
    return { pid: child.pid ?? 0 };
  }

  async stop(profileId: string): Promise<void> {
    const child = this.running.get(profileId);
    if (!child) {
      return;
    }
    child.kill();
    this.running.delete(profileId);
  }

  has(profileId: string): boolean {
    return this.running.has(profileId);
  }
}
