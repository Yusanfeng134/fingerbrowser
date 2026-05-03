export type ProfileStatus = 'closed' | 'running' | 'error';
export type ProxyScheme = 'http' | 'https' | 'socks5';
export type ProxyTestStatus = 'untested' | 'testing' | 'passed' | 'failed';
export type PermissionDefault = 'ask' | 'deny';
export type WebRtcIpPolicy = 'default' | 'disable_non_proxied_udp';
export type RuntimeChannel = 'official' | 'custom-kernel';
export type LicensePlanId = 'trial' | 'pro' | 'team';
export type LicenseStatus = 'inactive' | 'active' | 'grace' | 'expired';
export type ReleaseStatus = 'up-to-date' | 'update-available' | 'unavailable' | 'error';
export type KernelManifestSource = 'default' | 'environment' | 'imported';
export type ProxyRuntimeState = 'stopped' | 'running' | 'error';
export type SystemProxySource = 'http' | 'https' | 'socks5' | 'local-scan';
export type FeedbackIssueType = 'bug' | 'setup' | 'feature' | 'other';
export type FeedbackSeverity = 'low' | 'medium' | 'high';
export type UserRole = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled';
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
  | 'DESKTOP_SHORTCUT_CREATED'
  | 'DESKTOP_SHORTCUT_DELETED'
  | 'DESKTOP_SHORTCUT_LAUNCHED'
  | 'DESKTOP_SHORTCUT_MOVED'
  | 'DESKTOP_FOLDER_CREATED'
  | 'DESKTOP_FOLDER_DELETED'
  | 'PROXY_CREATED'
  | 'PROXY_UPDATED'
  | 'PROXY_TESTED'
  | 'LOCAL_PROXY_STARTED'
  | 'LOCAL_PROXY_STOPPED'
  | 'LOCAL_PROXY_ERROR'
  | 'CHROMIUM_INSTALLED'
  | 'KERNEL_INSTALLED'
  | 'KERNEL_MANIFEST_IMPORTED'
  | 'KERNEL_MANIFEST_CLEARED'
  | 'KERNEL_POLICY_APPLIED'
  | 'KERNEL_LAUNCHED'
  | 'GOOGLE_ACCOUNT_CONFIG_UPDATED'
  | 'GOOGLE_ACCOUNT_CONFIG_CLEARED'
  | 'USER_BOOTSTRAPPED'
  | 'USER_LOGGED_IN'
  | 'USER_LOGGED_OUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
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
  | 'CREDENTIAL_PASSWORD_REVEALED'
  | 'SECURITY_LAB_OPENED'
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

export interface ProxyRuntimeStatus {
  profileId: string;
  state: ProxyRuntimeState;
  listenHost: string;
  listenPort: number;
  upstreamScheme?: ProxyScheme;
  upstreamHost?: string;
  startedAt: string | null;
  connectionCount: number;
  failureCount: number;
  lastError?: string;
  lastExitIp?: string;
  lastExitTimezone?: string;
  timezoneMatch?: boolean;
}

export interface SystemProxyCandidate {
  scheme: ProxyScheme;
  host: string;
  port: number;
  source: SystemProxySource;
  bypassList: string[];
}

export interface SystemProxyDetectionResult {
  available: boolean;
  candidates: SystemProxyCandidate[];
  selected?: SystemProxyCandidate;
  message: string;
}

export interface BrowserProfile {
  id: string;
  name: string;
  tags: string[];
  status: ProfileStatus;
  userDataDir: string;
  chromiumVersion: string;
  runtimeChannel: RuntimeChannel;
  fingerprintPolicy: FingerprintPolicy;
  proxyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDetails extends BrowserProfile {
  proxy: ProxyConfig | null;
}

export interface DesktopShortcut {
  id: string;
  profileId: string;
  label: string;
  profileStatus: ProfileStatus;
  runtimeChannel: RuntimeChannel;
  iconVariant: string;
  folderId: string | null;
  folderName: string | null;
  positionIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopFolder {
  id: string;
  name: string;
  shortcutCount: number;
  positionIndex: number;
  createdAt: string;
  updatedAt: string;
}

export type DesktopItem =
  | {
      type: 'shortcut';
      id: string;
      positionIndex: number;
      shortcut: DesktopShortcut;
    }
  | {
      type: 'folder';
      id: string;
      positionIndex: number;
      folder: DesktopFolder;
    };

export interface CreateDesktopShortcutInput {
  profileId: string;
}

export interface CreateDesktopFolderInput {
  name?: string;
}

export interface CreateDesktopFolderFromShortcutsInput {
  sourceShortcutId: string;
  targetShortcutId: string;
  name?: string;
}

export interface MoveDesktopShortcutInput {
  shortcutId: string;
  folderId: string | null;
}

export interface ReorderDesktopItemsInput {
  items: Array<{ type: 'shortcut' | 'folder'; id: string }>;
}

export interface ReorderDesktopFolderShortcutsInput {
  folderId: string;
  shortcutIds: string[];
}

export interface AuditEvent {
  id: string;
  profileId: string | null;
  action: AuditAction;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthStatus {
  bootstrapped: boolean;
  authenticated: boolean;
  currentUser: AppUser | null;
}

export interface BootstrapUserInput {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  id: string;
  displayName?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface CredentialEntry {
  id: string;
  profileId: string | null;
  profileName: string | null;
  title: string;
  websiteUrl: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastCopiedAt: string | null;
}

export interface ListCredentialsInput {
  profileId?: string;
  binding?: 'all' | 'bound' | 'unbound';
}

export interface CreateCredentialInput {
  profileId?: string | null;
  title: string;
  websiteUrl: string;
  username: string;
  password: string;
}

export interface UpdateCredentialInput {
  id: string;
  profileId?: string | null;
  title: string;
  websiteUrl: string;
  username: string;
  password?: string;
}

export interface CredentialCopyResult {
  id: string;
  profileId: string | null;
  copiedAt: string;
}

export interface CredentialRevealResult {
  id: string;
  profileId: string | null;
  password: string;
  revealedAt: string;
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

export interface KernelRuntimeManifest {
  version: string;
  baseChromiumRevision: string;
  patchsetVersion: string;
  platform: 'darwin';
  arch: 'arm64';
  artifactUrl: string;
  sha256: string;
  executableRelativePath: string;
  policySchemaVersion: number;
}

export interface KernelRuntimeStatus {
  manifest: KernelRuntimeManifest;
  installed: boolean;
  executablePath: string;
  runtimeRoot: string;
  source: KernelManifestSource;
  manifestPath: string | null;
  importedAt: string | null;
  lastError?: string;
}

export interface KernelInstallResult extends KernelRuntimeStatus {
  installed: true;
  alreadyInstalled: boolean;
}

export interface KernelOpenRuntimeFolderResult {
  folderPath: string;
}

export interface GoogleAccountConfigStatus {
  enabled: boolean;
  configured: boolean;
  updatedAt: string | null;
}

export interface SaveGoogleAccountConfigInput {
  enabled: boolean;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
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
  runtimeChannel?: RuntimeChannel;
  proxy?: CreateProxyInput;
}

export interface UpdateProfileInput {
  id: string;
  name: string;
  tags: string[];
  fingerprintPolicy: FingerprintPolicy;
  runtimeChannel: RuntimeChannel;
  proxy?: CreateProxyInput | null;
}

export interface ProxyConnectionInput {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
  expectedTimezone?: string;
  timeoutMs?: number;
}

export interface ProxyTestResult {
  status: Exclude<ProxyTestStatus, 'untested' | 'testing'>;
  message: string;
  testedAt: string;
  ip?: string;
  ipTimezone?: string;
  timezoneMatch?: boolean;
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

export interface ChromiumInstallResult {
  executablePath: string;
  version: string;
  alreadyInstalled: boolean;
}

export interface LaunchResult {
  profileId: string;
  pid: number;
  runtimeChannel: RuntimeChannel;
  status: 'running';
  localProxy?: ProxyRuntimeStatus;
}

export interface StopResult {
  profileId: string;
  status: 'closed';
}

export interface ExportResult {
  filePath: string;
}

export interface SecurityLabOpenResult {
  filePath: string;
  url: string;
  boundCredentialCount: number;
}

export interface AppApi {
  auth: {
    status: () => Promise<AuthStatus>;
    bootstrap: (input: BootstrapUserInput) => Promise<AuthStatus>;
    login: (input: LoginInput) => Promise<AuthStatus>;
    logout: () => Promise<AuthStatus>;
  };
  users: {
    list: () => Promise<AppUser[]>;
    create: (input: CreateUserInput) => Promise<AppUser>;
    update: (input: UpdateUserInput) => Promise<AppUser>;
  };
  profiles: {
    list: () => Promise<ProfileDetails[]>;
    create: (input: CreateProfileInput) => Promise<ProfileDetails>;
    bulkCreate: (inputs: CreateProfileInput[]) => Promise<ProfileDetails[]>;
    update: (input: UpdateProfileInput) => Promise<ProfileDetails>;
    export: () => Promise<ExportResult>;
    launch: (profileId: string) => Promise<LaunchResult>;
    stop: (profileId: string) => Promise<StopResult>;
  };
  desktop: {
    list: () => Promise<DesktopShortcut[]>;
    listFolders: () => Promise<DesktopFolder[]>;
    listItems: () => Promise<DesktopItem[]>;
    createShortcut: (input: CreateDesktopShortcutInput) => Promise<DesktopShortcut>;
    createFolder: (input?: CreateDesktopFolderInput) => Promise<DesktopFolder>;
    createFolderFromShortcuts: (input: CreateDesktopFolderFromShortcutsInput) => Promise<DesktopFolder>;
    moveShortcut: (input: MoveDesktopShortcutInput) => Promise<DesktopShortcut>;
    reorderItems: (input: ReorderDesktopItemsInput) => Promise<DesktopItem[]>;
    reorderFolderShortcuts: (input: ReorderDesktopFolderShortcutsInput) => Promise<DesktopShortcut[]>;
    deleteShortcut: (id: string) => Promise<{ id: string }>;
    deleteFolder: (id: string) => Promise<{ id: string }>;
    launchShortcut: (id: string) => Promise<LaunchResult>;
  };
  proxy: {
    test: (input: ProxyConnectionInput & { profileId?: string }) => Promise<ProxyTestResult>;
    testAll: () => Promise<Array<{ profileId: string; result: ProxyTestResult }>>;
    localStatus: (profileId?: string) => Promise<ProxyRuntimeStatus[]>;
    system: () => Promise<SystemProxyDetectionResult>;
    scanLocal: () => Promise<SystemProxyDetectionResult>;
  };
  audit: {
    list: (profileId?: string) => Promise<AuditEvent[]>;
    export: (profileId?: string) => Promise<ExportResult>;
  };
  chromium: {
    ensureInstalled: () => Promise<ChromiumInstallResult>;
  };
  kernel: {
    manifest: () => Promise<KernelRuntimeManifest>;
    status: () => Promise<KernelRuntimeStatus>;
    ensureInstalled: () => Promise<KernelInstallResult>;
    importManifest: (manifestPath?: string) => Promise<KernelRuntimeStatus>;
    clearManifest: () => Promise<KernelRuntimeStatus>;
    openRuntimeFolder: () => Promise<KernelOpenRuntimeFolderResult>;
  };
  googleAccount: {
    status: () => Promise<GoogleAccountConfigStatus>;
    save: (input: SaveGoogleAccountConfigInput) => Promise<GoogleAccountConfigStatus>;
    clear: () => Promise<GoogleAccountConfigStatus>;
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
  securityLab: {
    open: (profileId: string) => Promise<SecurityLabOpenResult>;
  };
  credentials: {
    list: (input?: ListCredentialsInput) => Promise<CredentialEntry[]>;
    create: (input: CreateCredentialInput) => Promise<CredentialEntry>;
    update: (input: UpdateCredentialInput) => Promise<CredentialEntry>;
    delete: (id: string) => Promise<{ id: string }>;
    copyUsername: (id: string) => Promise<CredentialCopyResult>;
    copyPassword: (id: string) => Promise<CredentialCopyResult>;
    revealPassword: (id: string) => Promise<CredentialRevealResult>;
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
