import { describe, expect, it } from 'vitest';
import type { ProfileDetails, ProxyTestStatus } from '../src/shared/types';
import { getProfileHealth, getProfileHealthIssueStats, getProfileHealthStats } from '../src/renderer/src/profile-health';

function profile(input: Partial<ProfileDetails> & Pick<ProfileDetails, 'id' | 'name'>): ProfileDetails {
  return {
    groupName: '',
    tags: [],
    status: 'closed',
    userDataDir: `/tmp/${input.id}`,
    chromiumVersion: 'stable',
    runtimeChannel: 'official',
    fingerprintPolicy: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      windowSize: { width: 1280, height: 860 },
      permissionDefaults: 'deny',
      webrtcIpPolicy: 'disable_non_proxied_udp'
    },
    proxyId: null,
    proxy: null,
    owner: '',
    notes: '',
    lastLaunchedAt: null,
    archivedAt: null,
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...input
  };
}

function proxy(lastTestStatus: ProxyTestStatus = 'passed'): NonNullable<ProfileDetails['proxy']> {
  return {
    id: `proxy-${lastTestStatus}`,
    scheme: 'http',
    host: 'proxy.example.test',
    port: 8080,
    username: '',
    encryptedPassword: 'v1:encrypted',
    bypassList: [],
    lastTestStatus
  };
}

describe('profile health helpers', () => {
  const now = new Date('2026-05-03T12:00:00.000Z');

  it('marks complete and recently used profiles as ready', () => {
    const health = getProfileHealth(
      profile({
        id: 'ready',
        name: '完整环境',
        owner: 'Alice',
        notes: '试卖客户',
        proxyId: 'proxy-passed',
        proxy: proxy('passed'),
        lastLaunchedAt: '2026-05-03T10:00:00.000Z'
      }),
      now
    );

    expect(health.status).toBe('ready');
    expect(health.score).toBe(100);
    expect(health.issues).toEqual([]);
    expect(health.label).toBe('已就绪');
  });

  it('surfaces missing asset ownership, notes, proxy, and launch history', () => {
    const health = getProfileHealth(profile({ id: 'missing', name: '待补全环境' }), now);

    expect(health.status).toBe('attention');
    expect(health.score).toBeLessThan(80);
    expect(health.issues).toEqual(['未设置负责人', '未填写备注', '未配置代理', '尚未启动过']);
    expect(health.label).toBe('待补全');
  });

  it('surfaces failed proxy tests and stale launch history', () => {
    const health = getProfileHealth(
      profile({
        id: 'stale',
        name: '过期环境',
        owner: 'Bob',
        notes: '需要复测',
        proxyId: 'proxy-failed',
        proxy: proxy('failed'),
        lastLaunchedAt: '2026-04-01T00:00:00.000Z'
      }),
      now
    );

    expect(health.status).toBe('attention');
    expect(health.issues).toContain('代理检测失败');
    expect(health.issues).toContain('超过 14 天未启动');
  });

  it('marks archived profiles separately from active health checks', () => {
    const health = getProfileHealth(
      profile({
        id: 'archived',
        name: '归档环境',
        archivedAt: '2026-05-02T00:00:00.000Z'
      }),
      now
    );

    expect(health.status).toBe('archived');
    expect(health.score).toBe(0);
    expect(health.issues).toEqual(['环境已归档']);
    expect(health.label).toBe('已归档');
  });

  it('counts ready, attention, and archived profiles', () => {
    const stats = getProfileHealthStats(
      [
        profile({
          id: 'ready',
          name: '完整环境',
          owner: 'Alice',
          notes: '试卖客户',
          proxyId: 'proxy-passed',
          proxy: proxy('passed'),
          lastLaunchedAt: '2026-05-03T10:00:00.000Z'
        }),
        profile({ id: 'attention', name: '待补全环境' }),
        profile({ id: 'archived', name: '归档环境', archivedAt: '2026-05-01T00:00:00.000Z' })
      ],
      now
    );

    expect(stats).toEqual({ ready: 1, attention: 1, archived: 1 });
  });

  it('counts active profile health issue distribution by check category', () => {
    const issueStats = getProfileHealthIssueStats(
      [
        profile({
          id: 'ready',
          name: '完整环境',
          owner: 'Alice',
          notes: '试卖客户',
          proxyId: 'proxy-passed',
          proxy: proxy('passed'),
          lastLaunchedAt: '2026-05-03T10:00:00.000Z'
        }),
        profile({ id: 'missing', name: '待补全环境' }),
        profile({
          id: 'stale',
          name: '过期环境',
          owner: 'Bob',
          notes: '需要复测',
          proxyId: 'proxy-failed',
          proxy: proxy('failed'),
          lastLaunchedAt: '2026-04-01T00:00:00.000Z'
        }),
        profile({ id: 'archived', name: '归档环境', archivedAt: '2026-05-01T00:00:00.000Z' })
      ],
      now
    );

    expect(issueStats).toEqual([
      { key: 'owner', label: '负责人', count: 1 },
      { key: 'notes', label: '备注', count: 1 },
      { key: 'proxy', label: '代理', count: 2 },
      { key: 'launch', label: '启动记录', count: 2 }
    ]);
  });
});
