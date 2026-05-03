import type { ProfileDetails, ProfileStatus, ProxyTestStatus, RuntimeChannel } from '../../shared/types';

export type WorkbenchStatusFilter = 'all' | ProfileStatus;
export type WorkbenchRuntimeFilter = 'all' | RuntimeChannel;
export type WorkbenchProxyFilter = 'all' | 'configured' | 'missing' | ProxyTestStatus;

export interface ProfileWorkbenchFilters {
  query?: string;
  groupName?: string;
  status?: WorkbenchStatusFilter;
  runtimeChannel?: WorkbenchRuntimeFilter;
  proxy?: WorkbenchProxyFilter;
}

export function splitWorkbenchCsv(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function getProfileGroupOptions(profiles: ProfileDetails[]): string[] {
  return [...new Set(profiles.map((profile) => profile.groupName.trim()).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, 'zh-CN')
  );
}

export function reconcileSelectedProfileIds(selectedIds: string[], visibleProfiles: ProfileDetails[]): string[] {
  const visibleIds = new Set(visibleProfiles.map((profile) => profile.id));
  return selectedIds.filter((id) => visibleIds.has(id));
}

export function filterWorkbenchProfiles(
  profiles: ProfileDetails[],
  filters: ProfileWorkbenchFilters = {}
): ProfileDetails[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  return profiles.filter((profile) => {
    if (filters.groupName && profile.groupName !== filters.groupName) {
      return false;
    }
    if (filters.status && filters.status !== 'all' && profile.status !== filters.status) {
      return false;
    }
    if (filters.runtimeChannel && filters.runtimeChannel !== 'all' && profile.runtimeChannel !== filters.runtimeChannel) {
      return false;
    }
    if (!matchesProxyFilter(profile, filters.proxy ?? 'all')) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [
      profile.name,
      profile.groupName,
      profile.tags.join(','),
      profile.proxy?.host ?? '',
      profile.proxy?.scheme ?? '',
      profile.status,
      profile.runtimeChannel
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function matchesProxyFilter(profile: ProfileDetails, filter: WorkbenchProxyFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'configured') {
    return Boolean(profile.proxy);
  }
  if (filter === 'missing') {
    return !profile.proxy;
  }
  return profile.proxy?.lastTestStatus === filter;
}
