import { describe, expect, it } from 'vitest';
import type { ProfileDetails } from '../src/shared/types';
import {
  filterWorkbenchProfiles,
  getProfileGroupOptions,
  reconcileSelectedProfileIds,
  splitWorkbenchCsv
} from '../src/renderer/src/profile-workbench';

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

describe('profile workbench helpers', () => {
  const profiles = [
    profile({
      id: 'p1',
      name: '洛杉矶广告环境',
      owner: 'Alice',
      notes: '投放项目主环境',
      groupName: '广告项目',
      tags: ['US', '核心'],
      status: 'running',
      runtimeChannel: 'custom-kernel',
      lastLaunchedAt: '2026-05-03T08:00:00.000Z',
      proxyId: 'proxy-1',
      proxy: {
        id: 'proxy-1',
        scheme: 'http',
        host: 'la.example.test',
        port: 8080,
        username: '',
        encryptedPassword: 'v1:encrypted',
        bypassList: [],
        lastTestStatus: 'passed'
      }
    }),
    profile({
      id: 'p2',
      name: '芝加哥 CRM',
      groupName: '销售项目',
      tags: ['US'],
      status: 'closed',
      proxyId: 'proxy-2',
      proxy: {
        id: 'proxy-2',
        scheme: 'socks5',
        host: 'chi.example.test',
        port: 1080,
        username: '',
        encryptedPassword: 'v1:encrypted',
        bypassList: [],
        lastTestStatus: 'failed'
      }
    }),
    profile({
      id: 'p3',
      name: '东京客服',
      groupName: '',
      tags: ['JP'],
      status: 'closed'
    }),
    profile({
      id: 'p4',
      name: '归档环境',
      groupName: '广告项目',
      tags: ['old'],
      status: 'closed',
      archivedAt: '2026-05-03T01:00:00.000Z'
    })
  ];

  it('builds sorted non-empty group options', () => {
    expect(getProfileGroupOptions(profiles)).toEqual(['广告项目', '销售项目']);
  });

  it('filters by query, group, status, runtime channel, and proxy state', () => {
    expect(
      filterWorkbenchProfiles(profiles, {
        query: '核心',
        groupName: '广告项目',
        status: 'running',
        runtimeChannel: 'custom-kernel',
        proxy: 'passed'
      }).map((item) => item.id)
    ).toEqual(['p1']);

    expect(filterWorkbenchProfiles(profiles, { proxy: 'missing' }).map((item) => item.id)).toEqual(['p3']);
    expect(filterWorkbenchProfiles(profiles, { proxy: 'failed' }).map((item) => item.id)).toEqual(['p2']);
    expect(filterWorkbenchProfiles(profiles, { query: 'crm' }).map((item) => item.id)).toEqual(['p2']);
  });

  it('filters by derived health status', () => {
    const now = new Date('2026-05-03T12:00:00.000Z');

    expect(filterWorkbenchProfiles(profiles, { health: 'ready' }, now).map((item) => item.id)).toEqual(['p1']);
    expect(filterWorkbenchProfiles(profiles, { health: 'attention' }, now).map((item) => item.id)).toEqual(['p2', 'p3']);
    expect(filterWorkbenchProfiles(profiles, { health: 'archived' }, now).map((item) => item.id)).toEqual(['p4']);
  });

  it('filters by derived health issue category', () => {
    const now = new Date('2026-05-03T12:00:00.000Z');

    expect(filterWorkbenchProfiles(profiles, { healthIssue: 'proxy' }, now).map((item) => item.id)).toEqual(['p2', 'p3']);
    expect(
      filterWorkbenchProfiles(profiles, { healthIssue: 'owner', groupName: '销售项目' }, now).map((item) => item.id)
    ).toEqual(['p2']);
    expect(filterWorkbenchProfiles(profiles, { healthIssue: 'launch', archive: 'all' }, now).map((item) => item.id)).toEqual([
      'p2',
      'p3'
    ]);
  });

  it('hides archived profiles by default and can show archived or all profiles', () => {
    expect(filterWorkbenchProfiles(profiles).map((item) => item.id)).toEqual(['p1', 'p2', 'p3']);
    expect(filterWorkbenchProfiles(profiles, { archive: 'archived' }).map((item) => item.id)).toEqual(['p4']);
    expect(filterWorkbenchProfiles(profiles, { archive: 'all' }).map((item) => item.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('reconciles selected ids to visible profiles only and parses CSV values', () => {
    expect(reconcileSelectedProfileIds(['p1', 'p3', 'unknown'], [profiles[0], profiles[1]])).toEqual(['p1']);
    expect(splitWorkbenchCsv(' US, 核心,US ,, 销售 ')).toEqual(['US', '核心', '销售']);
  });

  it('searches owner, notes, and launch metadata', () => {
    const assetProfile = profile({
      id: 'asset',
      name: '销售资产环境',
      owner: 'Alice Ops',
      notes: '试卖客户跟进',
      lastLaunchedAt: '2026-05-03T08:00:00.000Z'
    });

    expect(filterWorkbenchProfiles([assetProfile], { query: 'alice' }).map((item) => item.id)).toEqual(['asset']);
    expect(filterWorkbenchProfiles([assetProfile], { query: '客户跟进' }).map((item) => item.id)).toEqual(['asset']);
    expect(filterWorkbenchProfiles([assetProfile], { query: '2026-05-03' }).map((item) => item.id)).toEqual(['asset']);
  });
});
