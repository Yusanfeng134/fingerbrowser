import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  AppVersionInfo,
  AuditEvent,
  FeedbackPackageInput,
  KernelRuntimeStatus,
  LicenseState,
  OnboardingItem,
  OnboardingStatus,
  ProfileDetails,
  TrialMetricKey,
  TrialMetrics
} from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';

const METRIC_KEYS: TrialMetricKey[] = [
  'activationCount',
  'profileCreateCount',
  'browserLaunchCount',
  'proxyTestCount',
  'feedbackPackageCount',
  'updateCheckCount'
];

interface TrialMetricRow {
  key: TrialMetricKey;
  value: number;
  updated_at: string;
}

interface OnboardingStateRow {
  dismissed_at: string | null;
}

interface CreateTrialServiceOptions {
  db: ApplicationDatabase;
  exportDir: string;
  version: AppVersionInfo;
  now?: () => Date;
}

interface OnboardingInput {
  license: LicenseState;
  profiles: ProfileDetails[];
  audits: AuditEvent[];
  credentialCount: number;
}

interface MetricsInput {
  profileCount: number;
  credentialCount: number;
}

interface FeedbackPackageOptions {
  input: FeedbackPackageInput;
  license: LicenseState | unknown;
  profiles: ProfileDetails[];
  audits: AuditEvent[];
  metrics: TrialMetrics;
  kernel?: KernelRuntimeStatus;
}

export interface TrialService {
  version(): AppVersionInfo;
  incrementMetric(key: TrialMetricKey): void;
  metrics(input: MetricsInput): TrialMetrics;
  onboardingStatus(input: OnboardingInput): OnboardingStatus;
  dismissOnboarding(): void;
  resetOnboarding(): void;
  packageFeedback(options: FeedbackPackageOptions): { filePath: string };
}

export function createTrialService(options: CreateTrialServiceOptions): TrialService {
  const now = options.now ?? (() => new Date());

  function timestamp(): string {
    return now().toISOString();
  }

  function getMetricRows(): Map<TrialMetricKey, TrialMetricRow> {
    const rows = options.db.prepare('select * from trial_metrics').all() as TrialMetricRow[];
    return new Map(rows.map((row) => [row.key, row]));
  }

  function currentDismissedAt(): string | null {
    const row = options.db.prepare('select dismissed_at from onboarding_state where id = 1').get() as
      | OnboardingStateRow
      | undefined;
    return row?.dismissed_at ?? null;
  }

  return {
    version(): AppVersionInfo {
      return options.version;
    },
    incrementMetric(key: TrialMetricKey): void {
      const updatedAt = timestamp();
      options.db
        .prepare(
          `insert into trial_metrics (key, value, updated_at)
           values (?, 1, ?)
           on conflict(key) do update set value = value + 1, updated_at = excluded.updated_at`
        )
        .run(key, updatedAt);
    },
    metrics(input: MetricsInput): TrialMetrics {
      const rows = getMetricRows();
      const values = Object.fromEntries(METRIC_KEYS.map((key) => [key, rows.get(key)?.value ?? 0])) as Record<
        TrialMetricKey,
        number
      >;
      return {
        ...values,
        profileCount: input.profileCount,
        credentialCount: input.credentialCount,
        updatedAt: timestamp()
      };
    },
    onboardingStatus(input: OnboardingInput): OnboardingStatus {
      const hasProxy = input.profiles.some((profile) => profile.proxy);
      const hasProxyTest = input.audits.some((event) => event.action === 'PROXY_TESTED');
      const hasLaunch = input.audits.some((event) => event.action === 'PROFILE_LAUNCHED');
      const hasFeedback = input.audits.some((event) => event.action === 'FEEDBACK_PACKAGED');
      const items: OnboardingItem[] = [
        { id: 'activate-license', label: '激活许可证', completed: input.license.status === 'active' || input.license.status === 'grace' },
        { id: 'create-profile', label: '创建浏览器环境', completed: input.profiles.length > 0 },
        { id: 'configure-proxy', label: '配置并检测代理', completed: hasProxy && hasProxyTest },
        { id: 'save-password', label: '保存环境密码', completed: input.credentialCount > 0 },
        { id: 'launch-browser', label: '启动 Chromium', completed: hasLaunch },
        { id: 'package-feedback', label: '导出反馈包', completed: hasFeedback }
      ];
      const dismissedAt = currentDismissedAt();
      return {
        dismissed: Boolean(dismissedAt),
        dismissedAt,
        items,
        completedCount: items.filter((item) => item.completed).length,
        totalCount: items.length
      };
    },
    dismissOnboarding(): void {
      options.db
        .prepare(
          `insert into onboarding_state (id, dismissed_at)
           values (1, ?)
           on conflict(id) do update set dismissed_at = excluded.dismissed_at`
        )
        .run(timestamp());
    },
    resetOnboarding(): void {
      options.db.prepare('delete from onboarding_state where id = 1').run();
    },
    packageFeedback(feedbackOptions: FeedbackPackageOptions): { filePath: string } {
      mkdirSync(options.exportDir, { recursive: true });
      const filePath = path.join(options.exportDir, `feedback-${timestamp().replace(/[:.]/g, '-')}.json`);
      const safeProfiles = feedbackOptions.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        status: profile.status,
        tagCount: profile.tags.length,
        hasProxy: Boolean(profile.proxy),
        chromiumVersion: profile.chromiumVersion,
        runtimeChannel: profile.runtimeChannel
      }));
      const kernelSummary = feedbackOptions.kernel
        ? {
            runtimeChannel: 'custom-kernel',
            kernelVersion: feedbackOptions.kernel.manifest.version,
            baseChromiumRevision: feedbackOptions.kernel.manifest.baseChromiumRevision,
            patchsetVersion: feedbackOptions.kernel.manifest.patchsetVersion,
            installed: feedbackOptions.kernel.installed,
            source: feedbackOptions.kernel.source,
            policySchemaVersion: feedbackOptions.kernel.manifest.policySchemaVersion
          }
        : {
            runtimeChannel: 'official'
          };
      const payload = redactObject({
        generatedAt: timestamp(),
        version: options.version,
        feedback: feedbackOptions.input,
        license: feedbackOptions.license,
        metrics: feedbackOptions.metrics,
        kernel: kernelSummary,
        diagnostics: feedbackOptions.input.includeDiagnostics
          ? {
              profileCount: feedbackOptions.profiles.length,
              profiles: safeProfiles,
              audits: feedbackOptions.audits
            }
          : {
              profileCount: feedbackOptions.profiles.length
            }
      });
      writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { filePath };
    }
  };
}

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/password|token|secret|encrypted|cookie|cache/i.test(key)) {
          return [key, '[redacted]'];
        }
        return [key, redactObject(entry)];
      })
    );
  }
  if (typeof value === 'string' && /cookie|cache/i.test(value)) {
    return '[redacted]';
  }
  return value;
}
