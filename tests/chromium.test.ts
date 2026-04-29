import { describe, expect, it } from 'vitest';
import { buildChromiumLaunchPlan } from '../src/main/domain/chromium';
import type { BrowserProfile, ProxyConfig } from '../src/shared/types';

function createTestProfile(runtimeChannel: BrowserProfile['runtimeChannel'] = 'official'): BrowserProfile {
  return {
    id: 'profile-1',
    name: '运营环境 1',
    tags: ['合规'],
    status: 'closed',
    userDataDir: '/tmp/fingerbrowser/profile-1',
    chromiumVersion: 'stable',
    runtimeChannel,
    fingerprintPolicy: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      windowSize: { width: 1360, height: 900 },
      permissionDefaults: 'deny',
      webrtcIpPolicy: 'disable_non_proxied_udp'
    },
    proxyId: 'proxy-1',
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z'
  };
}

describe('Chromium launch planning', () => {
  it('builds privacy-normalized launch args without leaking proxy credentials', () => {
    const profile = createTestProfile();
    const proxy: ProxyConfig = {
      id: 'proxy-1',
      scheme: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: 'operator',
      encryptedPassword: 'encrypted-password',
      bypassList: ['localhost'],
      lastTestStatus: 'passed'
    };

    const plan = buildChromiumLaunchPlan({
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      profile,
      proxy,
      proxyAuthExtensionDir: '/tmp/fingerbrowser/proxy-ext/profile-1'
    });

    expect(plan.args).toContain('--user-data-dir=/tmp/fingerbrowser/profile-1');
    expect(plan.args).toContain('--lang=zh-CN');
    expect(plan.args).toContain('--window-size=1360,900');
    expect(plan.args).toContain('--deny-permission-prompts');
    expect(plan.args).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    expect(plan.args).toContain('--proxy-server=http://127.0.0.1:8080');
    expect(plan.args).toContain('--proxy-bypass-list=localhost');
    expect(plan.env.TZ).toBe('Asia/Shanghai');
    expect(JSON.stringify(plan)).not.toContain('encrypted-password');
  });

  it('opens the local environment check page as the first tab when provided', () => {
    const profile = createTestProfile('custom-kernel');

    const plan = buildChromiumLaunchPlan({
      executablePath: '/Applications/FingerBrowser Kernel.app/Contents/MacOS/Chromium',
      profile,
      proxy: null,
      kernelPolicyPath: '/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json',
      startUrl: 'file:///tmp/fingerbrowser/environment-check/environment-check.html'
    });

    expect(plan.startUrl).toBe('file:///tmp/fingerbrowser/environment-check/environment-check.html');
    expect(plan.args.at(-1)).toBe('file:///tmp/fingerbrowser/environment-check/environment-check.html');
    expect(plan.args).toContain('--fingerbrowser-policy=/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json');
  });
});
