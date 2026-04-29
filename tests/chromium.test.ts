import { describe, expect, it } from 'vitest';
import { buildChromiumLaunchPlan } from '../src/main/domain/chromium';
import type { BrowserProfile, ProxyConfig } from '../src/shared/types';

describe('Chromium launch planning', () => {
  it('builds privacy-normalized launch args without leaking proxy credentials', () => {
    const profile: BrowserProfile = {
      id: 'profile-1',
      name: '运营环境 1',
      tags: ['合规'],
      status: 'closed',
      userDataDir: '/tmp/fingerbrowser/profile-1',
      chromiumVersion: 'stable',
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
});
