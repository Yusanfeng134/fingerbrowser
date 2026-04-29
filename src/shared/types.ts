export type ProfileStatus = 'closed' | 'running' | 'error';
export type ProxyScheme = 'http' | 'https' | 'socks5';
export type ProxyTestStatus = 'untested' | 'testing' | 'passed' | 'failed';
export type PermissionDefault = 'ask' | 'deny';
export type WebRtcIpPolicy = 'default' | 'disable_non_proxied_udp';
export type LicensePlanId = 'trial' | 'pro' | 'team';
export type LicenseStatus = 'inactive' | 'active' | 'grace' | 'expired';
export type ReleaseStatus = 'up-to-date' | 'update-available' | 'unavailable' | 'error';
export type FeedbackIssueType = 'bug' | 'setup' | 'feature' | 'other';
export type FeedbackSeverity = 'low' | 'medium' | 'high';
export type TrialMetricKey =
  | 'activationCount'
  | 'profileCreateCount'
  | 'browserLaunchCount'
  | 'proxyTestCount'
  | 'feedbackPackageCount'
  | 'updateCheckCount';
export type AuditAction =
  | 'PROFILE_CREATED'
  | 'PROFILE_UPDATED'
  | 'PROFILE_LAUNCHED'
  | 'PROFILE_STOPPED'
  | 'PROXY_CREATED'
  | 'PROXY_UPDATED'
  | 'PROXY_TESTED'
  | 'CHROMIUM_INSTALLED'
  | 'LICENSE_ACTIVATED'
  | 'LICENSE_REFRESHED'
  | 'LICENSE_DEACTIVATED'
  | 'AUDIT_EXPORTED'
  | 'PROFILES_EXPORTED'
  | 'SUPPORT_LOGS_PACKAGED'
  | 'CREDENTIAL_CREATED'
  | 'CREDENTIAL_UPDATED'
  | 'CREDENTIAL_DELETED'
  | 'CREDENTIAL_USERNAME_COPIED'
  | 'CREDENTIAL_PASSWORD_COPIED'
  | 'FEEDBACK_PACKAGED'
  | 'UPDATE_CHECKED'
  | 'ERROR_RECORDED';

export interface LicensePlan {
  id: LicensePlanId;
  name: string;
  seatLimit: number;
  profileLimit: number;
  supportLevel: 'community' | 'standard' | 'priority';
}

export interface LicenseActivationPayload {
  codeId: string;
  teamName: string;
  plan: LicensePlan;
  issuedAt: string;
  expiresAt: string;
}

export interface LicenseState {
  status: LicenseStatus;
  teamName: string;
  deviceId: string;
  activationToken?: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string;
  checkedAt: string;
  daysRemaining: number;
}

export type RedactedLicenseState = Omit<LicenseState, 'activationToken'> & {
  activationToken?: '[redacted]';
};

export interface ActivateLicenseInput {
  activationCode: string;
}

export interface UsageSummary {
  profilesUsed: number;
  profileLimit: number;
  seatsUsed: number;
  seatLimit: number;
}

export interface FingerprintPolicy {
  locale: string;
  timezone: string;
  windowSize: {
    width: number;
    height: number;
  };
  permissionDefaults: PermissionDefault;
  webrtcIpPolicy: WebRtcIpPolicy;
}

export interface ProxyConfig {
  id: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  bypassList: string[];
  lastTestStatus: ProxyTestStatus;
}

export interface BrowserProfile {
  id: string;
  name: string;
  tags: string[];
  status: ProfileStatus;
  userDataDir: string;
  chromiumVersion: string;
  fingerprintPolicy: FingerprintPolicy;
  proxyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDetails extends BrowserProfile {
  proxy: ProxyConfig | null;
}

export interface AuditEvent {
  id: string;
  profileId: string | null;
  action: AuditAction;
  actor: 'local-user';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CredentialEntry {
  id: string;
  profileId: string;
  title: string;
  websiteUrl: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastCopiedAt: string | null;
}

export interface CreateCredentialInput {
  profileId: string;
  title: string;
  websiteUrl: string;
  username: string;
  password: string;
}

export interface UpdateCredentialInput {
  id: string;
  title: string;
  websiteUrl: string;
  username: string;
  password?: string;
}

export interface CredentialCopyResult {
  id: string;
  profileId: string;
  copiedAt: string;
}

export interface AppVersionInfo {
  version: string;
  channel: 'trial';
  releaseUrl: string;
}

export interface ReleaseCheckResult {
  status: ReleaseStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  assetName?: string;
  downloadUrl?: string;
  message: string;
  checkedAt: string;
}

export interface OnboardingItem {
  id:
    | 'activate-license'
    | 'create-profile'
    | 'configure-proxy'
    | 'save-password'
    | 'launch-browser'
    | 'package-feedback';
  label: string;
  completed: boolean;
}

export interface OnboardingStatus {
  dismissed: boolean;
  dismissedAt: string | null;
  items: OnboardingItem[];
  completedCount: number;
  totalCount: number;
}

export interface TrialMetrics {
  activationCount: number;
  profileCreateCount: number;
  browserLaunchCount: number;
  proxyTestCount: number;
  feedbackPackageCount: number;
  updateCheckCount: number;
  profileCount: number;
  credentialCount: number;
  updatedAt: string;
}

export interface FeedbackPackageInput {
  issueType: FeedbackIssueType;
  severity: FeedbackSeverity;
  teamName: string;
  contact: string;
  description: string;
  includeDiagnostics: boolean;
}

export interface CreateProxyInput {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
  bypassList?: string[];
}

export interface CreateProfileInput {
  name: string;
  tags?: string[];
  fingerprintPolicy?: Partial<FingerprintPolicy>;
  proxy?: CreateProxyInput;
}

export interface UpdateProfileInput {
  id: string;
  name: string;
  tags: string[];
  fingerprintPolicy: FingerprintPolicy;
  proxy?: CreateProxyInput | null;
}

export interface ProxyConnectionInput {
  scheme: ProxyScheme;
  host: string;
  port: number;
  timeoutMs?: number;
}

export interface ProxyTestResult {
  status: Exclude<ProxyTestStatus, 'untested' | 'testing'>;
  message: string;
  testedAt: string;
}

export interface ChromiumInstallResult {
  executablePath: string;
  version: string;
  alreadyInstalled: boolean;
}

export interface LaunchResult {
  profileId: string;
  pid: number;
  status: 'running';
}

export interface StopResult {
  profileId: string;
  status: 'closed';
}

export interface ExportResult {
  filePath: string;
}

export interface AppApi {
  profiles: {
    list: () => Promise<ProfileDetails[]>;
    create: (input: CreateProfileInput) => Promise<ProfileDetails>;
    bulkCreate: (inputs: CreateProfileInput[]) => Promise<ProfileDetails[]>;
    update: (input: UpdateProfileInput) => Promise<ProfileDetails>;
    export: () => Promise<ExportResult>;
    launch: (profileId: string) => Promise<LaunchResult>;
    stop: (profileId: string) => Promise<StopResult>;
  };
  proxy: {
    test: (input: ProxyConnectionInput & { profileId?: string }) => Promise<ProxyTestResult>;
    testAll: () => Promise<Array<{ profileId: string; result: ProxyTestResult }>>;
  };
  audit: {
    list: (profileId?: string) => Promise<AuditEvent[]>;
    export: (profileId?: string) => Promise<ExportResult>;
  };
  chromium: {
    ensureInstalled: () => Promise<ChromiumInstallResult>;
  };
  app: {
    version: () => Promise<AppVersionInfo>;
  };
  release: {
    checkForUpdates: () => Promise<ReleaseCheckResult>;
    openLatestRelease: () => Promise<{ releaseUrl: string }>;
  };
  onboarding: {
    status: () => Promise<OnboardingStatus>;
    dismiss: () => Promise<OnboardingStatus>;
    reset: () => Promise<OnboardingStatus>;
  };
  trial: {
    metrics: () => Promise<TrialMetrics>;
  };
  feedback: {
    package: (input: FeedbackPackageInput) => Promise<ExportResult>;
  };
  credentials: {
    list: (profileId: string) => Promise<CredentialEntry[]>;
    create: (input: CreateCredentialInput) => Promise<CredentialEntry>;
    update: (input: UpdateCredentialInput) => Promise<CredentialEntry>;
    delete: (id: string) => Promise<{ id: string }>;
    copyUsername: (id: string) => Promise<CredentialCopyResult>;
    copyPassword: (id: string) => Promise<CredentialCopyResult>;
  };
  license: {
    activate: (input: ActivateLicenseInput) => Promise<RedactedLicenseState>;
    status: () => Promise<RedactedLicenseState>;
    refresh: () => Promise<RedactedLicenseState>;
    deactivate: () => Promise<RedactedLicenseState>;
    usage: () => Promise<UsageSummary>;
  };
  support: {
    packageLogs: () => Promise<ExportResult>;
  };
}
