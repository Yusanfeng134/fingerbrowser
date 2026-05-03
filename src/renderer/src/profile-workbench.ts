import type { ProfileDetails, ProfileStatus, ProxyTestStatus, RuntimeChannel } from '../../shared/types';
import { getProfileHealth } from './profile-health';
import type { ProfileHealthStatus } from './profile-health';

export type WorkbenchStatusFilter = 'all' | ProfileStatus;
export type WorkbenchRuntimeFilter = 'all' | RuntimeChannel;
export type WorkbenchProxyFilter = 'all' | 'configured' | 'missing' | ProxyTestStatus;
export type WorkbenchArchiveFilter = 'active' | 'archived' | 'all';
export type WorkbenchHealthFilter = 'all' | ProfileHealthStatus;

export interface ProfileWorkbenchFilters {
  query?: string;
  groupName?: string;
  status?: WorkbenchStatusFilter;
  runtimeChannel?: WorkbenchRuntimeFilter;
  proxy?: WorkbenchProxyFilter;
  archive?: WorkbenchArchiveFilter;
  health?: WorkbenchHealthFilter;
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
  filters: ProfileWorkbenchFilters = {},
  now: Date = new Date()
): ProfileDetails[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const healthFilter = filters.health ?? 'all';
  return profiles.filter((profile) => {
    if (healthFilter !== 'archived' && !matchesArchiveFilter(profile, filters.archive ?? 'active')) {
      return false;
    }
    const health = getProfileHealth(profile, now);
    if (healthFilter !== 'all' && health.status !== healthFilter) {
      return false;
    }
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
      profile.owner,
      profile.notes,
      profile.groupName,
      profile.tags.join(','),
      profile.proxy?.host ?? '',
      profile.proxy?.scheme ?? '',
      profile.status,
      profile.lastLaunchedAt ?? '',
      profile.archivedAt ? 'archived 归档' : 'active',
      profile.runtimeChannel
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function matchesArchiveFilter(profile: ProfileDetails, filter: WorkbenchArchiveFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  const archived = Boolean(profile.archivedAt);
  return filter === 'archived' ? archived : !archived;
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
