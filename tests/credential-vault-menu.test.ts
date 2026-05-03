import { describe, expect, it } from 'vitest';
import type { CredentialEntry, ProfileDetails } from '../src/shared/types';
import {
  buildCredentialVaultMenu,
  filterCredentialVaultItems,
  getCredentialVaultListInput,
  sortRecentlyCopiedCredentials
} from '../src/renderer/src/credential-vault';

function credential(input: Partial<CredentialEntry> & Pick<CredentialEntry, 'id' | 'title'>): CredentialEntry {
  return {
    profileId: null,
    profileName: null,
    websiteUrl: '',
    username: '',
    createdAt: '2026-04-29T08:00:00.000Z',
    updatedAt: '2026-04-29T08:00:00.000Z',
    lastCopiedAt: null,
    ...input
  };
}

function profile(id: string, name: string): ProfileDetails {
  return {
    id,
    name,
    groupName: '',
    tags: [],
    status: 'closed',
    userDataDir: `/tmp/${id}`,
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
    createdAt: '2026-04-29T08:00:00.000Z',
    updatedAt: '2026-04-29T08:00:00.000Z'
  };
}

describe('credential vault menu helpers', () => {
  it('builds 1Password-style menu groups from credentials and profiles', () => {
    const profiles = [profile('profile-a', '环境 A'), profile('profile-b', '环境 B')];
    const credentials = [
      credential({ id: 'one', title: 'Admin', profileId: 'profile-a', profileName: '环境 A' }),
      credential({ id: 'two', title: 'Mail' }),
      credential({
        id: 'three',
        title: 'CRM',
        profileId: 'profile-b',
        profileName: '环境 B',
        lastCopiedAt: '2026-04-29T08:10:00.000Z'
      })
    ];

    expect(buildCredentialVaultMenu(credentials, profiles)).toEqual([
      { id: 'all', label: '全部密码', count: 3, kind: 'system' },
      { id: 'unbound', label: '未绑定环境', count: 1, kind: 'system' },
      { id: 'bound', label: '已绑定环境', count: 2, kind: 'system' },
      { id: 'recent', label: '最近复制', count: 1, kind: 'system' },
      { id: 'profile:profile-a', label: '环境 A', count: 1, kind: 'profile', profileId: 'profile-a' },
      { id: 'profile:profile-b', label: '环境 B', count: 1, kind: 'profile', profileId: 'profile-b' }
    ]);
  });

  it('maps menu selections to credential list IPC input', () => {
    expect(getCredentialVaultListInput('all')).toEqual({});
    expect(getCredentialVaultListInput('unbound')).toEqual({ binding: 'unbound' });
    expect(getCredentialVaultListInput('bound')).toEqual({ binding: 'bound' });
    expect(getCredentialVaultListInput('profile:profile-a')).toEqual({ profileId: 'profile-a' });
    expect(getCredentialVaultListInput('recent')).toEqual({});
  });

  it('filters credentials by searchable fields without exposing passwords', () => {
    const credentials = [
      credential({ id: 'one', title: 'Admin', websiteUrl: 'https://admin.test', username: 'alice' }),
      credential({ id: 'two', title: 'Mail', websiteUrl: 'https://mail.test', username: 'bob', profileName: '环境 B' })
    ];

    expect(filterCredentialVaultItems(credentials, 'mail').map((item) => item.id)).toEqual(['two']);
    expect(filterCredentialVaultItems(credentials, '环境 b').map((item) => item.id)).toEqual(['two']);
    expect(filterCredentialVaultItems(credentials, '').map((item) => item.id)).toEqual(['one', 'two']);
  });

  it('sorts recently copied credentials newest first and hides never-copied items', () => {
    const credentials = [
      credential({ id: 'one', title: 'Old', lastCopiedAt: '2026-04-29T08:00:00.000Z' }),
      credential({ id: 'two', title: 'Never' }),
      credential({ id: 'three', title: 'New', lastCopiedAt: '2026-04-29T08:30:00.000Z' })
    ];

    expect(sortRecentlyCopiedCredentials(credentials).map((item) => item.id)).toEqual(['three', 'one']);
  });
});
