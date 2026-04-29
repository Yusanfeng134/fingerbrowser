import type { CredentialEntry, ListCredentialsInput, ProfileDetails } from '../../shared/types';

export type CredentialVaultMenuId = 'all' | 'unbound' | 'bound' | 'recent' | `profile:${string}`;

export interface CredentialVaultMenuItem {
  id: CredentialVaultMenuId;
  label: string;
  count: number;
  kind: 'system' | 'profile';
  profileId?: string;
}

export function buildCredentialVaultMenu(
  credentials: CredentialEntry[],
  profiles: Pick<ProfileDetails, 'id' | 'name'>[]
): CredentialVaultMenuItem[] {
  const profileCounts = new Map<string, number>();
  for (const credential of credentials) {
    if (credential.profileId) {
      profileCounts.set(credential.profileId, (profileCounts.get(credential.profileId) ?? 0) + 1);
    }
  }

  return [
    { id: 'all', label: '全部密码', count: credentials.length, kind: 'system' },
    { id: 'unbound', label: '未绑定环境', count: credentials.filter((credential) => !credential.profileId).length, kind: 'system' },
    { id: 'bound', label: '已绑定环境', count: credentials.filter((credential) => Boolean(credential.profileId)).length, kind: 'system' },
    { id: 'recent', label: '最近复制', count: credentials.filter((credential) => Boolean(credential.lastCopiedAt)).length, kind: 'system' },
    ...profiles.map((profile) => ({
      id: `profile:${profile.id}` as CredentialVaultMenuId,
      label: profile.name,
      count: profileCounts.get(profile.id) ?? 0,
      kind: 'profile' as const,
      profileId: profile.id
    }))
  ];
}

export function getCredentialVaultListInput(menuId: CredentialVaultMenuId): ListCredentialsInput {
  if (menuId === 'unbound') {
    return { binding: 'unbound' };
  }
  if (menuId === 'bound') {
    return { binding: 'bound' };
  }
  if (menuId.startsWith('profile:')) {
    return { profileId: menuId.replace('profile:', '') };
  }
  return {};
}

export function filterCredentialVaultItems(credentials: CredentialEntry[], query: string): CredentialEntry[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return credentials;
  }
  return credentials.filter((credential) =>
    [credential.title, credential.websiteUrl, credential.username, credential.profileName ?? '']
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  );
}

export function sortRecentlyCopiedCredentials(credentials: CredentialEntry[]): CredentialEntry[] {
  return credentials
    .filter((credential) => Boolean(credential.lastCopiedAt))
    .sort((left, right) => Date.parse(right.lastCopiedAt ?? '') - Date.parse(left.lastCopiedAt ?? ''));
}
