import type { ProfileDetails } from '../../shared/types';

export type ProfileHealthStatus = 'ready' | 'attention' | 'archived';

export interface ProfileHealthCheck {
  key: 'owner' | 'notes' | 'proxy' | 'launch' | 'archive';
  label: string;
  ok: boolean;
}

export interface ProfileHealthSummary {
  status: ProfileHealthStatus;
  score: number;
  label: string;
  issues: string[];
  checks: ProfileHealthCheck[];
}

export interface ProfileHealthStats {
  ready: number;
  attention: number;
  archived: number;
}

const staleLaunchDays = 14;
const dayMs = 24 * 60 * 60 * 1000;

export function getProfileHealth(profile: ProfileDetails, now: Date = new Date()): ProfileHealthSummary {
  if (profile.archivedAt) {
    return {
      status: 'archived',
      score: 0,
      label: '已归档',
      issues: ['环境已归档'],
      checks: [{ key: 'archive', label: '环境已归档', ok: false }]
    };
  }

  const issues: string[] = [];
  const checks: ProfileHealthCheck[] = [];
  let score = 100;

  applyCheck(Boolean(profile.owner.trim()), 'owner', '负责人', '未设置负责人', 15);
  applyCheck(Boolean(profile.notes.trim()), 'notes', '备注', '未填写备注', 10);
  applyProxyCheck();
  applyLaunchCheck();

  return {
    status: issues.length === 0 ? 'ready' : 'attention',
    score: Math.max(0, score),
    label: issues.length === 0 ? '已就绪' : '待补全',
    issues,
    checks
  };

  function applyCheck(
    ok: boolean,
    key: ProfileHealthCheck['key'],
    label: string,
    issue: string,
    penalty: number
  ): void {
    checks.push({ key, label, ok });
    if (!ok) {
      issues.push(issue);
      score -= penalty;
    }
  }

  function applyProxyCheck(): void {
    if (!profile.proxy) {
      checks.push({ key: 'proxy', label: '代理', ok: false });
      issues.push('未配置代理');
      score -= 25;
      return;
    }

    if (profile.proxy.lastTestStatus === 'failed') {
      checks.push({ key: 'proxy', label: '代理', ok: false });
      issues.push('代理检测失败');
      score -= 25;
      return;
    }

    const tested = profile.proxy.lastTestStatus === 'passed';
    checks.push({ key: 'proxy', label: '代理', ok: tested });
    if (!tested) {
      issues.push(profile.proxy.lastTestStatus === 'testing' ? '代理检测中' : '代理未检测');
      score -= 10;
    }
  }

  function applyLaunchCheck(): void {
    if (!profile.lastLaunchedAt) {
      checks.push({ key: 'launch', label: '最近启动', ok: false });
      issues.push('尚未启动过');
      score -= 15;
      return;
    }

    const launchedAt = new Date(profile.lastLaunchedAt);
    const stale = Number.isNaN(launchedAt.getTime()) || now.getTime() - launchedAt.getTime() > staleLaunchDays * dayMs;
    checks.push({ key: 'launch', label: '最近启动', ok: !stale });
    if (stale) {
      issues.push(`超过 ${staleLaunchDays} 天未启动`);
      score -= 10;
    }
  }
}

export function getProfileHealthStats(profiles: ProfileDetails[], now: Date = new Date()): ProfileHealthStats {
  return profiles.reduce<ProfileHealthStats>(
    (stats, profile) => {
      const health = getProfileHealth(profile, now);
      stats[health.status] += 1;
      return stats;
    },
    { ready: 0, attention: 0, archived: 0 }
  );
}
