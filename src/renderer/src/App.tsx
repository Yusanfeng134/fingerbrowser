import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Clipboard,
  ClipboardCheck,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  MessageSquare,
  PackageCheck,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Wifi,
  X
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FINGERPRINT_POLICY } from '../../shared/defaults';
import { TIMEZONE_OPTION_GROUPS } from '../../shared/timezones';
import type {
  AuditEvent,
  AppVersionInfo,
  AppUser,
  AuthStatus,
  BrowserProfile,
  CredentialEntry,
  KernelRuntimeManifest,
  KernelManifestSource,
  KernelRuntimeStatus,
  FeedbackIssueType,
  FeedbackSeverity,
  GoogleAccountConfigStatus,
  CreateProfileInput,
  FingerprintPolicy,
  ProfileTemplate,
  ProfileDetails,
  ProxyPoolEntry,
  ProxyRuntimeStatus,
  ProxyScheme,
  RedactedLicenseState,
  ReleaseCheckResult,
  RuntimeChannel,
  SystemProxyDetectionResult,
  SyncStatus,
  TrialMetrics,
  UserRole,
  UpdateProfileInput,
  UsageSummary,
  DesktopFolder,
  DesktopItem,
  DesktopShortcut
} from '../../shared/types';
import {
  buildCredentialVaultMenu,
  filterCredentialVaultItems,
  getCredentialVaultListInput,
  sortRecentlyCopiedCredentials
} from './credential-vault';
import type { CredentialVaultMenuId } from './credential-vault';
import {
  DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  PASSWORD_GENERATOR_MAX_LENGTH,
  PASSWORD_GENERATOR_MIN_LENGTH,
  generatePassword,
  normalizePasswordGeneratorOptions
} from './password-generator';
import type { PasswordGeneratorOptions } from './password-generator';
import {
  filterWorkbenchProfiles,
  getProfileGroupOptions,
  reconcileSelectedProfileIds,
  splitWorkbenchCsv
} from './profile-workbench';
import {
  buildProfileHealthReport,
  getProfileDeliveryGuidance,
  getProfileHealth,
  getProfileHealthIssueStats,
  getProfileHealthReadiness,
  getProfileHealthStats
} from './profile-health';
import type {
  WorkbenchArchiveFilter,
  WorkbenchHealthFilter,
  WorkbenchHealthIssueFilter,
  WorkbenchProxyFilter,
  WorkbenchRuntimeFilter,
  WorkbenchStatusFilter
} from './profile-workbench';

interface DraftState {
  id: string | null;
  name: string;
  owner: string;
  notes: string;
  groupName: string;
  tags: string;
  proxyEnabled: boolean;
  proxyScheme: ProxyScheme;
  proxyHost: string;
  proxyPort: string;
  proxyUsername: string;
  proxyPassword: string;
  proxyBypassList: string;
  runtimeChannel: RuntimeChannel;
  fingerprintPolicy: FingerprintPolicy;
}

interface CredentialDraftState {
  id: string | null;
  profileId: string | null;
  title: string;
  websiteUrl: string;
  username: string;
  password: string;
}

type ActiveTab = 'config' | 'credentials' | 'audit' | 'users' | 'license' | 'trial';
type WorkspaceView = 'profiles' | 'vault' | 'desktop' | 'proxies';
type VaultEditorMode = 'view' | 'edit' | 'new';
type SideNavKey = 'profiles' | 'vault' | 'desktop' | 'proxies';
type PasswordGeneratorTarget = 'vault' | 'profile' | null;
type DesktopDragPayload =
  | { type: 'shortcut'; id: string; folderId: string | null }
  | { type: 'folder'; id: string };

interface FeedbackDraftState {
  issueType: FeedbackIssueType;
  severity: FeedbackSeverity;
  teamName: string;
  contact: string;
  description: string;
  includeDiagnostics: boolean;
}

interface GoogleAccountDraftState {
  enabled: boolean;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

interface AuthDraftState {
  email: string;
  displayName: string;
  password: string;
}

interface UserDraftState {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

interface ProxyPoolDraftState {
  id: string | null;
  name: string;
  scheme: ProxyScheme;
  host: string;
  port: string;
  username: string;
  password: string;
  tags: string;
  region: string;
  timezone: string;
  bypassList: string;
}

interface ProfileBatchDraftState {
  groupName: string;
  tags: string;
  proxyPoolEntryId: string;
  matchTimezone: boolean;
}

const emptyDraft: DraftState = {
  id: null,
  name: '',
  owner: '',
  notes: '',
  groupName: '',
  tags: '',
  proxyEnabled: true,
  proxyScheme: 'http',
  proxyHost: '',
  proxyPort: '',
  proxyUsername: '',
  proxyPassword: '',
  proxyBypassList: 'localhost,127.0.0.1',
  runtimeChannel: 'official',
  fingerprintPolicy: DEFAULT_FINGERPRINT_POLICY
};

const emptyCredentialDraft: CredentialDraftState = {
  id: null,
  profileId: null,
  title: '',
  websiteUrl: '',
  username: '',
  password: ''
};

const emptyFeedbackDraft: FeedbackDraftState = {
  issueType: 'bug',
  severity: 'medium',
  teamName: '',
  contact: '',
  description: '',
  includeDiagnostics: true
};

const emptyGoogleAccountDraft: GoogleAccountDraftState = {
  enabled: false,
  apiKey: '',
  clientId: '',
  clientSecret: ''
};

const emptyAuthDraft: AuthDraftState = {
  email: 'admin@example.test',
  displayName: '',
  password: 'AdminPass123!'
};

const emptyUserDraft: UserDraftState = {
  email: '',
  displayName: '',
  password: '',
  role: 'member'
};

const emptyProxyPoolDraft: ProxyPoolDraftState = {
  id: null,
  name: '',
  scheme: 'http',
  host: '',
  port: '',
  username: '',
  password: '',
  tags: '',
  region: '',
  timezone: '',
  bypassList: 'localhost,127.0.0.1'
};

const emptyProfileBatchDraft: ProfileBatchDraftState = {
  groupName: '',
  tags: '',
  proxyPoolEntryId: '',
  matchTimezone: true
};

const statusText: Record<BrowserProfile['status'], string> = {
  running: '运行中',
  closed: '已关闭',
  error: '异常'
};

const statusTone: Record<BrowserProfile['status'], string> = {
  running: 'good',
  closed: 'muted',
  error: 'bad'
};

const runtimeChannelText: Record<RuntimeChannel, string> = {
  official: '官方稳定版',
  'custom-kernel': '自研内核'
};

const proxyRuntimeStateText: Record<ProxyRuntimeStatus['state'], string> = {
  stopped: '未启动',
  running: '运行中',
  error: '错误'
};

const proxyTestStatusText: Record<ProxyPoolEntry['lastTestStatus'], string> = {
  untested: '未检测',
  testing: '检测中',
  passed: '可用',
  failed: '失败'
};

const profileHealthTone = {
  ready: 'good',
  attention: 'warn',
  archived: 'muted'
} as const;

const profileHealthIssueFilterText: Record<WorkbenchHealthIssueFilter, string> = {
  all: '全部问题',
  owner: '负责人',
  notes: '备注',
  proxy: '代理',
  launch: '启动记录'
};

const kernelManifestSourceText: Record<KernelManifestSource, string> = {
  default: '内置默认',
  environment: '环境变量',
  imported: '应用内导入'
};

const actionLabel: Record<string, string> = {
  PROFILE_CREATED: '创建环境',
  PROFILE_DUPLICATED: '复制环境',
  PROFILE_CREATED_FROM_TEMPLATE: '模板创建环境',
  PROFILE_ARCHIVED: '归档环境',
  PROFILE_RESTORED: '恢复环境',
  PROFILE_TEMPLATE_CREATED: '保存环境模板',
  PROFILE_TEMPLATE_DELETED: '删除环境模板',
  PROFILE_UPDATED: '更新环境',
  PROFILE_LAUNCHED: '启动 Chromium',
  PROFILE_STOPPED: '关闭环境',
  DESKTOP_SHORTCUT_CREATED: '创建桌面快捷方式',
  DESKTOP_SHORTCUT_DELETED: '删除桌面快捷方式',
  DESKTOP_SHORTCUT_LAUNCHED: '桌面启动环境',
  DESKTOP_SHORTCUT_MOVED: '移动桌面快捷方式',
  DESKTOP_FOLDER_CREATED: '创建桌面文件夹',
  DESKTOP_FOLDER_DELETED: '删除桌面文件夹',
  PROXY_CREATED: '创建代理',
  PROXY_UPDATED: '更新代理',
  PROXY_TESTED: '测试代理',
  PROXY_POOL_CREATED: '创建代理池条目',
  PROXY_POOL_UPDATED: '更新代理池条目',
  PROXY_POOL_DELETED: '删除代理池条目',
  PROXY_POOL_TESTED: '检测代理池条目',
  PROXY_POOL_APPLIED: '应用代理池条目',
  LOCAL_PROXY_STARTED: '启动本地代理',
  LOCAL_PROXY_STOPPED: '关闭本地代理',
  LOCAL_PROXY_ERROR: '本地代理错误',
  CHROMIUM_INSTALLED: '安装 Chromium',
  KERNEL_INSTALLED: '安装自研内核',
  KERNEL_MANIFEST_IMPORTED: '导入内核 manifest',
  KERNEL_MANIFEST_CLEARED: '重置内核 manifest',
  KERNEL_POLICY_APPLIED: '应用内核策略',
  KERNEL_LAUNCHED: '启动自研内核',
  GOOGLE_ACCOUNT_CONFIG_UPDATED: '更新 Google 账号配置',
  GOOGLE_ACCOUNT_CONFIG_CLEARED: '清除 Google 账号配置',
  USER_BOOTSTRAPPED: '初始化管理员',
  USER_LOGGED_IN: '用户登录',
  USER_LOGGED_OUT: '用户退出',
  USER_CREATED: '创建用户',
  USER_UPDATED: '更新用户',
  LICENSE_ACTIVATED: '激活许可证',
  LICENSE_REFRESHED: '刷新许可证',
  LICENSE_DEACTIVATED: '停用许可证',
  AUDIT_EXPORTED: '导出审计',
  PROFILES_EXPORTED: '导出配置',
  SUPPORT_LOGS_PACKAGED: '打包支持日志',
  CREDENTIAL_CREATED: '创建密码项',
  CREDENTIAL_UPDATED: '更新密码项',
  CREDENTIAL_DELETED: '删除密码项',
  CREDENTIAL_USERNAME_COPIED: '复制账号',
  CREDENTIAL_PASSWORD_COPIED: '复制密码',
  CREDENTIAL_PASSWORD_REVEALED: '查看密码',
  SECURITY_LAB_OPENED: '打开安全实验',
  FEEDBACK_PACKAGED: '生成反馈包',
  UPDATE_CHECKED: '检查更新',
  ERROR_RECORDED: '记录错误'
};

const desktopIconLabel: Record<string, string> = {
  emerald: '绿',
  blue: '蓝',
  violet: '紫',
  amber: '黄',
  rose: '红',
  slate: '黑'
};

const licenseStatusText: Record<RedactedLicenseState['status'], string> = {
  inactive: '未激活',
  active: '有效',
  grace: '宽限期',
  expired: '已过期'
};

const userRoleText: Record<UserRole, string> = {
  admin: '管理员',
  member: '成员'
};

const userStatusText: Record<AppUser['status'], string> = {
  active: '启用',
  disabled: '停用'
};

function profileToDraft(profile: ProfileDetails): DraftState {
  return {
    id: profile.id,
    name: profile.name,
    owner: profile.owner,
    notes: profile.notes,
    groupName: profile.groupName,
    tags: profile.tags.join(','),
    proxyEnabled: Boolean(profile.proxy),
    proxyScheme: profile.proxy?.scheme ?? 'http',
    proxyHost: profile.proxy?.host ?? '',
    proxyPort: profile.proxy?.port ? String(profile.proxy.port) : '',
    proxyUsername: profile.proxy?.username ?? '',
    proxyPassword: '',
    proxyBypassList: profile.proxy?.bypassList.join(',') ?? 'localhost,127.0.0.1',
    runtimeChannel: profile.runtimeChannel,
    fingerprintPolicy: profile.fingerprintPolicy
  };
}

function draftToCreateInput(draft: DraftState): CreateProfileInput {
  return {
    name: draft.name,
    owner: draft.owner,
    notes: draft.notes,
    groupName: draft.groupName,
    tags: splitCsv(draft.tags),
    fingerprintPolicy: draft.fingerprintPolicy,
    runtimeChannel: draft.runtimeChannel,
    proxy:
      draft.proxyEnabled && draft.proxyHost
        ? {
            scheme: draft.proxyScheme,
            host: draft.proxyHost,
            port: Number(draft.proxyPort),
            username: draft.proxyUsername,
            password: draft.proxyPassword,
            bypassList: splitCsv(draft.proxyBypassList)
          }
        : undefined
  };
}

function draftToUpdateInput(draft: DraftState): UpdateProfileInput {
  if (!draft.id) {
    throw new Error('缺少环境 ID');
  }
  return {
    id: draft.id,
    name: draft.name,
    owner: draft.owner,
    notes: draft.notes,
    groupName: draft.groupName,
    tags: splitCsv(draft.tags),
    fingerprintPolicy: draft.fingerprintPolicy,
    runtimeChannel: draft.runtimeChannel,
    proxy:
      draft.proxyEnabled && draft.proxyHost
        ? {
            scheme: draft.proxyScheme,
            host: draft.proxyHost,
            port: Number(draft.proxyPort),
            username: draft.proxyUsername,
            password: draft.proxyPassword || undefined,
            bypassList: splitCsv(draft.proxyBypassList)
          }
        : null
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function App(): JSX.Element {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authDraft, setAuthDraft] = useState<AuthDraftState>(emptyAuthDraft);
  const [userDraft, setUserDraft] = useState<UserDraftState>(emptyUserDraft);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [profiles, setProfiles] = useState<ProfileDetails[]>([]);
  const [profileTemplates, setProfileTemplates] = useState<ProfileTemplate[]>([]);
  const [selectedProfileTemplateId, setSelectedProfileTemplateId] = useState('');
  const [profileTemplateDraftName, setProfileTemplateDraftName] = useState('');
  const [proxyPoolEntries, setProxyPoolEntries] = useState<ProxyPoolEntry[]>([]);
  const [selectedProxyPoolEntryId, setSelectedProxyPoolEntryId] = useState<string | null>(null);
  const [proxyPoolDraft, setProxyPoolDraft] = useState<ProxyPoolDraftState>(emptyProxyPoolDraft);
  const [proxyPoolQuery, setProxyPoolQuery] = useState('');
  const [proxyPoolMatchTimezone, setProxyPoolMatchTimezone] = useState(true);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [profileGroupFilter, setProfileGroupFilter] = useState('');
  const [profileStatusFilter, setProfileStatusFilter] = useState<WorkbenchStatusFilter>('all');
  const [profileHealthFilter, setProfileHealthFilter] = useState<WorkbenchHealthFilter>('all');
  const [profileHealthIssueFilter, setProfileHealthIssueFilter] = useState<WorkbenchHealthIssueFilter>('all');
  const [profileRuntimeFilter, setProfileRuntimeFilter] = useState<WorkbenchRuntimeFilter>('all');
  const [profileProxyFilter, setProfileProxyFilter] = useState<WorkbenchProxyFilter>('all');
  const [profileArchiveFilter, setProfileArchiveFilter] = useState<WorkbenchArchiveFilter>('active');
  const [profileBatchDraft, setProfileBatchDraft] = useState<ProfileBatchDraftState>(emptyProfileBatchDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraftState>(emptyCredentialDraft);
  const [credentialQuery, setCredentialQuery] = useState('');
  const [vaultAllCredentials, setVaultAllCredentials] = useState<CredentialEntry[]>([]);
  const [vaultCredentials, setVaultCredentials] = useState<CredentialEntry[]>([]);
  const [desktopShortcuts, setDesktopShortcuts] = useState<DesktopShortcut[]>([]);
  const [desktopFolders, setDesktopFolders] = useState<DesktopFolder[]>([]);
  const [desktopItems, setDesktopItems] = useState<DesktopItem[]>([]);
  const [openDesktopFolderId, setOpenDesktopFolderId] = useState<string | null>(null);
  const [desktopDragPayload, setDesktopDragPayload] = useState<DesktopDragPayload | null>(null);
  const [vaultDraft, setVaultDraft] = useState<CredentialDraftState>(emptyCredentialDraft);
  const [vaultQuery, setVaultQuery] = useState('');
  const [vaultMenuId, setVaultMenuId] = useState<CredentialVaultMenuId>('all');
  const [selectedVaultCredentialId, setSelectedVaultCredentialId] = useState<string | null>(null);
  const [vaultEditorMode, setVaultEditorMode] = useState<VaultEditorMode>('view');
  const [passwordGeneratorOptions, setPasswordGeneratorOptions] = useState<PasswordGeneratorOptions>(
    DEFAULT_PASSWORD_GENERATOR_OPTIONS
  );
  const [passwordGeneratorTarget, setPasswordGeneratorTarget] = useState<PasswordGeneratorTarget>(null);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [revealedCredential, setRevealedCredential] = useState<{ id: string; password: string } | null>(null);
  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null);
  const [releaseCheck, setReleaseCheck] = useState<ReleaseCheckResult | null>(null);
  const [kernelManifest, setKernelManifest] = useState<KernelRuntimeManifest | null>(null);
  const [kernelStatus, setKernelStatus] = useState<KernelRuntimeStatus | null>(null);
  const [googleAccountStatus, setGoogleAccountStatus] = useState<GoogleAccountConfigStatus | null>(null);
  const [googleAccountDraft, setGoogleAccountDraft] = useState<GoogleAccountDraftState>(emptyGoogleAccountDraft);
  const [proxyRuntimeStatuses, setProxyRuntimeStatuses] = useState<ProxyRuntimeStatus[]>([]);
  const [metrics, setMetrics] = useState<TrialMetrics | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraftState>(emptyFeedbackDraft);
  const [license, setLicense] = useState<RedactedLicenseState | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('config');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('profiles');
  const [activeNavKey, setActiveNavKey] = useState<SideNavKey>('profiles');
  const [notice, setNotice] = useState('准备就绪');
  const [busy, setBusy] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const filteredProfiles = useMemo(() => {
    return filterWorkbenchProfiles(profiles, {
      query,
      groupName: profileGroupFilter,
      status: profileStatusFilter,
      health: profileHealthFilter,
      healthIssue: profileHealthIssueFilter,
      runtimeChannel: profileRuntimeFilter,
      proxy: profileProxyFilter,
      archive: profileArchiveFilter
    });
  }, [
    profileArchiveFilter,
    profileGroupFilter,
    profileHealthFilter,
    profileHealthIssueFilter,
    profileProxyFilter,
    profileRuntimeFilter,
    profileStatusFilter,
    profiles,
    query
  ]);

  const profileGroupOptions = useMemo(() => getProfileGroupOptions(profiles), [profiles]);

  const profileHealthById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, getProfileHealth(profile)]));
  }, [profiles]);

  const profileHealthStats = useMemo(() => getProfileHealthStats(profiles), [profiles]);

  const profileHealthReadiness = useMemo(() => getProfileHealthReadiness(profiles), [profiles]);

  const profileHealthIssueStats = useMemo(() => getProfileHealthIssueStats(profiles), [profiles]);

  const profileDeliveryGuidance = useMemo(() => getProfileDeliveryGuidance(profiles), [profiles]);

  const selectedProfileHealth = useMemo(
    () => (selectedProfile ? (profileHealthById.get(selectedProfile.id) ?? getProfileHealth(selectedProfile)) : null),
    [profileHealthById, selectedProfile]
  );

  const visibleSelectedProfileIds = useMemo(
    () => reconcileSelectedProfileIds(selectedProfileIds, filteredProfiles),
    [filteredProfiles, selectedProfileIds]
  );

  const selectedProfilesForBatch = useMemo(
    () => profiles.filter((profile) => visibleSelectedProfileIds.includes(profile.id)),
    [profiles, visibleSelectedProfileIds]
  );

  const allFilteredProfilesSelected = useMemo(
    () => filteredProfiles.length > 0 && visibleSelectedProfileIds.length === filteredProfiles.length,
    [filteredProfiles.length, visibleSelectedProfileIds.length]
  );

  const selectedProxyPoolEntry = useMemo(
    () => proxyPoolEntries.find((entry) => entry.id === selectedProxyPoolEntryId) ?? null,
    [proxyPoolEntries, selectedProxyPoolEntryId]
  );

  const selectedProfileTemplate = useMemo(
    () => profileTemplates.find((template) => template.id === selectedProfileTemplateId) ?? null,
    [profileTemplates, selectedProfileTemplateId]
  );

  const filteredProxyPoolEntries = useMemo(() => {
    const keyword = proxyPoolQuery.trim().toLowerCase();
    if (!keyword) {
      return proxyPoolEntries;
    }
    return proxyPoolEntries.filter((entry) =>
      [entry.name, entry.host, entry.scheme, entry.region, entry.timezone, entry.tags.join(',')]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    );
  }, [proxyPoolEntries, proxyPoolQuery]);

  const canCreateProfile = useMemo(() => {
    if (!license || !usage) {
      return false;
    }
    return (license.status === 'active' || license.status === 'grace') && usage.profilesUsed < usage.profileLimit;
  }, [license, usage]);

  const passwordVaultEnabled = useMemo(() => license?.status === 'active' || license?.status === 'grace', [license?.status]);

  const selectedProxyRuntime = useMemo(() => {
    if (!selectedProfile) {
      return null;
    }
    return proxyRuntimeStatuses.find((status) => status.profileId === selectedProfile.id) ?? null;
  }, [proxyRuntimeStatuses, selectedProfile]);

  const credentialsEnabled = useMemo(() => {
    return Boolean(selectedProfile && passwordVaultEnabled);
  }, [passwordVaultEnabled, selectedProfile]);

  const licenseUsagePercent = useMemo(() => {
    if (!usage || usage.profileLimit === 0) {
      return 0;
    }
    return Math.min(100, Math.round((usage.profilesUsed / usage.profileLimit) * 100));
  }, [usage]);

  const filteredCredentials = useMemo(() => {
    const keyword = credentialQuery.trim().toLowerCase();
    if (!keyword) {
      return credentials;
    }
    return credentials.filter((credential) =>
      [credential.title, credential.websiteUrl, credential.username].join(' ').toLowerCase().includes(keyword)
    );
  }, [credentialQuery, credentials]);

  const vaultMenuItems = useMemo(
    () => buildCredentialVaultMenu(vaultAllCredentials, profiles),
    [profiles, vaultAllCredentials]
  );

  const activeVaultMenuItem = useMemo(
    () => vaultMenuItems.find((item) => item.id === vaultMenuId) ?? vaultMenuItems[0] ?? null,
    [vaultMenuId, vaultMenuItems]
  );

  const filteredVaultCredentials = useMemo(
    () => filterCredentialVaultItems(vaultCredentials, vaultQuery),
    [vaultCredentials, vaultQuery]
  );

  const selectedVaultCredential = useMemo(
    () => vaultCredentials.find((credential) => credential.id === selectedVaultCredentialId) ?? null,
    [selectedVaultCredentialId, vaultCredentials]
  );

  const desktopProfileIds = useMemo(
    () => new Set(desktopShortcuts.map((shortcut) => shortcut.profileId)),
    [desktopShortcuts]
  );

  const openDesktopFolder = useMemo(
    () => desktopFolders.find((folder) => folder.id === openDesktopFolderId) ?? null,
    [desktopFolders, openDesktopFolderId]
  );

  const openFolderShortcuts = useMemo(
    () =>
      [...desktopShortcuts]
        .filter((shortcut) => shortcut.folderId === openDesktopFolderId)
        .sort((first, second) => first.positionIndex - second.positionIndex),
    [desktopShortcuts, openDesktopFolderId]
  );

  const loadProfiles = useCallback(async () => {
    const nextProfiles = await window.fingerBrowser.profiles.list();
    setProfiles(nextProfiles);
    if (nextProfiles.length > 0) {
      setSelectedId((current) => current ?? nextProfiles[0].id);
    }
  }, []);

  const loadProfileTemplates = useCallback(async () => {
    const templates = await window.fingerBrowser.profileTemplates.list();
    setProfileTemplates(templates);
    setSelectedProfileTemplateId((current) =>
      current && templates.some((template) => template.id === current) ? current : templates[0]?.id ?? ''
    );
  }, []);

  const loadDesktopShortcuts = useCallback(async () => {
    const [shortcuts, folders, items] = await Promise.all([
      window.fingerBrowser.desktop.list(),
      window.fingerBrowser.desktop.listFolders(),
      window.fingerBrowser.desktop.listItems()
    ]);
    setDesktopShortcuts(shortcuts);
    setDesktopFolders(folders);
    setDesktopItems(items);
    setOpenDesktopFolderId((current) => (current && folders.some((folder) => folder.id === current) ? current : null));
  }, []);

  const loadAudits = useCallback(async (profileId?: string) => {
    const nextAudits = await window.fingerBrowser.audit.list(profileId);
    setAudits(nextAudits);
  }, []);

  const loadCredentials = useCallback(async (profileId: string, enabled: boolean) => {
    if (!enabled) {
      setCredentials([]);
      return;
    }
    const nextCredentials = await window.fingerBrowser.credentials.list({ profileId });
    setCredentials(nextCredentials);
  }, []);

  const loadVaultCredentials = useCallback(async () => {
    if (!passwordVaultEnabled) {
      setVaultAllCredentials([]);
      setVaultCredentials([]);
      setSelectedVaultCredentialId(null);
      return;
    }
    const allCredentials = await window.fingerBrowser.credentials.list({});
    const nextCredentials =
      vaultMenuId === 'recent'
        ? sortRecentlyCopiedCredentials(allCredentials)
        : vaultMenuId === 'all'
          ? allCredentials
          : await window.fingerBrowser.credentials.list(getCredentialVaultListInput(vaultMenuId));
    setVaultAllCredentials(allCredentials);
    setVaultCredentials(nextCredentials);
    setSelectedVaultCredentialId((current) => {
      if (current && nextCredentials.some((credential) => credential.id === current)) {
        return current;
      }
      return nextCredentials[0]?.id ?? null;
    });
  }, [passwordVaultEnabled, vaultMenuId]);

  const loadCommercialState = useCallback(async () => {
    const [nextLicense, nextUsage] = await Promise.all([
      window.fingerBrowser.license.status(),
      window.fingerBrowser.license.usage()
    ]);
    setLicense(nextLicense);
    setUsage(nextUsage);
  }, []);

  const loadTrialState = useCallback(async () => {
    const [nextVersion, nextMetrics] = await Promise.all([
      window.fingerBrowser.app.version(),
      window.fingerBrowser.trial.metrics()
    ]);
    setAppVersion(nextVersion);
    setMetrics(nextMetrics);
  }, []);

  const loadKernelState = useCallback(async () => {
    const [nextManifest, nextStatus] = await Promise.all([
      window.fingerBrowser.kernel.manifest(),
      window.fingerBrowser.kernel.status()
    ]);
    setKernelManifest(nextManifest);
    setKernelStatus(nextStatus);
  }, []);

  const loadGoogleAccountState = useCallback(async () => {
    const nextStatus = await window.fingerBrowser.googleAccount.status();
    setGoogleAccountStatus(nextStatus);
    setGoogleAccountDraft((current) => ({
      ...current,
      enabled: nextStatus.enabled
    }));
  }, []);

  const loadProxyRuntimeStatus = useCallback(async (profileId?: string) => {
    const statuses = await window.fingerBrowser.proxy.localStatus(profileId);
    setProxyRuntimeStatuses((current) => {
      if (!profileId) {
        return statuses;
      }
      const rest = current.filter((status) => status.profileId !== profileId);
      return [...rest, ...statuses];
    });
  }, []);

  const loadUsers = useCallback(async () => {
    const nextUsers = await window.fingerBrowser.users.list();
    setUsers(nextUsers);
  }, []);

  const loadSyncStatus = useCallback(async () => {
    const nextStatus = await window.fingerBrowser.sync.status();
    setSyncStatus(nextStatus);
  }, []);

  const loadProxyPoolEntries = useCallback(async () => {
    const entries = await window.fingerBrowser.proxyPool.list();
    setProxyPoolEntries(entries);
    setSelectedProxyPoolEntryId((current) => (current && entries.some((entry) => entry.id === current) ? current : entries[0]?.id ?? null));
  }, []);

  useEffect(() => {
    void window.fingerBrowser.auth
      .status()
      .then(setAuthStatus)
      .catch((error) => setNotice(error instanceof Error ? error.message : '加载用户状态失败'));
  }, []);

  useEffect(() => {
    if (!authStatus?.authenticated) {
      return;
    }
    const tasks: Array<Promise<unknown>> = [
      loadProfiles(),
      loadProfileTemplates(),
      loadDesktopShortcuts(),
      loadCommercialState(),
      loadTrialState(),
      loadKernelState(),
      loadGoogleAccountState(),
      loadProxyRuntimeStatus(),
      loadProxyPoolEntries(),
      loadSyncStatus()
    ];
    if (authStatus.currentUser?.role === 'admin') {
      tasks.push(loadUsers());
    }
    void Promise.all(tasks).catch((error) => setNotice(error instanceof Error ? error.message : '加载环境失败'));
  }, [
    authStatus?.authenticated,
    authStatus?.currentUser?.role,
    loadCommercialState,
    loadDesktopShortcuts,
    loadGoogleAccountState,
    loadKernelState,
    loadSyncStatus,
    loadProfileTemplates,
    loadProfiles,
    loadProxyPoolEntries,
    loadProxyRuntimeStatus,
    loadTrialState,
    loadUsers
  ]);

  useEffect(() => {
    if (!authStatus?.authenticated) {
      return;
    }
    if (selectedProfile) {
      setDraft(profileToDraft(selectedProfile));
      void loadAudits(selectedProfile.id);
      void loadCredentials(selectedProfile.id, credentialsEnabled).catch((error) =>
        setNotice(error instanceof Error ? error.message : '加载密码库失败')
      );
      void loadProxyRuntimeStatus(selectedProfile.id).catch((error) =>
        setNotice(error instanceof Error ? error.message : '加载本地代理状态失败')
      );
    } else {
      setDraft(emptyDraft);
      setCredentials([]);
      void loadAudits();
    }
    setCredentialDraft(emptyCredentialDraft);
    setCredentialQuery('');
    setRevealedCredential(null);
  }, [authStatus?.authenticated, credentialsEnabled, loadAudits, loadCredentials, loadProxyRuntimeStatus, selectedProfile]);

  useEffect(() => {
    if (!authStatus?.authenticated) {
      return;
    }
    if (workspaceView === 'vault') {
      void loadVaultCredentials().catch((error) =>
        setNotice(error instanceof Error ? error.message : '加载全局密码库失败')
      );
    }
    if (workspaceView === 'desktop') {
      void loadDesktopShortcuts().catch((error) =>
        setNotice(error instanceof Error ? error.message : '加载我的桌面失败')
      );
    }
    if (workspaceView === 'proxies') {
      void loadProxyPoolEntries().catch((error) =>
        setNotice(error instanceof Error ? error.message : '加载代理池失败')
      );
    }
  }, [authStatus?.authenticated, loadDesktopShortcuts, loadProxyPoolEntries, loadVaultCredentials, workspaceView]);

  useEffect(() => {
    setRevealedCredential(null);
  }, [activeTab, selectedVaultCredentialId, vaultMenuId, workspaceView]);

  useEffect(() => {
    setSelectedProfileIds((current) => reconcileSelectedProfileIds(current, filteredProfiles));
  }, [filteredProfiles]);

  const run = useCallback(async (label: string, task: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(`${label}中...`);
    try {
      const message = await task();
      setNotice(message ?? `${label}完成`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  }, []);

  const resetWorkspaceState = (): void => {
    setUsers([]);
    setProfiles([]);
    setProfileTemplates([]);
    setSelectedProfileTemplateId('');
    setProfileTemplateDraftName('');
    setProxyPoolEntries([]);
    setSelectedProxyPoolEntryId(null);
    setProxyPoolDraft(emptyProxyPoolDraft);
    setProxyPoolQuery('');
    setProxyPoolMatchTimezone(true);
    setSelectedProfileIds([]);
    setProfileGroupFilter('');
    setProfileStatusFilter('all');
    setProfileHealthFilter('all');
    setProfileHealthIssueFilter('all');
    setProfileRuntimeFilter('all');
    setProfileProxyFilter('all');
    setProfileArchiveFilter('active');
    setProfileBatchDraft(emptyProfileBatchDraft);
    setSelectedId(null);
    setDraft(emptyDraft);
    setAudits([]);
    setCredentials([]);
    setCredentialDraft(emptyCredentialDraft);
    setCredentialQuery('');
    setVaultAllCredentials([]);
    setVaultCredentials([]);
    setDesktopShortcuts([]);
    setDesktopFolders([]);
    setDesktopItems([]);
    setOpenDesktopFolderId(null);
    setVaultDraft(emptyCredentialDraft);
    setVaultQuery('');
    setVaultMenuId('all');
    setSelectedVaultCredentialId(null);
    setVaultEditorMode('view');
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
    setLicense(null);
    setUsage(null);
    setMetrics(null);
    setWorkspaceView('profiles');
    setActiveNavKey('profiles');
    setActiveTab('config');
  };

  const handleBootstrapAdmin = (): void => {
    void run('创建管理员', async () => {
      const status = await window.fingerBrowser.auth.bootstrap(authDraft);
      setAuthStatus(status);
      setAuthDraft(emptyAuthDraft);
      return `已创建管理员：${status.currentUser?.displayName ?? ''}`;
    });
  };

  const handleLogin = (): void => {
    void run('登录', async () => {
      const status = await window.fingerBrowser.auth.login({
        email: authDraft.email,
        password: authDraft.password
      });
      await window.fingerBrowser.sync.pullWorkspace();
      await loadSyncStatus();
      setAuthStatus(status);
      setAuthDraft(emptyAuthDraft);
      return `已登录云账号：${status.currentUser?.displayName ?? ''}`;
    });
  };

  const handleLogout = (): void => {
    void run('退出登录', async () => {
      const status = await window.fingerBrowser.auth.logout();
      setAuthStatus(status);
      resetWorkspaceState();
      return '已退出登录';
    });
  };

  const handleMigrateLocalData = (): void => {
    void run('迁移本机数据', async () => {
      const result = await window.fingerBrowser.sync.migrateLocalData();
      await Promise.all([loadProfiles(), loadVaultCredentials(), loadAudits(), loadSyncStatus()]);
      return `已迁移 ${result.migratedProfiles} 个环境、${result.migratedCredentials} 个密码项和 ${result.migratedProfileSnapshots} 个浏览器状态快照`;
    });
  };

  const handlePullWorkspace = (): void => {
    void run('拉取云端工作区', async () => {
      const result = await window.fingerBrowser.sync.pullWorkspace();
      await Promise.all([loadProfiles(), loadVaultCredentials(), loadAudits(), loadSyncStatus()]);
      return `已拉取 ${result.profiles} 个环境、${result.credentials} 个密码项和 ${result.auditEvents} 条审计`;
    });
  };

  const handlePushPendingChanges = (): void => {
    void run('推送同步变更', async () => {
      const result = await window.fingerBrowser.sync.pushPendingChanges();
      await loadSyncStatus();
      return `已推送 ${result.profiles} 个环境、${result.credentials} 个密码项和 ${result.auditEvents} 条审计`;
    });
  };

  const handleCreateUser = (): void => {
    void run('创建用户', async () => {
      const user = await window.fingerBrowser.users.create(userDraft);
      await loadUsers();
      await loadAudits();
      setUserDraft(emptyUserDraft);
      return `已创建用户：${user.displayName}`;
    });
  };

  const handleToggleUserStatus = (user: AppUser): void => {
    void run(user.status === 'active' ? '停用用户' : '启用用户', async () => {
      const nextStatus = user.status === 'active' ? 'disabled' : 'active';
      const updated = await window.fingerBrowser.users.update({ id: user.id, status: nextStatus });
      await loadUsers();
      await loadAudits();
      return `${updated.displayName} 已${userStatusText[updated.status]}`;
    });
  };

  const handleOpenProfiles = (navKey: SideNavKey = 'profiles'): void => {
    setWorkspaceView('profiles');
    setActiveNavKey(navKey);
  };

  const handleOpenVault = (menuId: CredentialVaultMenuId = 'all'): void => {
    setWorkspaceView('vault');
    setActiveNavKey('vault');
    setVaultMenuId(menuId);
    setVaultDraft(emptyCredentialDraft);
    setVaultEditorMode('view');
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const handleOpenDesktop = (): void => {
    setWorkspaceView('desktop');
    setActiveNavKey('desktop');
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const handleOpenProxyPool = (): void => {
    setWorkspaceView('proxies');
    setActiveNavKey('proxies');
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const handleProfileHealthFilterChange = (filter: WorkbenchHealthFilter): void => {
    setProfileHealthFilter(filter);
    setProfileHealthIssueFilter('all');
    if (filter === 'archived') {
      setProfileArchiveFilter('archived');
      return;
    }
    if (filter !== 'all' && profileArchiveFilter === 'archived') {
      setProfileArchiveFilter('active');
    }
  };

  const handleProfileHealthIssueFilterChange = (filter: WorkbenchHealthIssueFilter): void => {
    setProfileHealthIssueFilter(filter);
    if (filter !== 'all') {
      setProfileHealthFilter('attention');
      if (profileArchiveFilter === 'archived') {
        setProfileArchiveFilter('active');
      }
    }
  };

  const handleCopyProfileHealthReport = (): void => {
    void run('复制健康摘要', async () => {
      await navigator.clipboard.writeText(buildProfileHealthReport(profiles));
      return '健康摘要已复制到剪贴板';
    });
  };

  const proxyPoolDraftToInput = (draftState: ProxyPoolDraftState) => ({
    name: draftState.name,
    scheme: draftState.scheme,
    host: draftState.host,
    port: Number(draftState.port),
    username: draftState.username,
    password: draftState.password || undefined,
    tags: splitCsv(draftState.tags),
    region: draftState.region,
    timezone: draftState.timezone,
    bypassList: splitCsv(draftState.bypassList)
  });

  const handleNewProxyPoolEntry = (): void => {
    setProxyPoolDraft({
      ...emptyProxyPoolDraft,
      name: `代理 ${proxyPoolEntries.length + 1}`
    });
    setSelectedProxyPoolEntryId(null);
    setNotice('正在新增代理池条目');
  };

  const handleEditProxyPoolEntry = (entry: ProxyPoolEntry): void => {
    setSelectedProxyPoolEntryId(entry.id);
    setProxyPoolDraft({
      id: entry.id,
      name: entry.name,
      scheme: entry.scheme,
      host: entry.host,
      port: String(entry.port),
      username: entry.username,
      password: '',
      tags: entry.tags.join(','),
      region: entry.region,
      timezone: entry.timezone,
      bypassList: entry.bypassList.join(',')
    });
  };

  const handleSaveProxyPoolEntry = (): void => {
    void run('保存代理池', async () => {
      const saved = proxyPoolDraft.id
        ? await window.fingerBrowser.proxyPool.update({
            id: proxyPoolDraft.id,
            ...proxyPoolDraftToInput(proxyPoolDraft)
          })
        : await window.fingerBrowser.proxyPool.create(proxyPoolDraftToInput(proxyPoolDraft));
      await loadProxyPoolEntries();
      await loadAudits();
      setSelectedProxyPoolEntryId(saved.id);
      setProxyPoolDraft(emptyProxyPoolDraft);
      return `已保存代理：${saved.name}`;
    });
  };

  const handleDeleteProxyPoolEntry = (entry: ProxyPoolEntry): void => {
    void run('删除代理池', async () => {
      await window.fingerBrowser.proxyPool.delete(entry.id);
      await loadProxyPoolEntries();
      await loadAudits();
      setProxyPoolDraft(emptyProxyPoolDraft);
      return `已删除代理：${entry.name}`;
    });
  };

  const handleTestProxyPoolEntry = (entry: ProxyPoolEntry): void => {
    void run('检测代理池', async () => {
      const result = await window.fingerBrowser.proxyPool.test(entry.id);
      await loadProxyPoolEntries();
      await loadTrialState();
      await loadAudits();
      return result.message;
    });
  };

  const handleApplyProxyPoolEntry = (entry: ProxyPoolEntry): void => {
    if (!selectedProfile) {
      setNotice('请先选择一个环境');
      return;
    }
    void run('应用代理池', async () => {
      const updated = await window.fingerBrowser.proxyPool.applyToProfile({
        entryId: entry.id,
        profileId: selectedProfile.id,
        matchTimezone: proxyPoolMatchTimezone
      });
      await loadProfiles();
      await loadProxyRuntimeStatus(updated.id);
      await loadAudits(updated.id);
      setSelectedId(updated.id);
      return `已应用代理到环境：${updated.name}`;
    });
  };

  const handleToggleProfileSelection = (profileId: string): void => {
    setSelectedProfileIds((current) =>
      current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]
    );
  };

  const handleToggleAllFilteredProfiles = (): void => {
    setSelectedProfileIds((current) => {
      const filteredIds = filteredProfiles.map((profile) => profile.id);
      if (filteredIds.length > 0 && filteredIds.every((id) => current.includes(id))) {
        return current.filter((id) => !filteredIds.includes(id));
      }
      return [...new Set([...current, ...filteredIds])];
    });
  };

  const handleBatchUpdateGroup = (): void => {
    if (selectedProfilesForBatch.length === 0) {
      setNotice('请先选择环境');
      return;
    }
    void run('批量修改分组', async () => {
      for (const profile of selectedProfilesForBatch) {
        await window.fingerBrowser.profiles.update({
          id: profile.id,
          name: profile.name,
          owner: profile.owner,
          notes: profile.notes,
          groupName: profileBatchDraft.groupName,
          tags: profile.tags,
          fingerprintPolicy: profile.fingerprintPolicy,
          runtimeChannel: profile.runtimeChannel,
          proxy: profile.proxy
            ? {
                scheme: profile.proxy.scheme,
                host: profile.proxy.host,
                port: profile.proxy.port,
                username: profile.proxy.username,
                bypassList: profile.proxy.bypassList
              }
            : null
        });
      }
      await loadProfiles();
      await loadAudits();
      return `已更新 ${selectedProfilesForBatch.length} 个环境分组`;
    });
  };

  const handleBatchUpdateTags = (): void => {
    if (selectedProfilesForBatch.length === 0) {
      setNotice('请先选择环境');
      return;
    }
    const tags = splitWorkbenchCsv(profileBatchDraft.tags);
    void run('批量修改标签', async () => {
      for (const profile of selectedProfilesForBatch) {
        await window.fingerBrowser.profiles.update({
          id: profile.id,
          name: profile.name,
          owner: profile.owner,
          notes: profile.notes,
          groupName: profile.groupName,
          tags,
          fingerprintPolicy: profile.fingerprintPolicy,
          runtimeChannel: profile.runtimeChannel,
          proxy: profile.proxy
            ? {
                scheme: profile.proxy.scheme,
                host: profile.proxy.host,
                port: profile.proxy.port,
                username: profile.proxy.username,
                bypassList: profile.proxy.bypassList
              }
            : null
        });
      }
      await loadProfiles();
      await loadAudits();
      return `已更新 ${selectedProfilesForBatch.length} 个环境标签`;
    });
  };

  const handleBatchApplyProxy = (): void => {
    if (selectedProfilesForBatch.length === 0) {
      setNotice('请先选择环境');
      return;
    }
    if (!profileBatchDraft.proxyPoolEntryId) {
      setNotice('请选择代理池条目');
      return;
    }
    void run('批量应用代理', async () => {
      for (const profile of selectedProfilesForBatch) {
        await window.fingerBrowser.proxyPool.applyToProfile({
          entryId: profileBatchDraft.proxyPoolEntryId,
          profileId: profile.id,
          matchTimezone: profileBatchDraft.matchTimezone
        });
      }
      await loadProfiles();
      await loadProxyRuntimeStatus();
      await loadAudits();
      return `已应用代理到 ${selectedProfilesForBatch.length} 个环境`;
    });
  };

  const handleBatchStopProfiles = (): void => {
    const runningProfiles = selectedProfilesForBatch.filter((profile) => profile.status === 'running');
    if (runningProfiles.length === 0) {
      setNotice('已选环境中没有运行中的环境');
      return;
    }
    void run('批量关闭环境', async () => {
      for (const profile of runningProfiles) {
        await window.fingerBrowser.profiles.stop(profile.id);
      }
      await loadProfiles();
      await loadDesktopShortcuts();
      await loadProxyRuntimeStatus();
      await loadAudits();
      return `已关闭 ${runningProfiles.length} 个环境`;
    });
  };

  const handleCreateDesktopShortcut = (profileId?: string): void => {
    const targetProfileId = profileId ?? selectedProfile?.id;
    if (!targetProfileId) {
      setNotice('请先选择一个环境');
      return;
    }
    void run('添加桌面快捷方式', async () => {
      const shortcut = await window.fingerBrowser.desktop.createShortcut({ profileId: targetProfileId });
      await loadDesktopShortcuts();
      await loadAudits(shortcut.profileId);
      return `已添加到我的桌面：${shortcut.label}`;
    });
  };

  const handleDeleteDesktopShortcut = (shortcut: DesktopShortcut): void => {
    void run('移除桌面快捷方式', async () => {
      await window.fingerBrowser.desktop.deleteShortcut(shortcut.id);
      await loadDesktopShortcuts();
      await loadAudits(shortcut.profileId);
      return `已从我的桌面移除：${shortcut.label}`;
    });
  };

  const handleLaunchDesktopShortcut = (shortcut: DesktopShortcut): void => {
    void run('从我的桌面启动环境', async () => {
      await window.fingerBrowser.desktop.launchShortcut(shortcut.id);
      setSelectedId(shortcut.profileId);
      await loadProfiles();
      await loadDesktopShortcuts();
      await loadProxyRuntimeStatus(shortcut.profileId);
      await loadCommercialState();
      await loadTrialState();
      await loadAudits(shortcut.profileId);
      return `已启动：${shortcut.label}`;
    });
  };

  const handleCreateDesktopFolder = (): void => {
    void run('新建桌面文件夹', async () => {
      const folder = await window.fingerBrowser.desktop.createFolder({ name: '新建文件夹' });
      await loadDesktopShortcuts();
      setOpenDesktopFolderId(folder.id);
      await loadAudits();
      return `已创建文件夹：${folder.name}`;
    });
  };

  const handleDeleteDesktopFolder = (folder: DesktopFolder): void => {
    void run('删除桌面文件夹', async () => {
      await window.fingerBrowser.desktop.deleteFolder(folder.id);
      await loadDesktopShortcuts();
      setOpenDesktopFolderId(null);
      await loadAudits();
      return `已删除文件夹：${folder.name}`;
    });
  };

  const refreshDesktopAfterDrag = async (): Promise<void> => {
    await loadDesktopShortcuts();
    await loadAudits(selectedProfile?.id);
  };

  const handleDesktopDragStart = (
    event: DragEvent<HTMLElement>,
    payload: DesktopDragPayload
  ): void => {
    setDesktopDragPayload(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-fingerbrowser-desktop', JSON.stringify(payload));
  };

  const readDesktopDragPayload = (event: DragEvent<HTMLElement>): DesktopDragPayload | null => {
    if (desktopDragPayload) {
      return desktopDragPayload;
    }
    try {
      const raw = event.dataTransfer.getData('application/x-fingerbrowser-desktop');
      return raw ? (JSON.parse(raw) as DesktopDragPayload) : null;
    } catch {
      return null;
    }
  };

  const handleDropOnDesktopShortcut = (event: DragEvent<HTMLElement>, target: DesktopShortcut): void => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readDesktopDragPayload(event);
    setDesktopDragPayload(null);
    if (!payload || payload.id === target.id) {
      return;
    }
    void run('整理我的桌面', async () => {
      if (payload.type === 'shortcut') {
        if (!target.folderId) {
          await window.fingerBrowser.desktop.createFolderFromShortcuts({
            sourceShortcutId: payload.id,
            targetShortcutId: target.id
          });
        } else {
          await window.fingerBrowser.desktop.moveShortcut({
            shortcutId: payload.id,
            folderId: target.folderId
          });
        }
      } else {
        await reorderTopDesktopItem(payload, { type: 'shortcut', id: target.id });
      }
      await refreshDesktopAfterDrag();
      return '桌面已整理';
    });
  };

  const handleDropOnDesktopFolder = (event: DragEvent<HTMLElement>, folder: DesktopFolder): void => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readDesktopDragPayload(event);
    setDesktopDragPayload(null);
    if (!payload || payload.id === folder.id) {
      return;
    }
    void run('整理我的桌面', async () => {
      if (payload.type === 'shortcut') {
        await window.fingerBrowser.desktop.moveShortcut({
          shortcutId: payload.id,
          folderId: folder.id
        });
        setOpenDesktopFolderId(folder.id);
      } else {
        await reorderTopDesktopItem(payload, { type: 'folder', id: folder.id });
      }
      await refreshDesktopAfterDrag();
      return '桌面已整理';
    });
  };

  const handleDropOnDesktopSurface = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    const payload = readDesktopDragPayload(event);
    setDesktopDragPayload(null);
    if (!payload || payload.type !== 'shortcut' || payload.folderId === null) {
      return;
    }
    void run('移出到我的桌面', async () => {
      await window.fingerBrowser.desktop.moveShortcut({
        shortcutId: payload.id,
        folderId: null
      });
      await refreshDesktopAfterDrag();
      return '已移出到我的桌面';
    });
  };

  const handleDropOnOpenFolder = (event: DragEvent<HTMLElement>, folder: DesktopFolder): void => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readDesktopDragPayload(event);
    setDesktopDragPayload(null);
    if (!payload || payload.type !== 'shortcut') {
      return;
    }
    void run('移动到文件夹', async () => {
      await window.fingerBrowser.desktop.moveShortcut({
        shortcutId: payload.id,
        folderId: folder.id
      });
      await refreshDesktopAfterDrag();
      return `已移动到：${folder.name}`;
    });
  };

  const handleDropOnFolderShortcut = (
    event: DragEvent<HTMLElement>,
    target: DesktopShortcut,
    folder: DesktopFolder
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readDesktopDragPayload(event);
    setDesktopDragPayload(null);
    if (!payload || payload.type !== 'shortcut' || payload.id === target.id) {
      return;
    }
    void run('整理文件夹', async () => {
      if (payload.folderId !== folder.id) {
        await window.fingerBrowser.desktop.moveShortcut({
          shortcutId: payload.id,
          folderId: folder.id
        });
      }
      const nextOrder = [payload.id, ...openFolderShortcuts.map((shortcut) => shortcut.id).filter((id) => id !== payload.id)];
      const targetIndex = nextOrder.indexOf(target.id);
      const sourceIndex = nextOrder.indexOf(payload.id);
      nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(Math.max(targetIndex, 0), 0, payload.id);
      await window.fingerBrowser.desktop.reorderFolderShortcuts({
        folderId: folder.id,
        shortcutIds: nextOrder
      });
      await refreshDesktopAfterDrag();
      return '文件夹已整理';
    });
  };

  const handleMoveShortcutToDesktop = (shortcut: DesktopShortcut): void => {
    void run('移出到我的桌面', async () => {
      await window.fingerBrowser.desktop.moveShortcut({
        shortcutId: shortcut.id,
        folderId: null
      });
      await refreshDesktopAfterDrag();
      return `已移出：${shortcut.label}`;
    });
  };

  const reorderTopDesktopItem = async (
    payload: DesktopDragPayload,
    target: { type: 'shortcut' | 'folder'; id: string }
  ): Promise<void> => {
    const current = desktopItems.map((item) => ({ type: item.type, id: item.id }));
    const sourceKey = `${payload.type}:${payload.id}`;
    const targetKey = `${target.type}:${target.id}`;
    const withoutSource = current.filter((item) => `${item.type}:${item.id}` !== sourceKey);
    const targetIndex = withoutSource.findIndex((item) => `${item.type}:${item.id}` === targetKey);
    if (targetIndex < 0) {
      return;
    }
    withoutSource.splice(targetIndex, 0, { type: payload.type, id: payload.id });
    await window.fingerBrowser.desktop.reorderItems({ items: withoutSource });
  };

  const handleSelectVaultMenu = (menuId: CredentialVaultMenuId): void => {
    setVaultMenuId(menuId);
    setVaultQuery('');
    setVaultEditorMode('view');
    setVaultDraft(emptyCredentialDraft);
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const handleNewProfile = (): void => {
    setWorkspaceView('profiles');
    setActiveNavKey('profiles');
    if (!canCreateProfile) {
      setActiveTab('license');
      setNotice(license?.status === 'inactive' ? '请先激活许可证' : '当前套餐环境数已达上限');
      return;
    }
    setSelectedId(null);
    setDraft({
      ...emptyDraft,
      name: `运营环境 ${profiles.length + 1}`
    });
    setActiveTab('config');
    setNotice('正在创建新环境');
  };

  const handleDuplicateProfile = (): void => {
    const source = selectedProfile;
    if (!source) {
      setNotice('请先选择环境');
      return;
    }
    if (!canCreateProfile) {
      setActiveTab('license');
      setNotice(license?.status === 'inactive' ? '请先激活许可证' : '当前套餐环境数已达上限');
      return;
    }
    void run('复制环境', async () => {
      const duplicated = await window.fingerBrowser.profiles.duplicate({ profileId: source.id });
      await loadProfiles();
      await loadCommercialState();
      await loadTrialState();
      setSelectedId(duplicated.id);
      setDraft(profileToDraft(duplicated));
      setActiveTab('config');
      await loadAudits(duplicated.id);
      return `已复制环境：${duplicated.name}`;
    });
  };

  const handleSaveProfileTemplate = (): void => {
    const source = selectedProfile;
    if (!source) {
      setNotice('请先选择环境');
      return;
    }
    void run('保存环境模板', async () => {
      const template = await window.fingerBrowser.profileTemplates.createFromProfile({
        profileId: source.id,
        name: profileTemplateDraftName.trim() || `${source.name} 模板`
      });
      await loadProfileTemplates();
      setSelectedProfileTemplateId(template.id);
      setProfileTemplateDraftName('');
      await loadAudits();
      return `已保存模板：${template.name}`;
    });
  };

  const handleCreateProfileFromTemplate = (): void => {
    const template = selectedProfileTemplate;
    if (!template) {
      setNotice('请选择环境模板');
      return;
    }
    if (!canCreateProfile) {
      setActiveTab('license');
      setNotice(license?.status === 'inactive' ? '请先激活许可证' : '当前套餐环境数已达上限');
      return;
    }
    void run('从模板创建环境', async () => {
      const profile = await window.fingerBrowser.profileTemplates.createProfile({
        templateId: template.id,
        name: `${template.name} 环境 ${profiles.length + 1}`
      });
      await loadProfiles();
      await loadCommercialState();
      await loadTrialState();
      setSelectedId(profile.id);
      setDraft(profileToDraft(profile));
      setActiveTab('config');
      await loadAudits(profile.id);
      return `已从模板创建环境：${profile.name}`;
    });
  };

  const handleDeleteProfileTemplate = (): void => {
    const template = selectedProfileTemplate;
    if (!template) {
      setNotice('请选择环境模板');
      return;
    }
    void run('删除环境模板', async () => {
      await window.fingerBrowser.profileTemplates.delete(template.id);
      await loadProfileTemplates();
      await loadAudits();
      return `已删除模板：${template.name}`;
    });
  };

  const handleSave = (): void => {
    void run('保存环境', async () => {
      const saved = draft.id
        ? await window.fingerBrowser.profiles.update(draftToUpdateInput(draft))
        : await window.fingerBrowser.profiles.create(draftToCreateInput(draft));
      await loadProfiles();
      await loadDesktopShortcuts();
      await loadProxyRuntimeStatus(saved.id);
      await loadCommercialState();
      await loadTrialState();
      setSelectedId(saved.id);
      await loadAudits(saved.id);
    });
  };

  const handleProxyTest = (): void => {
    void run('测试代理', async () => {
      if (!draft.proxyHost || !draft.proxyPort) {
        throw new Error('请先填写代理主机和端口');
      }
      const result = await window.fingerBrowser.proxy.test({
        profileId: draft.id ?? undefined,
        scheme: draft.proxyScheme,
        host: draft.proxyHost,
        port: Number(draft.proxyPort),
        username: draft.proxyUsername || undefined,
        password: draft.proxyPassword || undefined,
        expectedTimezone: draft.fingerprintPolicy.timezone,
        timeoutMs: 3000
      });
      await loadProfiles();
      await loadProxyRuntimeStatus(draft.id ?? undefined);
      await loadCommercialState();
      await loadTrialState();
      if (draft.id) {
        await loadAudits(draft.id);
      }
      return result.message;
    });
  };

  const handleImportSystemProxy = (): void => {
    void run('读取系统代理', async () => {
      const result = await window.fingerBrowser.proxy.system();
      applyDetectedProxy(result);
      return `${result.message}，已填入当前环境`;
    });
  };

  const handleScanLocalProxy = (): void => {
    void run('扫描本机端口', async () => {
      const result = await window.fingerBrowser.proxy.scanLocal();
      applyDetectedProxy(result);
      return `${result.message}，已填入当前环境`;
    });
  };

  const applyDetectedProxy = (result: SystemProxyDetectionResult): void => {
    if (!result.selected) {
      throw new Error(result.message);
    }
    const selected = result.selected;
    setDraft((current) => ({
      ...current,
      proxyEnabled: true,
      proxyScheme: selected.scheme,
      proxyHost: selected.host,
      proxyPort: String(selected.port),
      proxyUsername: '',
      proxyPassword: '',
      proxyBypassList: selected.bypassList.length > 0 ? selected.bypassList.join(',') : current.proxyBypassList
    }));
  };

  const handleMatchProxyTimezone = (): void => {
    void run('根据代理匹配时区', async () => {
      if (!draft.proxyHost || !draft.proxyPort) {
        throw new Error('请先填写代理主机和端口');
      }
      const result = await window.fingerBrowser.proxy.test({
        profileId: draft.id ?? undefined,
        scheme: draft.proxyScheme,
        host: draft.proxyHost,
        port: Number(draft.proxyPort),
        username: draft.proxyUsername || undefined,
        password: draft.proxyPassword || undefined,
        expectedTimezone: draft.fingerprintPolicy.timezone,
        timeoutMs: 3000
      });
      if (result.status !== 'passed') {
        throw new Error(result.message);
      }
      if (!result.ipTimezone) {
        throw new Error('未能从代理出口 IP 识别时区，请确认代理支持外网访问后重试');
      }
      const nextDraft = {
        ...draft,
        fingerprintPolicy: {
          ...draft.fingerprintPolicy,
          timezone: result.ipTimezone
        }
      };
      setDraft(nextDraft);
      if (nextDraft.id) {
        const saved = await window.fingerBrowser.profiles.update(draftToUpdateInput(nextDraft));
        await loadProfiles();
        await loadProxyRuntimeStatus(saved.id);
        await loadAudits(saved.id);
        setSelectedId(saved.id);
      }
      await loadCommercialState();
      await loadTrialState();
      return `已匹配代理 IP 时区 ${result.ipTimezone}`;
    });
  };

  const handleLaunch = (): void => {
    if (!selectedProfile) {
      return;
    }
    if (selectedProfile.archivedAt) {
      setNotice('请先恢复环境再启动');
      return;
    }
    void run('启动 Chromium', async () => {
      const launchTarget = draft.id === selectedProfile.id ? await window.fingerBrowser.profiles.update(draftToUpdateInput(draft)) : selectedProfile;
      await window.fingerBrowser.profiles.launch(launchTarget.id);
      await loadProfiles();
      await loadProxyRuntimeStatus(launchTarget.id);
      await loadCommercialState();
      await loadTrialState();
      await loadAudits(launchTarget.id);
    });
  };

  const handleStop = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('关闭环境', async () => {
      await window.fingerBrowser.profiles.stop(selectedProfile.id);
      await loadProfiles();
      await loadProxyRuntimeStatus(selectedProfile.id);
      await loadCommercialState();
      await loadAudits(selectedProfile.id);
    });
  };

  const handleArchiveProfile = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('归档环境', async () => {
      const archived = await window.fingerBrowser.profiles.archive(selectedProfile.id);
      await loadProfiles();
      await loadDesktopShortcuts();
      await loadCommercialState();
      await loadAudits(archived.id);
      return `已归档环境：${archived.name}`;
    });
  };

  const handleRestoreProfile = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('恢复环境', async () => {
      const restored = await window.fingerBrowser.profiles.restore(selectedProfile.id);
      await loadProfiles();
      await loadDesktopShortcuts();
      await loadCommercialState();
      await loadAudits(restored.id);
      return `已恢复环境：${restored.name}`;
    });
  };

  const handleEnsureChromium = (): void => {
    const runtimeChannel = draft.runtimeChannel;
    void run(runtimeChannel === 'custom-kernel' ? '检查自研内核' : '检查 Chromium', async () => {
      if (runtimeChannel === 'custom-kernel') {
        const result = await window.fingerBrowser.kernel.ensureInstalled();
        await loadKernelState();
        await loadAudits(selectedProfile?.id);
        return `自研内核 ${result.manifest.version} ${result.alreadyInstalled ? '已就绪' : '已安装'}`;
      }
      const result = await window.fingerBrowser.chromium.ensureInstalled();
      await loadAudits(selectedProfile?.id);
      return `官方 Chromium ${result.version} ${result.alreadyInstalled ? '已就绪' : '已安装'}`;
    });
  };

  const handleImportKernelManifest = (): void => {
    void run('导入自研内核 manifest', async () => {
      const status = await window.fingerBrowser.kernel.importManifest();
      setKernelStatus(status);
      setKernelManifest(status.manifest);
      await loadAudits(selectedProfile?.id);
      return `已导入自研内核 ${status.manifest.version}`;
    });
  };

  const handleClearKernelManifest = (): void => {
    void run('重置自研内核 manifest', async () => {
      const status = await window.fingerBrowser.kernel.clearManifest();
      setKernelStatus(status);
      setKernelManifest(status.manifest);
      await loadAudits(selectedProfile?.id);
      return '已重置为内置默认 manifest';
    });
  };

  const handleOpenKernelRuntimeFolder = (): void => {
    void run('打开自研内核目录', async () => {
      const result = await window.fingerBrowser.kernel.openRuntimeFolder();
      return `已打开：${result.folderPath}`;
    });
  };

  const handleSaveGoogleAccountConfig = (): void => {
    void run('保存 Google 账号配置', async () => {
      const status = await window.fingerBrowser.googleAccount.save({
        enabled: googleAccountDraft.enabled,
        apiKey: googleAccountDraft.apiKey,
        clientId: googleAccountDraft.clientId,
        clientSecret: googleAccountDraft.clientSecret
      });
      setGoogleAccountStatus(status);
      setGoogleAccountDraft({
        enabled: status.enabled,
        apiKey: '',
        clientId: '',
        clientSecret: ''
      });
      await loadAudits(selectedProfile?.id);
      return status.enabled ? 'Google 账号登录支持已启用' : 'Google 账号登录支持已保存但未启用';
    });
  };

  const handleClearGoogleAccountConfig = (): void => {
    void run('清除 Google 账号配置', async () => {
      const status = await window.fingerBrowser.googleAccount.clear();
      setGoogleAccountStatus(status);
      setGoogleAccountDraft(emptyGoogleAccountDraft);
      await loadAudits(selectedProfile?.id);
      return '已清除 Google 账号配置';
    });
  };

  const handleActivateLicense = (): void => {
    void run('激活许可证', async () => {
      const state = await window.fingerBrowser.license.activate({ activationCode });
      setLicense(state);
      await loadCommercialState();
      await loadTrialState();
      await loadAudits();
      setActivationCode('');
      return `${state.teamName} ${state.plan.name} 已激活`;
    });
  };

  const handleRefreshLicense = (): void => {
    void run('刷新许可证', async () => {
      const state = await window.fingerBrowser.license.refresh();
      setLicense(state);
      await loadCommercialState();
      await loadTrialState();
      await loadAudits();
      return `许可证状态：${licenseStatusText[state.status]}`;
    });
  };

  const handleDeactivateLicense = (): void => {
    void run('停用许可证', async () => {
      const state = await window.fingerBrowser.license.deactivate();
      setLicense(state);
      await loadCommercialState();
      await loadTrialState();
      await loadAudits();
    });
  };

  const handleAuditExport = (): void => {
    void run('导出审计', async () => {
      const result = await window.fingerBrowser.audit.export(selectedProfile?.id);
      await loadAudits(selectedProfile?.id);
      return `审计已导出：${result.filePath}`;
    });
  };

  const handleProfilesExport = (): void => {
    void run('导出配置', async () => {
      const result = await window.fingerBrowser.profiles.export();
      await loadAudits();
      return `配置已导出：${result.filePath}`;
    });
  };

  const handleBatchProxyTest = (): void => {
    void run('批量检测代理', async () => {
      const results = await window.fingerBrowser.proxy.testAll();
      await loadProfiles();
      await loadProxyRuntimeStatus();
      await loadAudits(selectedProfile?.id);
      return `已检测 ${results.length} 个代理`;
    });
  };

  const handlePackageLogs = (): void => {
    void run('打包支持日志', async () => {
      const result = await window.fingerBrowser.support.packageLogs();
      await loadAudits();
      return `支持日志已打包：${result.filePath}`;
    });
  };

  const handleOpenPasswordGenerator = (target: Exclude<PasswordGeneratorTarget, null>): void => {
    const nextOptions = normalizePasswordGeneratorOptions(passwordGeneratorOptions);
    setPasswordGeneratorOptions(nextOptions);
    setGeneratedPassword(generatePassword(nextOptions));
    setPasswordGeneratorTarget(target);
  };

  const handlePasswordGeneratorOptionsChange = (patch: Partial<PasswordGeneratorOptions>): void => {
    const nextOptions = normalizePasswordGeneratorOptions({
      ...passwordGeneratorOptions,
      ...patch
    });
    setPasswordGeneratorOptions(nextOptions);
    setGeneratedPassword(generatePassword(nextOptions));
  };

  const handleRegeneratePassword = (): void => {
    setGeneratedPassword(generatePassword(passwordGeneratorOptions));
  };

  const handleUseGeneratedPassword = (): void => {
    const password = generatedPassword || generatePassword(passwordGeneratorOptions);
    if (passwordGeneratorTarget === 'vault') {
      setVaultDraft((current) => ({ ...current, password }));
    }
    if (passwordGeneratorTarget === 'profile') {
      setCredentialDraft((current) => ({ ...current, password }));
    }
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
  };

  const handleEditCredential = (credential: CredentialEntry): void => {
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
    setCredentialDraft({
      id: credential.id,
      profileId: credential.profileId,
      title: credential.title,
      websiteUrl: credential.websiteUrl,
      username: credential.username,
      password: ''
    });
  };

  const handleResetCredential = (): void => {
    setCredentialDraft(emptyCredentialDraft);
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const handleSaveCredential = (): void => {
    if (!selectedProfile) {
      setNotice('请先选择浏览器环境');
      return;
    }
    void run('保存密码项', async () => {
      if (credentialDraft.id) {
        await window.fingerBrowser.credentials.update({
          id: credentialDraft.id,
          profileId: selectedProfile.id,
          title: credentialDraft.title,
          websiteUrl: credentialDraft.websiteUrl,
          username: credentialDraft.username,
          password: credentialDraft.password || undefined
        });
      } else {
        await window.fingerBrowser.credentials.create({
          profileId: selectedProfile.id,
          title: credentialDraft.title,
          websiteUrl: credentialDraft.websiteUrl,
          username: credentialDraft.username,
          password: credentialDraft.password
        });
      }
      await loadCredentials(selectedProfile.id, true);
      await loadTrialState();
      await loadAudits(selectedProfile.id);
      setCredentialDraft(emptyCredentialDraft);
      setPasswordGeneratorTarget(null);
      setGeneratedPassword('');
      setRevealedCredential(null);
    });
  };

  const handleEditVaultCredential = (credential: CredentialEntry): void => {
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
    setSelectedVaultCredentialId(credential.id);
    setVaultEditorMode('edit');
    setVaultDraft({
      id: credential.id,
      profileId: credential.profileId,
      title: credential.title,
      websiteUrl: credential.websiteUrl,
      username: credential.username,
      password: ''
    });
  };

  const handleNewVaultCredential = (): void => {
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
    setVaultDraft({
      ...emptyCredentialDraft,
      profileId: vaultMenuId.startsWith('profile:') ? vaultMenuId.replace('profile:', '') : null
    });
    setSelectedVaultCredentialId(null);
    setVaultEditorMode('new');
    setNotice('正在新增全局密码项');
  };

  const handleOpenSelectedProfileVault = (): void => {
    if (!selectedProfile) {
      return;
    }
    handleOpenVault(`profile:${selectedProfile.id}`);
  };

  const handleOpenSecurityLab = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('打开本地安全实验页', async () => {
      const result = await window.fingerBrowser.securityLab.open(selectedProfile.id);
      await loadAudits(selectedProfile.id);
      return `已打开本地安全实验页，绑定密码项 ${result.boundCredentialCount} 个`;
    });
  };

  const handleResetVaultCredential = (): void => {
    setVaultDraft(emptyCredentialDraft);
    setVaultEditorMode('view');
    setPasswordGeneratorTarget(null);
    setGeneratedPassword('');
    setRevealedCredential(null);
  };

  const refreshCredentialViews = useCallback(async () => {
    if (selectedProfile && credentialsEnabled) {
      await loadCredentials(selectedProfile.id, true);
    } else {
      setCredentials([]);
    }
    if (workspaceView === 'vault') {
      await loadVaultCredentials();
    }
    await loadTrialState();
    await loadAudits(workspaceView === 'vault' ? undefined : selectedProfile?.id);
  }, [credentialsEnabled, loadAudits, loadCredentials, loadTrialState, loadVaultCredentials, selectedProfile, workspaceView]);

  const handleSaveVaultCredential = (): void => {
    if (!passwordVaultEnabled) {
      setNotice('请先激活许可证');
      return;
    }
    void run('保存密码项', async () => {
      let saved: CredentialEntry;
      if (vaultDraft.id) {
        saved = await window.fingerBrowser.credentials.update({
          id: vaultDraft.id,
          profileId: vaultDraft.profileId,
          title: vaultDraft.title,
          websiteUrl: vaultDraft.websiteUrl,
          username: vaultDraft.username,
          password: vaultDraft.password || undefined
        });
      } else {
        saved = await window.fingerBrowser.credentials.create({
          profileId: vaultDraft.profileId,
          title: vaultDraft.title,
          websiteUrl: vaultDraft.websiteUrl,
          username: vaultDraft.username,
          password: vaultDraft.password
        });
      }
      await refreshCredentialViews();
      setSelectedVaultCredentialId(saved.id);
      setVaultEditorMode('view');
      setVaultDraft(emptyCredentialDraft);
      setPasswordGeneratorTarget(null);
      setGeneratedPassword('');
      setRevealedCredential(null);
    });
  };

  const handleDeleteCredential = (credential: CredentialEntry): void => {
    void run('删除密码项', async () => {
      await window.fingerBrowser.credentials.delete(credential.id);
      await refreshCredentialViews();
      setCredentialDraft((current) => (current.id === credential.id ? emptyCredentialDraft : current));
      setVaultDraft((current) => (current.id === credential.id ? emptyCredentialDraft : current));
      setSelectedVaultCredentialId((current) => (current === credential.id ? null : current));
      setVaultEditorMode((current) => (selectedVaultCredentialId === credential.id ? 'view' : current));
      setRevealedCredential((current) => (current?.id === credential.id ? null : current));
    });
  };

  const handleCopyUsername = (credential: CredentialEntry): void => {
    void run('复制账号', async () => {
      await window.fingerBrowser.credentials.copyUsername(credential.id);
      await refreshCredentialViews();
      return '账号已复制到剪贴板';
    });
  };

  const handleCopyPassword = (credential: CredentialEntry): void => {
    void run('复制密码', async () => {
      await window.fingerBrowser.credentials.copyPassword(credential.id);
      await refreshCredentialViews();
      return '密码已复制到剪贴板';
    });
  };

  const handleToggleRevealPassword = (credential: CredentialEntry): void => {
    if (revealedCredential?.id === credential.id) {
      setRevealedCredential(null);
      setNotice('密码已隐藏');
      return;
    }
    void run('查看密码', async () => {
      const result = await window.fingerBrowser.credentials.revealPassword(credential.id);
      setRevealedCredential({ id: credential.id, password: result.password });
      await loadAudits(workspaceView === 'vault' ? undefined : selectedProfile?.id);
      return '密码已显示';
    });
  };

  const handleCheckUpdates = (): void => {
    void run('检查更新', async () => {
      const result = await window.fingerBrowser.release.checkForUpdates();
      setReleaseCheck(result);
      await loadTrialState();
      await loadAudits();
      return result.message;
    });
  };

  const handleOpenRelease = (): void => {
    void run('打开 Release 页面', async () => {
      const result = await window.fingerBrowser.release.openLatestRelease();
      return `已打开：${result.releaseUrl}`;
    });
  };

  const handleCopyDiagnostics = (): void => {
    void run('复制诊断信息', async () => {
      const diagnostics = {
        version: appVersion,
        license: license ? { status: license.status, plan: license.plan.id, teamName: license.teamName } : null,
        metrics,
        kernel: kernelStatus
          ? {
              source: kernelStatus.source,
              version: kernelStatus.manifest.version,
              baseChromiumRevision: kernelStatus.manifest.baseChromiumRevision,
              patchsetVersion: kernelStatus.manifest.patchsetVersion,
              installed: kernelStatus.installed
            }
          : null,
        profileCount: profiles.length
      };
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      return '诊断信息已复制到剪贴板';
    });
  };

  const handlePackageFeedback = (): void => {
    void run('生成反馈包', async () => {
      const result = await window.fingerBrowser.feedback.package(feedbackDraft);
      await loadTrialState();
      await loadAudits();
      return `反馈包已生成：${result.filePath}`;
    });
  };

  const renderPasswordGenerator = (target: Exclude<PasswordGeneratorTarget, null>): JSX.Element | null => {
    if (!passwordVaultEnabled || passwordGeneratorTarget !== target) {
      return null;
    }

    return (
      <div className="password-generator-panel" aria-label="密码生成器">
        <div className="password-generator-header">
          <div>
            <strong>密码生成器</strong>
            <span>随机强密码，不自动保存</span>
          </div>
          <span className="generated-password-mask" aria-label="生成密码已隐藏">
            {generatedPassword ? '••••••••••••••••••••' : '待生成'}
          </span>
        </div>

        <div className="password-generator-controls">
          <label>
            长度
            <input
              aria-label="密码长度"
              type="number"
              min={PASSWORD_GENERATOR_MIN_LENGTH}
              max={PASSWORD_GENERATOR_MAX_LENGTH}
              value={passwordGeneratorOptions.length}
              onChange={(event) => handlePasswordGeneratorOptionsChange({ length: Number(event.target.value) })}
            />
          </label>
          <label className="check-row generator-check">
            <input
              aria-label="包含大写字母"
              type="checkbox"
              checked={passwordGeneratorOptions.includeUppercase}
              onChange={(event) => handlePasswordGeneratorOptionsChange({ includeUppercase: event.target.checked })}
            />
            大写
          </label>
          <label className="check-row generator-check">
            <input
              aria-label="包含数字"
              type="checkbox"
              checked={passwordGeneratorOptions.includeNumbers}
              onChange={(event) => handlePasswordGeneratorOptionsChange({ includeNumbers: event.target.checked })}
            />
            数字
          </label>
          <label className="check-row generator-check">
            <input
              aria-label="包含符号"
              type="checkbox"
              checked={passwordGeneratorOptions.includeSymbols}
              onChange={(event) => handlePasswordGeneratorOptionsChange({ includeSymbols: event.target.checked })}
            />
            符号
          </label>
        </div>

        <div className="password-generator-note">小写字母始终启用，每个启用字符集至少包含 1 个字符。</div>
        <div className="ops-row">
          <button className="secondary-button" type="button" onClick={handleRegeneratePassword}>
            <RefreshCw size={15} />
            重新生成
          </button>
          <button className="primary-button" type="button" onClick={handleUseGeneratedPassword}>
            <Save size={15} />
            使用密码
          </button>
        </div>
      </div>
    );
  };

  if (!authStatus) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="section-kicker">云账号体系</p>
            <h1>加载云端会话</h1>
          </div>
          <footer className="notice-bar" aria-live="polite">
            {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
            {notice}
          </footer>
        </section>
      </main>
    );
  }

  if (!authStatus.bootstrapped || !authStatus.authenticated) {
    const isSetup = !authStatus.bootstrapped;
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-lockup">
            <div className="brand-mark">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="section-kicker">云端工作台</p>
              <h1>指纹浏览器</h1>
            </div>
          </div>
          <div className="auth-heading">
            <p className="section-kicker">{isSetup ? '旧版本机初始化' : '云账号登录'}</p>
            <h2>{isSetup ? '创建管理员账号' : '登录云账号'}</h2>
            <span>
              {isSetup
                ? '管理员用于管理本机用户、授权和环境资产。'
                : '登录后会进入团队云工作区，并同步环境、密码库、审计和浏览器状态。'}
            </span>
          </div>
          <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              {isSetup ? '管理员邮箱' : '邮箱'}
              <input
                aria-label={isSetup ? '管理员邮箱' : '邮箱'}
                autoComplete="username"
                value={authDraft.email}
                onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })}
                placeholder="admin@example.test"
              />
            </label>
            {isSetup ? (
              <label>
                管理员名称
                <input
                  aria-label="管理员名称"
                  value={authDraft.displayName}
                  onChange={(event) => setAuthDraft({ ...authDraft, displayName: event.target.value })}
                  placeholder="管理员"
                />
              </label>
            ) : null}
            <label>
              {isSetup ? '管理员密码' : '密码'}
              <input
                aria-label={isSetup ? '管理员密码' : '密码'}
                type="password"
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                value={authDraft.password}
                onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })}
                placeholder="至少 8 位"
              />
            </label>
            <button
              className="primary-button wide"
              type="button"
              onClick={isSetup ? handleBootstrapAdmin : handleLogin}
              disabled={busy || !authDraft.email || !authDraft.password || (isSetup && !authDraft.displayName)}
            >
              {isSetup ? <UserPlus size={16} /> : <UserCheck size={16} />}
              {isSetup ? '创建管理员' : '登录云账号'}
            </button>
          </form>
          <footer className="notice-bar" aria-live="polite">
            {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
            {notice}
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1>指纹浏览器</h1>
            <p>企业环境管理</p>
          </div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          <a
            className={activeNavKey === 'profiles' ? 'active' : ''}
            href="#profiles"
            onClick={(event) => {
              event.preventDefault();
              handleOpenProfiles('profiles');
            }}
          >
            <Globe2 size={17} />
            环境
          </a>
          <a
            className={activeNavKey === 'desktop' ? 'active' : ''}
            href="#my-desktop"
            onClick={(event) => {
              event.preventDefault();
              handleOpenDesktop();
            }}
          >
            <Grid2X2 size={17} />
            我的桌面
          </a>
          <a
            className={activeNavKey === 'proxies' ? 'active' : ''}
            href="#proxy-pool"
            onClick={(event) => {
              event.preventDefault();
              handleOpenProxyPool();
            }}
          >
            <Wifi size={17} />
            代理池
          </a>
          <a
            className={activeNavKey === 'vault' ? 'active' : ''}
            href="#password-vault"
            onClick={(event) => {
              event.preventDefault();
              handleOpenVault();
            }}
          >
            <LockKeyhole size={17} />
            密码库
          </a>
        </nav>
        <div className="user-session-card" aria-label="当前用户">
          <div>
            <strong>{authStatus.currentUser?.displayName ?? '云端用户'}</strong>
            <span>
              {authStatus.currentUser?.email ?? ''}
              {authStatus.currentUser ? ` · ${userRoleText[authStatus.currentUser.role]}` : ''}
            </span>
            <span>{authStatus.currentTeam?.name ? `团队：${authStatus.currentTeam.name}` : '团队云工作区'}</span>
            {syncStatus ? (
              <span>
                {syncStatus.hasLocalDataToMigrate
                  ? '发现可迁移的本机数据'
                  : `待同步 ${syncStatus.pendingLocalRecords} 项 · 运行锁 ${syncStatus.runningProfileLocks}`}
              </span>
            ) : null}
          </div>
          <button className="secondary-button compact-button" type="button" onClick={handleLogout} disabled={busy}>
            <LogOut size={14} />
            退出
          </button>
        </div>
        <div className="sync-actions" aria-label="云同步操作">
          {syncStatus?.hasLocalDataToMigrate ? (
            <button className="secondary-button compact-button" type="button" onClick={handleMigrateLocalData} disabled={busy}>
              <Upload size={14} />
              迁移本机数据
            </button>
          ) : null}
          <button className="secondary-button compact-button" type="button" onClick={handlePullWorkspace} disabled={busy}>
            <Download size={14} />
            拉取云端
          </button>
          <button className="secondary-button compact-button" type="button" onClick={handlePushPendingChanges} disabled={busy}>
            <Upload size={14} />
            推送变更
          </button>
        </div>
        <div className="policy-note">
          <ShieldCheck size={17} />
          <span>云同步仅用于授权团队设备的数据连续性。</span>
        </div>
      </aside>

      {workspaceView === 'profiles' ? (
      <section className="profile-list" id="profiles">
        <header className="topbar">
          <div>
            <p className="section-kicker">本地工作台</p>
            <h2>浏览器环境</h2>
          </div>
          <button className="primary-button" type="button" onClick={handleNewProfile}>
            <FolderPlus size={17} />
            新建环境
          </button>
        </header>

        <section className={`license-banner ${license?.status ?? 'inactive'}`} id="license">
          <div>
            <div className="license-banner-title">
              <BadgeCheck size={16} />
              {license ? licenseStatusText[license.status] : '未激活'}
              {license?.teamName ? ` · ${license.teamName}` : ''}
            </div>
            <p>
              {license?.status === 'inactive'
                ? '输入人工销售发放的激活码后即可创建浏览器环境。'
                : `${license?.plan.name ?? '试卖套餐'} · 环境 ${usage?.profilesUsed ?? 0}/${usage?.profileLimit ?? 0} · 席位 ${
                    usage?.seatsUsed ?? 0
                  }/${usage?.seatLimit ?? 0} · 剩余 ${license?.daysRemaining ?? 0} 天`}
            </p>
          </div>
          <div className="usage-meter" aria-label="环境用量">
            <span style={{ width: `${licenseUsagePercent}%` }} />
          </div>
          {license?.status === 'inactive' || license?.status === 'expired' ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                handleOpenProfiles('profiles');
                setActiveTab('license');
              }}
            >
              <KeyRound size={16} />
              激活许可证
            </button>
          ) : null}
        </section>

        <section className="profile-ops-summary" aria-label="环境运营摘要">
          <section className="profile-health-strip" aria-label="环境健康概览">
            <div className="profile-health-summary readiness" aria-label="环境就绪率">
              <BadgeCheck size={16} />
              <span>就绪率</span>
              <strong>{profileHealthReadiness.label}</strong>
              <small>
                {profileHealthReadiness.ready}/{profileHealthReadiness.activeTotal}
              </small>
            </div>
            <button
              className={`profile-health-summary all ${profileHealthFilter === 'all' ? 'active' : ''}`}
              type="button"
              aria-label="筛选全部健康环境"
              aria-pressed={profileHealthFilter === 'all'}
              onClick={() => handleProfileHealthFilterChange('all')}
            >
              <Globe2 size={16} />
              <span>全部</span>
              <strong>{profiles.length}</strong>
            </button>
            <button
              className={`profile-health-summary ready ${profileHealthFilter === 'ready' ? 'active' : ''}`}
              type="button"
              aria-label="筛选已就绪环境"
              aria-pressed={profileHealthFilter === 'ready'}
              onClick={() => handleProfileHealthFilterChange('ready')}
            >
              <CheckCircle2 size={16} />
              <span>已就绪</span>
              <strong>{profileHealthStats.ready}</strong>
            </button>
            <button
              className={`profile-health-summary attention ${profileHealthFilter === 'attention' ? 'active' : ''}`}
              type="button"
              aria-label="筛选待补全环境"
              aria-pressed={profileHealthFilter === 'attention'}
              onClick={() => handleProfileHealthFilterChange('attention')}
            >
              <Activity size={16} />
              <span>待补全</span>
              <strong>{profileHealthStats.attention}</strong>
            </button>
            <button
              className={`profile-health-summary archived ${profileHealthFilter === 'archived' ? 'active' : ''}`}
              type="button"
              aria-label="筛选已归档环境"
              aria-pressed={profileHealthFilter === 'archived'}
              onClick={() => handleProfileHealthFilterChange('archived')}
            >
              <PackageCheck size={16} />
              <span>已归档</span>
              <strong>{profileHealthStats.archived}</strong>
            </button>
          </section>

          <section
            className={`profile-delivery-guidance ${profileDeliveryGuidance.tone}`}
            aria-label="交付检查结论"
          >
            <div>
              <PackageCheck size={16} />
              <span>交付结论</span>
              <strong>{profileDeliveryGuidance.conclusion}</strong>
            </div>
            <p>{profileDeliveryGuidance.nextStep}</p>
          </section>

          <section className="profile-issue-strip" aria-label="健康问题分布">
            <span className="profile-issue-title">问题分布</span>
            {profileHealthIssueStats.map((stat) => (
              <button
                className={`profile-issue-chip ${stat.count > 0 ? 'issue-hot' : 'issue-clear'} ${
                  profileHealthIssueFilter === stat.key ? 'active' : ''
                }`}
                type="button"
                aria-label={`筛选${stat.key}问题环境`}
                aria-pressed={profileHealthIssueFilter === stat.key}
                onClick={() => handleProfileHealthIssueFilterChange(stat.key)}
                key={stat.key}
              >
                {stat.label}
                <strong>{stat.count}</strong>
              </button>
            ))}
            <button
              className="secondary-button compact-button profile-health-copy-button"
              type="button"
              onClick={handleCopyProfileHealthReport}
              disabled={busy}
            >
              <ClipboardCheck size={14} />
              复制健康摘要
            </button>
          </section>
        </section>

        <section className="profile-command-panel" aria-label="环境查询与工具">
          <div className="search-row">
            <Search size={16} />
            <input
              aria-label="搜索环境"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、负责人、备注、标签、代理或状态"
            />
          </div>

          <div className="profile-filter-bar" aria-label="环境筛选">
            <label>
              分组
              <select
                aria-label="筛选分组"
                value={profileGroupFilter}
                onChange={(event) => setProfileGroupFilter(event.target.value)}
              >
                <option value="">全部分组</option>
                {profileGroupOptions.map((groupName) => (
                  <option value={groupName} key={groupName}>
                    {groupName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select
                aria-label="筛选状态"
                value={profileStatusFilter}
                onChange={(event) => setProfileStatusFilter(event.target.value as WorkbenchStatusFilter)}
              >
                <option value="all">全部状态</option>
                <option value="running">运行中</option>
                <option value="closed">已关闭</option>
                <option value="error">异常</option>
              </select>
            </label>
            <label>
              健康
              <select
                aria-label="筛选健康"
                value={profileHealthFilter}
                onChange={(event) => handleProfileHealthFilterChange(event.target.value as WorkbenchHealthFilter)}
              >
                <option value="all">全部健康</option>
                <option value="ready">已就绪</option>
                <option value="attention">待补全</option>
                <option value="archived">已归档</option>
              </select>
            </label>
            <label>
              问题
              <select
                aria-label="筛选问题"
                value={profileHealthIssueFilter}
                onChange={(event) => handleProfileHealthIssueFilterChange(event.target.value as WorkbenchHealthIssueFilter)}
              >
                {Object.entries(profileHealthIssueFilterText).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              内核
              <select
                aria-label="筛选内核"
                value={profileRuntimeFilter}
                onChange={(event) => setProfileRuntimeFilter(event.target.value as WorkbenchRuntimeFilter)}
              >
                <option value="all">全部内核</option>
                <option value="official">官方稳定版</option>
                <option value="custom-kernel">自研内核</option>
              </select>
            </label>
            <label>
              代理
              <select
                aria-label="筛选代理"
                value={profileProxyFilter}
                onChange={(event) => setProfileProxyFilter(event.target.value as WorkbenchProxyFilter)}
              >
                <option value="all">全部代理</option>
                <option value="configured">已配置</option>
                <option value="missing">未配置</option>
                <option value="passed">代理可用</option>
                <option value="failed">代理失败</option>
                <option value="untested">未检测</option>
              </select>
            </label>
            <label>
              归档
              <select
                aria-label="筛选归档"
                value={profileArchiveFilter}
                onChange={(event) => setProfileArchiveFilter(event.target.value as WorkbenchArchiveFilter)}
              >
                <option value="active">未归档</option>
                <option value="archived">已归档</option>
                <option value="all">全部环境</option>
              </select>
            </label>
          </div>

        <details className="profile-tool-panel" aria-label="环境模板工具">
          <summary>
            <span>
              <PackageCheck size={15} />
              <strong>环境模板</strong>
              <small>{profileTemplates.length} 个模板</small>
            </span>
            <span className="profile-tool-panel-hint">展开</span>
          </summary>
          <section className="template-toolbar" aria-label="环境模板">
            <div className="template-toolbar-title">
              <strong>模板</strong>
              <span>{profileTemplates.length} 个模板</span>
            </div>
          <label>
            模板名称
            <input
              aria-label="模板名称"
              value={profileTemplateDraftName}
              onChange={(event) => setProfileTemplateDraftName(event.target.value)}
              placeholder={selectedProfile ? `${selectedProfile.name} 模板` : '选择环境后保存'}
            />
          </label>
          <button className="secondary-button" type="button" onClick={handleSaveProfileTemplate} disabled={!selectedProfile || busy}>
            <PackageCheck size={15} />
            保存为模板
          </button>
          <label>
            选择模板
            <select
              aria-label="选择环境模板"
              value={selectedProfileTemplateId}
              onChange={(event) => setSelectedProfileTemplateId(event.target.value)}
            >
              <option value="">未选择模板</option>
              {profileTemplates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={handleCreateProfileFromTemplate}
            disabled={!selectedProfileTemplate || busy}
          >
            <FolderPlus size={15} />
            从模板创建
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={handleDeleteProfileTemplate}
            disabled={!selectedProfileTemplate || busy}
            aria-label="删除环境模板"
            title="删除模板"
          >
            <Trash2 size={15} />
          </button>
          </section>
        </details>

        <details className="profile-tool-panel selection-panel" aria-label="批量操作工具">
          <summary>
            <span>
              <SlidersHorizontal size={15} />
              <strong>批量操作</strong>
              <small>
                已选 {visibleSelectedProfileIds.length} 个环境 · 当前筛选 {filteredProfiles.length} 个
              </small>
            </span>
            <span className="profile-tool-panel-hint">展开</span>
          </summary>
          <section className="batch-toolbar" aria-label="批量操作">
            <div className="batch-toolbar-title">
              <strong>已选 {visibleSelectedProfileIds.length} 个环境</strong>
              <span>当前筛选 {filteredProfiles.length} 个</span>
            </div>
          <div className="batch-grid">
            <label>
              批量分组
              <input
                aria-label="批量分组"
                value={profileBatchDraft.groupName}
                onChange={(event) => setProfileBatchDraft({ ...profileBatchDraft, groupName: event.target.value })}
                placeholder="项目、客户或团队"
              />
            </label>
            <button className="secondary-button" type="button" onClick={handleBatchUpdateGroup} disabled={busy || visibleSelectedProfileIds.length === 0}>
              修改分组
            </button>
            <label>
              批量标签
              <input
                aria-label="批量标签"
                value={profileBatchDraft.tags}
                onChange={(event) => setProfileBatchDraft({ ...profileBatchDraft, tags: event.target.value })}
                placeholder="合规,测试"
              />
            </label>
            <button className="secondary-button" type="button" onClick={handleBatchUpdateTags} disabled={busy || visibleSelectedProfileIds.length === 0}>
              修改标签
            </button>
            <label>
              代理池
              <select
                aria-label="批量代理池"
                value={profileBatchDraft.proxyPoolEntryId}
                onChange={(event) => setProfileBatchDraft({ ...profileBatchDraft, proxyPoolEntryId: event.target.value })}
              >
                <option value="">选择代理</option>
                {proxyPoolEntries.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={handleBatchApplyProxy} disabled={busy || visibleSelectedProfileIds.length === 0}>
              应用代理
            </button>
          </div>
          <div className="batch-actions">
            <label className="check-row">
              <input
                aria-label="批量同步代理时区"
                type="checkbox"
                checked={profileBatchDraft.matchTimezone}
                onChange={(event) => setProfileBatchDraft({ ...profileBatchDraft, matchTimezone: event.target.checked })}
              />
              同步代理时区
            </label>
            <button className="secondary-button" type="button" onClick={handleBatchStopProfiles} disabled={busy || visibleSelectedProfileIds.length === 0}>
              <Power size={15} />
              批量关闭
            </button>
          </div>
          </section>
        </details>
        </section>

        <section className="profile-table-shell" aria-label="环境资产表格">
          <div className="table-header">
            <label className="profile-check-cell">
              <input
                aria-label="选择当前筛选环境"
                type="checkbox"
                checked={allFilteredProfilesSelected}
                onChange={handleToggleAllFilteredProfiles}
              />
            </label>
            <span>环境</span>
            <span>状态</span>
            <span>健康</span>
            <span>代理</span>
            <span>内核</span>
          </div>

          <div className="profile-rows" role="list" aria-label="环境列表">
            {filteredProfiles.map((profile) => {
              const health = profileHealthById.get(profile.id) ?? getProfileHealth(profile);
              const healthTitle = health.issues.length > 0 ? health.issues.join('；') : '环境配置完整';
              return (
                <article
                  className={`profile-row ${profile.id === selectedId ? 'selected' : ''}`}
                  key={profile.id}
                >
                  <label className="profile-check-cell">
                    <input
                      aria-label={`选择环境 ${profile.name}`}
                      type="checkbox"
                      checked={visibleSelectedProfileIds.includes(profile.id)}
                      onChange={() => handleToggleProfileSelection(profile.id)}
                    />
                  </label>
                  <button
                    className="profile-row-content"
                    onClick={() => {
                      setSelectedId(profile.id);
                      setActiveTab('config');
                      setActiveNavKey('profiles');
                    }}
                    type="button"
                  >
                    <span className="profile-name-cell">
                      <strong>{profile.name}</strong>
                      <small>
                        {profile.archivedAt ? '已归档 · ' : ''}
                        {profile.groupName ? `${profile.groupName} · ` : ''}
                        {profile.owner ? `${profile.owner} · ` : ''}
                        {profile.tags.length > 0 ? profile.tags.join(' / ') : '未设置标签'}
                        {profile.lastLaunchedAt ? ` · 最近 ${formatDate(profile.lastLaunchedAt)}` : ''}
                      </small>
                    </span>
                    <span className={`status-pill ${statusTone[profile.status]}`}>
                      <Circle size={9} fill="currentColor" />
                      {statusText[profile.status]}
                    </span>
                    <span className={`health-pill ${profileHealthTone[health.status]}`} title={healthTitle}>
                      {health.label}
                    </span>
                    <span>{profile.proxy ? `${profile.proxy.scheme}://${profile.proxy.host}:${profile.proxy.port}` : '未配置'}</span>
                    <span>{runtimeChannelText[profile.runtimeChannel]}</span>
                  </button>
                </article>
              );
            })}
            {filteredProfiles.length === 0 ? (
              <div className="empty-state">
                <Activity size={18} />
                <span>暂无环境，点击“新建环境”开始。</span>
              </div>
            ) : null}
            </div>
        </section>
      </section>
      ) : workspaceView === 'proxies' ? (
        <section className="profile-list proxy-pool-workspace" id="proxy-pool">
          <header className="topbar">
            <div>
              <p className="section-kicker">代理资产</p>
              <h2>代理池</h2>
            </div>
            <button className="primary-button" type="button" onClick={handleNewProxyPoolEntry}>
              <Wifi size={17} />
              新增代理
            </button>
          </header>

          <div className="search-row">
            <Search size={16} />
            <input
              aria-label="搜索代理池"
              value={proxyPoolQuery}
              onChange={(event) => setProxyPoolQuery(event.target.value)}
              placeholder="搜索名称、主机、标签、地区或时区"
            />
          </div>

          <div className="proxy-pool-list" aria-label="代理池列表">
            {filteredProxyPoolEntries.map((entry) => (
              <button
                className={`proxy-pool-row ${entry.id === selectedProxyPoolEntryId ? 'selected' : ''}`}
                key={entry.id}
                type="button"
                onClick={() => handleEditProxyPoolEntry(entry)}
              >
                <span className="proxy-pool-main">
                  <strong>{entry.name}</strong>
                  <small>{entry.scheme.toUpperCase()} · {entry.host}:{entry.port}</small>
                  <small>{entry.tags.length > 0 ? entry.tags.join(' / ') : '未设置标签'}</small>
                </span>
                <span className={`status-pill ${entry.lastTestStatus === 'passed' ? 'good' : entry.lastTestStatus === 'failed' ? 'bad' : 'muted'}`}>
                  <Circle size={9} fill="currentColor" />
                  {proxyTestStatusText[entry.lastTestStatus]}
                </span>
                <span>{entry.timezone || '未设置时区'}</span>
                <span>{entry.assignedProfileCount} 个环境</span>
              </button>
            ))}
            {filteredProxyPoolEntries.length === 0 ? (
              <div className="empty-state">
                <Wifi size={18} />
                <span>暂无代理，点击“新增代理”建立代理池。</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : workspaceView === 'vault' ? (
        <section className="profile-list vault-workspace" id="password-vault">
          <header className="topbar">
            <div>
              <p className="section-kicker">全局资产</p>
              <h2>{activeVaultMenuItem?.label ?? '密码库'}</h2>
            </div>
            <button className="primary-button" type="button" onClick={handleNewVaultCredential}>
              <LockKeyhole size={17} />
              新增密码
            </button>
          </header>

          {license?.status !== 'active' && license?.status !== 'grace' ? (
            <div className="credential-locked vault-locked">
              <LockKeyhole size={18} />
              <div>
                <strong>密码库需要有效许可证</strong>
                <p>激活或恢复许可证后即可独立管理全局密码，并按需绑定到浏览器环境。</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  handleOpenProfiles('profiles');
                  setActiveTab('license');
                }}
              >
                <KeyRound size={16} />
                前往授权
              </button>
            </div>
          ) : (
            <div className="vault-layout">
              <nav className="vault-menu" aria-label="密码库菜单">
                <div className="vault-menu-section">
                  {vaultMenuItems
                    .filter((item) => item.kind === 'system')
                    .map((item) => (
                      <button
                        type="button"
                        className={item.id === vaultMenuId ? 'active' : ''}
                        onClick={() => handleSelectVaultMenu(item.id)}
                        key={item.id}
                      >
                        {item.id === 'recent' ? <Clock3 size={15} /> : <LockKeyhole size={15} />}
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </button>
                    ))}
                </div>
                <div className="vault-menu-section">
                  <p>按环境</p>
                  {vaultMenuItems
                    .filter((item) => item.kind === 'profile')
                    .map((item) => (
                      <button
                        type="button"
                        className={item.id === vaultMenuId ? 'active' : ''}
                        onClick={() => handleSelectVaultMenu(item.id)}
                        key={item.id}
                      >
                        <Globe2 size={15} />
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </button>
                    ))}
                  {profiles.length === 0 ? <div className="vault-menu-empty">暂无环境</div> : null}
                </div>
              </nav>

              <div className="vault-list-pane">
                <div className="vault-list-header">
                  <div>
                    <p>{activeVaultMenuItem?.kind === 'profile' ? '环境密码' : '密码分组'}</p>
                    <strong>{activeVaultMenuItem?.label ?? '全部密码'}</strong>
                  </div>
                  <span>{filteredVaultCredentials.length} 项</span>
                </div>

                <div className="search-row vault-search">
                  <Search size={16} />
                  <input
                    aria-label="搜索全局密码"
                    value={vaultQuery}
                    onChange={(event) => setVaultQuery(event.target.value)}
                    placeholder="搜索名称、网站、用户名或绑定环境"
                  />
                </div>

                <div className="vault-credential-list" aria-label="全局密码列表">
                  {filteredVaultCredentials.map((credential) => (
                    <button
                      className={`vault-list-row ${credential.id === selectedVaultCredentialId ? 'selected' : ''}`}
                      key={credential.id}
                      onClick={() => {
                        setSelectedVaultCredentialId(credential.id);
                        setVaultEditorMode('view');
                      }}
                      type="button"
                    >
                      <span className="credential-main">
                        <strong>{credential.title}</strong>
                        <span>{credential.websiteUrl || '未设置网站地址'}</span>
                        <small>{credential.username || '未设置用户名'}</small>
                      </span>
                      <span className={`binding-pill ${credential.profileId ? 'bound' : 'unbound'}`}>
                        {credential.profileId ? credential.profileName ?? '环境已不存在' : '未绑定环境'}
                      </span>
                    </button>
                  ))}
                  {filteredVaultCredentials.length === 0 ? <div className="empty-state">暂无密码项</div> : null}
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="profile-list desktop-workspace" id="my-desktop">
          <header className="topbar desktop-topbar">
            <div>
              <p className="section-kicker">本地快捷入口</p>
              <h2>我的桌面</h2>
            </div>
            <div className="desktop-toolbar">
              <button
                className="secondary-button"
                type="button"
                onClick={handleCreateDesktopFolder}
                disabled={busy}
              >
                <FolderPlus size={17} />
                新建文件夹
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => handleCreateDesktopShortcut()}
                disabled={!selectedProfile || busy || (selectedProfile ? desktopProfileIds.has(selectedProfile.id) : false)}
              >
                <Grid2X2 size={17} />
                添加当前环境
              </button>
            </div>
          </header>

          <div
            className="desktop-surface"
            aria-label="我的桌面快捷方式"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropOnDesktopSurface}
          >
            {desktopItems.map((item) =>
              item.type === 'shortcut' ? (
                <div
                  className="desktop-shortcut"
                  key={`shortcut:${item.id}`}
                  draggable={!busy}
                  onDragStart={(event) =>
                    handleDesktopDragStart(event, {
                      type: 'shortcut',
                      id: item.shortcut.id,
                      folderId: item.shortcut.folderId
                    })
                  }
                  onDragEnd={() => setDesktopDragPayload(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDropOnDesktopShortcut(event, item.shortcut)}
                >
                  <button
                    type="button"
                    className={`desktop-icon ${item.shortcut.iconVariant}`}
                    onClick={() => handleLaunchDesktopShortcut(item.shortcut)}
                    disabled={busy}
                    aria-label={`启动桌面快捷方式 ${item.shortcut.label}`}
                    title={`启动 ${item.shortcut.label}`}
                  >
                    <span>{desktopIconLabel[item.shortcut.iconVariant] ?? '环'}</span>
                    <Globe2 size={34} />
                  </button>
                  <strong title={item.shortcut.label}>{item.shortcut.label}</strong>
                  <span className={`desktop-shortcut-status ${statusTone[item.shortcut.profileStatus]}`}>
                    {statusText[item.shortcut.profileStatus]} · {runtimeChannelText[item.shortcut.runtimeChannel]}
                  </span>
                  <div className="desktop-shortcut-actions">
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => handleLaunchDesktopShortcut(item.shortcut)}
                      disabled={busy}
                      aria-label={`启动 ${item.shortcut.label}`}
                    >
                      <Play size={14} />
                      启动
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleDeleteDesktopShortcut(item.shortcut)}
                      disabled={busy}
                      aria-label={`移除桌面快捷方式 ${item.shortcut.label}`}
                      title="移除快捷方式"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="desktop-shortcut desktop-folder-shortcut"
                  key={`folder:${item.id}`}
                  draggable={!busy}
                  onDragStart={(event) => handleDesktopDragStart(event, { type: 'folder', id: item.folder.id })}
                  onDragEnd={() => setDesktopDragPayload(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDropOnDesktopFolder(event, item.folder)}
                >
                  <button
                    type="button"
                    className="desktop-icon folder"
                    onClick={() => setOpenDesktopFolderId(item.folder.id)}
                    disabled={busy}
                    aria-label={`打开桌面文件夹 ${item.folder.name}`}
                    title={`打开 ${item.folder.name}`}
                  >
                    <span>{item.folder.shortcutCount}</span>
                    <FolderOpen size={34} />
                  </button>
                  <strong title={item.folder.name}>{item.folder.name}</strong>
                  <span className="desktop-shortcut-status">{item.folder.shortcutCount} 个环境</span>
                  <div className="desktop-shortcut-actions">
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => setOpenDesktopFolderId(item.folder.id)}
                      disabled={busy}
                      aria-label={`打开 ${item.folder.name}`}
                    >
                      <FolderOpen size={14} />
                      打开
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleDeleteDesktopFolder(item.folder)}
                      disabled={busy}
                      aria-label={`删除桌面文件夹 ${item.folder.name}`}
                      title="删除文件夹"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            )}
            {desktopItems.length === 0 ? (
              <div className="desktop-empty">
                <Grid2X2 size={26} />
                <strong>暂无桌面快捷方式</strong>
                <span>选择一个环境后点击“添加当前环境”，或在环境详情中添加到我的桌面。</span>
              </div>
            ) : null}
          </div>
          {openDesktopFolder ? (
            <div
              className="desktop-folder-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setOpenDesktopFolderId(null);
                }
              }}
            >
              <section
                className="desktop-folder-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`桌面文件夹 ${openDesktopFolder.name}`}
                onMouseDown={(event) => event.stopPropagation()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDropOnOpenFolder(event, openDesktopFolder)}
              >
                <div className="desktop-folder-modal-header">
                  <div className="desktop-folder-title">
                    <div className="desktop-folder-mini-icon">
                      <FolderOpen size={20} />
                      <span>{openDesktopFolder.shortcutCount}</span>
                    </div>
                    <div>
                      <p className="section-kicker">桌面文件夹</p>
                      <h3>{openDesktopFolder.name}</h3>
                    </div>
                  </div>
                  <div className="desktop-folder-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleDeleteDesktopFolder(openDesktopFolder)}
                      disabled={busy}
                    >
                      <Trash2 size={15} />
                      删除文件夹
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setOpenDesktopFolderId(null)}
                      disabled={busy}
                      aria-label={`关闭文件夹 ${openDesktopFolder.name}`}
                      title="关闭文件夹"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="desktop-folder-grid desktop-folder-modal-grid">
                  {openFolderShortcuts.map((shortcut) => (
                    <div
                      className="desktop-shortcut"
                      key={shortcut.id}
                      draggable={!busy}
                      onDragStart={(event) =>
                        handleDesktopDragStart(event, { type: 'shortcut', id: shortcut.id, folderId: shortcut.folderId })
                      }
                      onDragEnd={() => setDesktopDragPayload(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDropOnFolderShortcut(event, shortcut, openDesktopFolder)}
                    >
                      <button
                        type="button"
                        className={`desktop-icon ${shortcut.iconVariant}`}
                        onClick={() => handleLaunchDesktopShortcut(shortcut)}
                        disabled={busy}
                        aria-label={`启动文件夹快捷方式 ${shortcut.label}`}
                        title={`启动 ${shortcut.label}`}
                      >
                        <span>{desktopIconLabel[shortcut.iconVariant] ?? '环'}</span>
                        <Globe2 size={34} />
                      </button>
                      <strong title={shortcut.label}>{shortcut.label}</strong>
                      <span className={`desktop-shortcut-status ${statusTone[shortcut.profileStatus]}`}>
                        {statusText[shortcut.profileStatus]}
                      </span>
                      <div className="desktop-shortcut-actions">
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => handleMoveShortcutToDesktop(shortcut)}
                          disabled={busy}
                        >
                          移出
                        </button>
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => handleLaunchDesktopShortcut(shortcut)}
                          disabled={busy}
                          aria-label={`启动 ${shortcut.label}`}
                        >
                          <Play size={14} />
                          启动
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleDeleteDesktopShortcut(shortcut)}
                          disabled={busy}
                          aria-label={`移除文件夹快捷方式 ${shortcut.label}`}
                          title="移除快捷方式"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {openFolderShortcuts.length === 0 ? <div className="desktop-empty">拖拽环境图标到这里</div> : null}
                </div>
              </section>
            </div>
          ) : null}
          <footer className="notice-bar desktop-notice" aria-live="polite">
            {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
            {notice}
          </footer>
        </section>
      )}

      {workspaceView !== 'desktop' ? (
      <aside className="details-drawer">
        {workspaceView === 'vault' ? (
          <>
            <div className="drawer-header">
              <div>
                <p className="section-kicker">密码库</p>
                <h2>{vaultDraft.id ? '编辑密码项' : '新增密码项'}</h2>
              </div>
            </div>

            {license?.status !== 'active' && license?.status !== 'grace' ? (
              <div className="credential-locked">
                <LockKeyhole size={18} />
                <div>
                  <strong>密码库需要有效许可证</strong>
                  <p>许可证有效或处于宽限期时，才允许保存、删除和复制密码。</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    handleOpenProfiles('profiles');
                    setActiveTab('license');
                  }}
                >
                  <KeyRound size={16} />
                  前往授权
                </button>
              </div>
            ) : vaultEditorMode === 'new' || vaultEditorMode === 'edit' ? (
              <form className="credential-panel vault-editor" onSubmit={(event) => event.preventDefault()}>
                <section className="form-section">
                  <div className="form-title">
                    <LockKeyhole size={17} />
                    {vaultDraft.id ? '编辑全局登录项' : '新增全局登录项'}
                  </div>
                  <label>
                    名称
                    <input
                      aria-label="全局密码名称"
                      value={vaultDraft.title}
                      onChange={(event) => setVaultDraft({ ...vaultDraft, title: event.target.value })}
                      placeholder="后台、邮箱、CRM"
                    />
                  </label>
                  <label>
                    网站地址
                    <input
                      aria-label="全局网站地址"
                      value={vaultDraft.websiteUrl}
                      onChange={(event) => setVaultDraft({ ...vaultDraft, websiteUrl: event.target.value })}
                      placeholder="https://example.com/login"
                    />
                  </label>
                  <label>
                    用户名
                    <input
                      aria-label="全局登录用户名"
                      value={vaultDraft.username}
                      onChange={(event) => setVaultDraft({ ...vaultDraft, username: event.target.value })}
                    />
                  </label>
                  <div className="password-input-group">
                    <div className="field-toolbar">
                      <label htmlFor="vault-password-input">密码</label>
                      {passwordVaultEnabled ? (
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => handleOpenPasswordGenerator('vault')}
                          aria-label="打开全局随机密码面板"
                        >
                          <RefreshCw size={14} />
                          生成
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="vault-password-input"
                      aria-label="全局登录密码"
                      type="password"
                      value={vaultDraft.password}
                      onChange={(event) => setVaultDraft({ ...vaultDraft, password: event.target.value })}
                      placeholder={vaultDraft.id ? '留空则不修改' : ''}
                    />
                    {renderPasswordGenerator('vault')}
                  </div>
                  <label>
                    绑定环境
                    <select
                      aria-label="绑定环境"
                      value={vaultDraft.profileId ?? ''}
                      onChange={(event) => setVaultDraft({ ...vaultDraft, profileId: event.target.value || null })}
                    >
                      <option value="">不绑定</option>
                      {profiles.map((profile) => (
                        <option value={profile.id} key={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="ops-row">
                    <button className="primary-button" type="button" onClick={handleSaveVaultCredential} disabled={busy}>
                      <Save size={16} />
                      保存密码项
                    </button>
                    <button className="secondary-button" type="button" onClick={handleResetVaultCredential} disabled={busy}>
                      清空
                    </button>
                  </div>
                </section>
              </form>
            ) : selectedVaultCredential ? (
              <section className="vault-detail-panel">
                <div className="vault-detail-card">
                  <div className="vault-detail-title">
                    <div>
                      <p className="section-kicker">登录项详情</p>
                      <h3>{selectedVaultCredential.title}</h3>
                    </div>
                    <span className={`binding-pill ${selectedVaultCredential.profileId ? 'bound' : 'unbound'}`}>
                      {selectedVaultCredential.profileId ? selectedVaultCredential.profileName ?? '环境已不存在' : '未绑定环境'}
                    </span>
                  </div>

                  <div className="vault-detail-grid">
                    <span>网站地址</span>
                    <strong>{selectedVaultCredential.websiteUrl || '未设置网站地址'}</strong>
                    <span>用户名</span>
                    <strong>{selectedVaultCredential.username || '未设置用户名'}</strong>
                    <span>密码</span>
                    <strong
                      className={`credential-secret ${revealedCredential?.id === selectedVaultCredential.id ? 'revealed' : ''}`}
                      aria-label={revealedCredential?.id === selectedVaultCredential.id ? '密码已显示' : '密码已隐藏'}
                    >
                      {revealedCredential?.id === selectedVaultCredential.id ? revealedCredential.password : '••••••••'}
                    </strong>
                    <span>最近复制</span>
                    <strong>{selectedVaultCredential.lastCopiedAt ? formatDate(selectedVaultCredential.lastCopiedAt) : '尚未复制'}</strong>
                  </div>

                  <div className="ops-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleCopyUsername(selectedVaultCredential)}
                      disabled={busy}
                      aria-label={`复制账号 ${selectedVaultCredential.title}`}
                    >
                      <Clipboard size={16} />
                      复制账号
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleCopyPassword(selectedVaultCredential)}
                      disabled={busy}
                      aria-label={`复制密码 ${selectedVaultCredential.title}`}
                    >
                      <KeyRound size={16} />
                      复制密码
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleToggleRevealPassword(selectedVaultCredential)}
                      disabled={busy}
                      aria-label={`${revealedCredential?.id === selectedVaultCredential.id ? '隐藏密码' : '查看密码'} ${selectedVaultCredential.title}`}
                    >
                      {revealedCredential?.id === selectedVaultCredential.id ? <EyeOff size={16} /> : <Eye size={16} />}
                      {revealedCredential?.id === selectedVaultCredential.id ? '隐藏密码' : '查看密码'}
                    </button>
                  </div>
                  <div className="ops-row">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleEditVaultCredential(selectedVaultCredential)}
                      disabled={busy}
                      aria-label={`编辑密码项 ${selectedVaultCredential.title}`}
                    >
                      <Edit3 size={16} />
                      编辑
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleDeleteCredential(selectedVaultCredential)}
                      disabled={busy}
                      aria-label={`删除密码项 ${selectedVaultCredential.title}`}
                    >
                      <Trash2 size={16} />
                      删除
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="vault-detail-panel">
                <div className="empty-state">请选择密码项或新增密码</div>
                <button className="primary-button wide" type="button" onClick={handleNewVaultCredential} disabled={busy}>
                  <LockKeyhole size={16} />
                  新增密码
                </button>
              </section>
            )}

            <footer className="notice-bar" aria-live="polite">
              {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
              {notice}
            </footer>
          </>
        ) : workspaceView === 'proxies' ? (
          <>
            <div className="drawer-header">
              <div>
                <p className="section-kicker">代理池</p>
                <h2>{proxyPoolDraft.id ? '编辑代理' : '新增代理'}</h2>
              </div>
            </div>
            <form className="detail-form proxy-pool-panel" onSubmit={(event) => event.preventDefault()}>
              <section className="form-section">
                <div className="form-title">
                  <Wifi size={17} />
                  代理配置
                </div>
                <label>
                  代理名称
                  <input
                    aria-label="代理名称"
                    value={proxyPoolDraft.name}
                    onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, name: event.target.value })}
                    placeholder="洛杉矶住宅代理"
                  />
                </label>
                <div className="inline-grid">
                  <label>
                    协议
                    <select
                      aria-label="代理池协议"
                      value={proxyPoolDraft.scheme}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, scheme: event.target.value as ProxyScheme })}
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                      <option value="socks5">SOCKS5</option>
                    </select>
                  </label>
                  <label>
                    端口
                    <input
                      aria-label="代理池端口"
                      inputMode="numeric"
                      value={proxyPoolDraft.port}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, port: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  主机
                  <input
                    aria-label="代理池主机"
                    value={proxyPoolDraft.host}
                    onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, host: event.target.value })}
                    placeholder="proxy.example.com"
                  />
                </label>
                <div className="inline-grid">
                  <label>
                    账号
                    <input
                      aria-label="代理池账号"
                      value={proxyPoolDraft.username}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, username: event.target.value })}
                    />
                  </label>
                  <label>
                    密码
                    <input
                      aria-label="代理池密码"
                      type="password"
                      value={proxyPoolDraft.password}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, password: event.target.value })}
                      placeholder={proxyPoolDraft.id ? '留空则不修改' : ''}
                    />
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-title">
                  <Globe2 size={17} />
                  出口属性
                </div>
                <div className="inline-grid">
                  <label>
                    地区
                    <input
                      aria-label="代理地区"
                      value={proxyPoolDraft.region}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, region: event.target.value })}
                      placeholder="US-CA"
                    />
                  </label>
                  <label>
                    时区
                    <select
                      aria-label="代理时区"
                      value={proxyPoolDraft.timezone}
                      onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, timezone: event.target.value })}
                    >
                      <option value="">不指定</option>
                      {TIMEZONE_OPTION_GROUPS.map(({ region, options }) => (
                        <optgroup key={region} label={region}>
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label} - {option.value}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  标签
                  <input
                    aria-label="代理标签"
                    value={proxyPoolDraft.tags}
                    onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, tags: event.target.value })}
                    placeholder="US,住宅,静态"
                  />
                </label>
                <label>
                  绕过列表
                  <input
                    aria-label="代理池绕过列表"
                    value={proxyPoolDraft.bypassList}
                    onChange={(event) => setProxyPoolDraft({ ...proxyPoolDraft, bypassList: event.target.value })}
                  />
                </label>
              </section>

              {selectedProxyPoolEntry ? (
                <section className="form-section proxy-pool-diagnostics">
                  <div className="form-title">
                    <CheckCircle2 size={17} />
                    最近检测
                  </div>
                  <div className="metrics-grid">
                    <span>状态 {proxyTestStatusText[selectedProxyPoolEntry.lastTestStatus]}</span>
                    <span>出口 IP {selectedProxyPoolEntry.lastExitIp || '未检测'}</span>
                    <span>出口时区 {selectedProxyPoolEntry.lastExitTimezone || '未检测'}</span>
                    <span>
                      时区一致性{' '}
                      {selectedProxyPoolEntry.timezoneMatch === null
                        ? '未知'
                        : selectedProxyPoolEntry.timezoneMatch
                          ? '一致'
                          : '不一致'}
                    </span>
                  </div>
                  <label className="check-row">
                    <input
                      aria-label="应用代理时同步时区"
                      type="checkbox"
                      checked={proxyPoolMatchTimezone}
                      onChange={(event) => setProxyPoolMatchTimezone(event.target.checked)}
                    />
                    应用到环境时同步代理时区
                  </label>
                </section>
              ) : null}

              <div className="ops-row">
                <button className="primary-button" type="button" onClick={handleSaveProxyPoolEntry} disabled={busy}>
                  <Save size={16} />
                  保存代理
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => selectedProxyPoolEntry && handleTestProxyPoolEntry(selectedProxyPoolEntry)}
                  disabled={busy || !selectedProxyPoolEntry}
                >
                  <CheckCircle2 size={16} />
                  测试代理
                </button>
              </div>
              <div className="ops-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => selectedProxyPoolEntry && handleApplyProxyPoolEntry(selectedProxyPoolEntry)}
                  disabled={busy || !selectedProxyPoolEntry || !selectedProfile}
                >
                  <Globe2 size={16} />
                  应用到当前环境
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => selectedProxyPoolEntry && handleDeleteProxyPoolEntry(selectedProxyPoolEntry)}
                  disabled={busy || !selectedProxyPoolEntry}
                >
                  <Trash2 size={16} />
                  删除代理
                </button>
              </div>
            </form>
            <footer className="notice-bar" aria-live="polite">
              {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
              {notice}
            </footer>
          </>
        ) : (
          <>
        <div className="drawer-header">
          <div>
            <p className="section-kicker">详情抽屉</p>
            <h2>{draft.id ? draft.name : '新建环境'}</h2>
          </div>
          <div className="drawer-actions">
            <button type="button" className="icon-button" onClick={handleEnsureChromium} title="检查 Chromium">
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleCreateDesktopShortcut()}
              disabled={!selectedProfile || busy || (selectedProfile ? desktopProfileIds.has(selectedProfile.id) : false)}
            >
              <Grid2X2 size={16} />
              添加到桌面
            </button>
            <button type="button" className="secondary-button" onClick={handleDuplicateProfile} disabled={!selectedProfile || busy}>
              <Clipboard size={16} />
              复制环境
            </button>
            <button type="button" className="secondary-button" onClick={handleStop} disabled={!selectedProfile || busy}>
              <Power size={16} />
              关闭环境
            </button>
            {selectedProfile?.archivedAt ? (
              <button type="button" className="secondary-button" onClick={handleRestoreProfile} disabled={!selectedProfile || busy}>
                <RotateCcw size={16} />
                恢复环境
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={handleArchiveProfile}
                disabled={!selectedProfile || busy || selectedProfile.status === 'running'}
              >
                <PackageCheck size={16} />
                归档环境
              </button>
            )}
            <button type="button" className="primary-button" onClick={handleLaunch} disabled={!selectedProfile || busy || Boolean(selectedProfile?.archivedAt)}>
              <Play size={16} />
              启动 Chromium
            </button>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="详情切换">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => {
              setActiveTab('config');
            }}
          >
            配置
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'credentials'}
            className={activeTab === 'credentials' ? 'active' : ''}
            onClick={() => {
              setActiveTab('credentials');
              setActiveNavKey('profiles');
            }}
          >
            密码
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audit'}
            className={activeTab === 'audit' ? 'active' : ''}
            onClick={() => {
              setActiveTab('audit');
            }}
          >
            审计
          </button>
          {authStatus.currentUser?.role === 'admin' ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'users'}
              className={activeTab === 'users' ? 'active' : ''}
              onClick={() => {
                setActiveTab('users');
                void loadUsers().catch((error) => setNotice(error instanceof Error ? error.message : '加载用户失败'));
              }}
            >
              用户
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'license'}
            className={activeTab === 'license' ? 'active' : ''}
            onClick={() => {
              setActiveTab('license');
            }}
          >
            授权
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'trial'}
            className={activeTab === 'trial' ? 'active' : ''}
            onClick={() => {
              setActiveTab('trial');
            }}
          >
            试卖
          </button>
        </div>

        {activeTab === 'config' ? (
          <form className="detail-form" onSubmit={(event) => event.preventDefault()}>
            {selectedProfileHealth ? (
              <section className={`profile-health-card ${selectedProfileHealth.status}`} aria-label="环境健康详情">
                <div className="profile-health-card-header">
                  <div>
                    <p className="section-kicker">资产健康</p>
                    <strong>{selectedProfileHealth.label}</strong>
                  </div>
                  <span>{selectedProfileHealth.score}</span>
                </div>
                <div className="profile-health-checks">
                  {selectedProfileHealth.checks.map((check) => (
                    <span className={check.ok ? 'ok' : 'issue'} key={`${check.key}-${check.label}`}>
                      {check.ok ? <CheckCircle2 size={14} /> : <Activity size={14} />}
                      {check.label}
                    </span>
                  ))}
                </div>
                <div className="profile-health-issues">
                  {selectedProfileHealth.issues.length > 0
                    ? selectedProfileHealth.issues.map((issue) => <span key={issue}>{issue}</span>)
                    : <span>环境资产完整，代理与启动记录均正常。</span>}
                </div>
              </section>
            ) : null}
            <section className="form-section">
              <div className="form-title">
                <SlidersHorizontal size={17} />
                基础信息
              </div>
              <label>
                环境名称
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <div className="inline-grid">
                <label>
                  负责人
                  <input
                    aria-label="负责人"
                    value={draft.owner}
                    onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
                    placeholder="销售、运营或客户负责人"
                  />
                </label>
                <label>
                  最后启动
                  <input
                    aria-label="最后启动时间"
                    value={selectedProfile?.lastLaunchedAt ? formatDate(selectedProfile.lastLaunchedAt) : '尚未启动'}
                    readOnly
                  />
                </label>
              </div>
              <label>
                环境分组
                <input
                  aria-label="环境分组"
                  value={draft.groupName}
                  onChange={(event) => setDraft({ ...draft, groupName: event.target.value })}
                  placeholder="项目、客户或团队"
                />
              </label>
              <label>
                标签
                <input
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  placeholder="合规,华东,测试"
                />
              </label>
              <label>
                备注
                <textarea
                  aria-label="环境备注"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="用途、客户背景、交接说明"
                />
              </label>
            </section>

            <section className="form-section">
              <div className="form-title">
                <Wifi size={17} />
                代理配置
              </div>
              <div className="inline-grid">
                <label>
                  代理协议
                  <select
                    value={draft.proxyScheme}
                    onChange={(event) => setDraft({ ...draft, proxyScheme: event.target.value as ProxyScheme })}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <label>
                  代理端口
                  <input
                    inputMode="numeric"
                    value={draft.proxyPort}
                    onChange={(event) => setDraft({ ...draft, proxyPort: event.target.value })}
                  />
                </label>
              </div>
              <label>
                代理主机
                <input value={draft.proxyHost} onChange={(event) => setDraft({ ...draft, proxyHost: event.target.value })} />
              </label>
              <div className="inline-grid">
                <label>
                  代理账号
                  <input
                    value={draft.proxyUsername}
                    onChange={(event) => setDraft({ ...draft, proxyUsername: event.target.value })}
                  />
                </label>
                <label>
                  代理密码
                  <input
                    type="password"
                    value={draft.proxyPassword}
                    onChange={(event) => setDraft({ ...draft, proxyPassword: event.target.value })}
                    placeholder={draft.id ? '留空则不修改' : ''}
                  />
                </label>
              </div>
              <label>
                代理绕过列表
                <input
                  value={draft.proxyBypassList}
                  onChange={(event) => setDraft({ ...draft, proxyBypassList: event.target.value })}
                />
              </label>
              <div className="proxy-actions">
                <button className="secondary-button" type="button" onClick={handleImportSystemProxy} disabled={busy}>
                  <RefreshCw size={16} />
                  读取系统代理
                </button>
                <button className="secondary-button" type="button" onClick={handleScanLocalProxy} disabled={busy}>
                  <Search size={16} />
                  扫描本机端口
                </button>
                <button className="secondary-button" type="button" onClick={handleProxyTest} disabled={busy}>
                  <CheckCircle2 size={16} />
                  测试代理
                </button>
              </div>
              <div className={`local-proxy-card ${selectedProxyRuntime?.state ?? 'stopped'}`} aria-label="本地代理状态">
                <div className="local-proxy-title">
                  <span>本地代理状态</span>
                  <strong>{selectedProxyRuntime ? proxyRuntimeStateText[selectedProxyRuntime.state] : '未启动'}</strong>
                </div>
                <div className="local-proxy-grid">
                  <span>
                    监听：
                    {selectedProxyRuntime && selectedProxyRuntime.listenPort > 0
                      ? `${selectedProxyRuntime.listenHost}:${selectedProxyRuntime.listenPort}`
                      : '未启动'}
                  </span>
                  <span>上游：{selectedProxyRuntime?.upstreamScheme?.toUpperCase() ?? draft.proxyScheme.toUpperCase()}</span>
                  <span>连接：{selectedProxyRuntime?.connectionCount ?? 0}</span>
                  <span>失败：{selectedProxyRuntime?.failureCount ?? 0}</span>
                  <span>出口 IP：{selectedProxyRuntime?.lastExitIp ?? '待检测'}</span>
                  <span>出口时区：{selectedProxyRuntime?.lastExitTimezone ?? '待检测'}</span>
                  {selectedProxyRuntime?.timezoneMatch !== undefined ? (
                    <span className={selectedProxyRuntime.timezoneMatch ? 'good' : 'bad'}>
                      时区：{selectedProxyRuntime.timezoneMatch ? '一致' : '不一致'}
                    </span>
                  ) : null}
                  {selectedProxyRuntime?.lastError ? <span className="bad">错误：{selectedProxyRuntime.lastError}</span> : null}
                </div>
              </div>
            </section>

            <section className="form-section">
              <div className="form-title">
                <PackageCheck size={17} />
                内核通道
              </div>
              <label>
                运行通道
                <select
                  aria-label="内核通道"
                  value={draft.runtimeChannel}
                  onChange={(event) => setDraft({ ...draft, runtimeChannel: event.target.value as RuntimeChannel })}
                >
                  <option value="official">官方稳定版</option>
                  <option value="custom-kernel">自研内核</option>
                </select>
              </label>
              <div className="kernel-status-card">
                <span>当前选择：{runtimeChannelText[draft.runtimeChannel]}</span>
                <span>自研内核：{kernelStatus?.installed ? '已安装' : '未安装'}</span>
                <span>版本：{kernelManifest?.version ?? '未加载'}</span>
                <span>Chromium 基线：{kernelManifest?.baseChromiumRevision ?? '未加载'}</span>
                <span>Patchset：{kernelManifest?.patchsetVersion ?? '未加载'}</span>
                <span>来源：{kernelStatus ? kernelManifestSourceText[kernelStatus.source] : '未加载'}</span>
                <span className="kernel-wide" title={kernelStatus?.runtimeRoot ?? undefined}>
                  安装目录：{kernelStatus?.runtimeRoot ?? '未加载'}
                </span>
                <span className="kernel-wide" title={kernelStatus?.manifestPath ?? undefined}>
                  Manifest：{kernelStatus?.manifestPath ?? '内置默认'}
                </span>
                {kernelStatus?.importedAt ? (
                  <span className="kernel-wide">导入时间：{formatDate(kernelStatus.importedAt)}</span>
                ) : null}
                {kernelStatus?.lastError ? <span className="kernel-wide kernel-error">错误：{kernelStatus.lastError}</span> : null}
              </div>
              <div className="google-account-card" aria-label="Google 账号登录配置">
                <div className="google-account-header">
                  <div>
                    <strong>Google 账号登录</strong>
                    <span>
                      {googleAccountStatus?.configured
                        ? googleAccountStatus.enabled
                          ? '已启用，自研内核启动时注入 Google API 环境'
                          : '已配置，当前未启用'
                        : '未配置'}
                    </span>
                  </div>
                  {googleAccountStatus?.updatedAt ? <small>更新：{formatDate(googleAccountStatus.updatedAt)}</small> : null}
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={googleAccountDraft.enabled}
                    onChange={(event) =>
                      setGoogleAccountDraft({
                        ...googleAccountDraft,
                        enabled: event.target.checked
                      })
                    }
                  />
                  启用自研内核 Google 账号登录支持
                </label>
                <div className="inline-grid">
                  <label>
                    Google API Key
                    <input
                      aria-label="Google API Key"
                      type="password"
                      value={googleAccountDraft.apiKey}
                      onChange={(event) => setGoogleAccountDraft({ ...googleAccountDraft, apiKey: event.target.value })}
                      placeholder={googleAccountStatus?.configured ? '已保存，留空则不修改' : 'AIza...'}
                    />
                  </label>
                  <label>
                    OAuth Client ID
                    <input
                      aria-label="Google OAuth Client ID"
                      type="password"
                      value={googleAccountDraft.clientId}
                      onChange={(event) => setGoogleAccountDraft({ ...googleAccountDraft, clientId: event.target.value })}
                      placeholder={googleAccountStatus?.configured ? '已保存，留空则不修改' : 'client-id.apps.googleusercontent.com'}
                    />
                  </label>
                  <label>
                    OAuth Client Secret
                    <input
                      aria-label="Google OAuth Client Secret"
                      type="password"
                      value={googleAccountDraft.clientSecret}
                      onChange={(event) =>
                        setGoogleAccountDraft({ ...googleAccountDraft, clientSecret: event.target.value })
                      }
                      placeholder={googleAccountStatus?.configured ? '已保存，留空则不修改' : 'client secret'}
                    />
                  </label>
                </div>
                <div className="kernel-actions">
                  <button className="secondary-button" type="button" onClick={handleSaveGoogleAccountConfig} disabled={busy}>
                    <Save size={16} />
                    保存 Google 配置
                  </button>
                  <button className="secondary-button" type="button" onClick={handleClearGoogleAccountConfig} disabled={busy}>
                    <Trash2 size={15} />
                    清除配置
                  </button>
                </div>
                <p className="helper-text">
                  仅用于自研内核手动登录 Google 账号。配置会加密保存在本机，启动时通过环境变量传给 Chromium，不写入启动参数或审计详情。
                </p>
              </div>
              <div className="kernel-actions">
                <button className="secondary-button" type="button" onClick={handleEnsureChromium} disabled={busy}>
                  <PackageCheck size={16} />
                  {draft.runtimeChannel === 'custom-kernel' ? '检查自研内核' : '检查官方 Chromium'}
                </button>
                <button className="secondary-button" type="button" onClick={handleImportKernelManifest} disabled={busy}>
                  <Upload size={16} />
                  导入 manifest
                </button>
                <button className="secondary-button" type="button" onClick={handleOpenKernelRuntimeFolder} disabled={busy}>
                  <FolderOpen size={16} />
                  打开目录
                </button>
                <button className="secondary-button" type="button" onClick={handleClearKernelManifest} disabled={busy}>
                  <RotateCcw size={16} />
                  重置 manifest
                </button>
              </div>
            </section>

            <section className="form-section">
              <div className="form-title">
                <ShieldCheck size={17} />
                隐私归一化
              </div>
              <div className="inline-grid">
                <label>
                  语言
                  <input
                    value={draft.fingerprintPolicy.locale}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: { ...draft.fingerprintPolicy, locale: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  时区
                  <select
                    aria-label="时区"
                    value={draft.fingerprintPolicy.timezone}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: { ...draft.fingerprintPolicy, timezone: event.target.value }
                      })
                    }
                  >
                    {TIMEZONE_OPTION_GROUPS.map(({ region, options }) => (
                      <optgroup key={region} label={region}>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} - {option.value}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div className="timezone-match-control">
                  <span>代理出口</span>
                  <button className="secondary-button compact-button" type="button" onClick={handleMatchProxyTimezone} disabled={busy}>
                    <Globe2 size={14} />
                    根据代理匹配时区
                  </button>
                </div>
              </div>
              <div className="inline-grid">
                <label>
                  窗口宽度
                  <input
                    inputMode="numeric"
                    value={draft.fingerprintPolicy.windowSize.width}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: {
                          ...draft.fingerprintPolicy,
                          windowSize: {
                            ...draft.fingerprintPolicy.windowSize,
                            width: Number(event.target.value)
                          }
                        }
                      })
                    }
                  />
                </label>
                <label>
                  窗口高度
                  <input
                    inputMode="numeric"
                    value={draft.fingerprintPolicy.windowSize.height}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: {
                          ...draft.fingerprintPolicy,
                          windowSize: {
                            ...draft.fingerprintPolicy.windowSize,
                            height: Number(event.target.value)
                          }
                        }
                      })
                    }
                  />
                </label>
              </div>
              <div className="policy-grid">
                <span>权限默认：拒绝提示</span>
                <span>WebRTC：禁用非代理 UDP</span>
                <span>Canvas/WebGL：不做随机噪声</span>
              </div>
            </section>

            <button className="primary-button wide save-button" type="button" onClick={handleSave} disabled={busy}>
              <Save size={16} />
              保存环境
            </button>
          </form>
        ) : activeTab === 'credentials' ? (
          <section className="credential-panel">
            {license?.status !== 'active' && license?.status !== 'grace' ? (
              <div className="credential-locked">
                <LockKeyhole size={18} />
                <div>
                  <strong>密码库需要有效许可证</strong>
                  <p>激活或恢复许可证后即可保存、搜索和复制当前环境的登录项。</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    handleOpenProfiles('profiles');
                    setActiveTab('license');
                  }}
                >
                  <KeyRound size={16} />
                  前往授权
                </button>
              </div>
            ) : !selectedProfile ? (
              <div className="empty-state">请选择环境后管理密码</div>
            ) : (
              <>
                <div className="search-row credential-search">
                  <Search size={16} />
                  <input
                    aria-label="搜索密码"
                    value={credentialQuery}
                    onChange={(event) => setCredentialQuery(event.target.value)}
                    placeholder="搜索名称、网站或用户名"
                  />
                </div>

                <div className="credential-list" aria-label="密码列表">
                  {filteredCredentials.map((credential) => (
                    <article className="credential-row" key={credential.id}>
                      <div className="credential-main">
                        <strong>{credential.title}</strong>
                        <span>{credential.websiteUrl || '未设置网站地址'}</span>
                        <small>{credential.username || '未设置用户名'}</small>
                      </div>
                      <div
                        className={`credential-mask ${revealedCredential?.id === credential.id ? 'revealed' : ''}`}
                        aria-label={revealedCredential?.id === credential.id ? '密码已显示' : '密码已隐藏'}
                      >
                        {revealedCredential?.id === credential.id ? revealedCredential.password : '••••••••'}
                      </div>
                      <div className="credential-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleCopyUsername(credential)}
                          title="复制账号"
                          aria-label={`复制账号 ${credential.title}`}
                        >
                          <Clipboard size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleCopyPassword(credential)}
                          title="复制密码"
                          aria-label={`复制密码 ${credential.title}`}
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleToggleRevealPassword(credential)}
                          title={revealedCredential?.id === credential.id ? '隐藏密码' : '查看密码'}
                          aria-label={`${revealedCredential?.id === credential.id ? '隐藏密码' : '查看密码'} ${credential.title}`}
                        >
                          {revealedCredential?.id === credential.id ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleEditCredential(credential)}
                          title="编辑密码项"
                          aria-label={`编辑密码项 ${credential.title}`}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleDeleteCredential(credential)}
                          title="删除密码项"
                          aria-label={`删除密码项 ${credential.title}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {filteredCredentials.length === 0 ? <div className="empty-state">暂无密码项</div> : null}
                </div>

                <section className="form-section">
                  <div className="form-title">
                    <LockKeyhole size={17} />
                    {credentialDraft.id ? '编辑登录项' : '新增登录项'}
                  </div>
                  <label>
                    名称
                    <input
                      aria-label="密码名称"
                      value={credentialDraft.title}
                      onChange={(event) => setCredentialDraft({ ...credentialDraft, title: event.target.value })}
                      placeholder="后台、邮箱、CRM"
                    />
                  </label>
                  <label>
                    网站地址
                    <input
                      aria-label="网站地址"
                      value={credentialDraft.websiteUrl}
                      onChange={(event) => setCredentialDraft({ ...credentialDraft, websiteUrl: event.target.value })}
                      placeholder="https://example.com/login"
                    />
                  </label>
                  <label>
                    用户名
                    <input
                      aria-label="登录用户名"
                      value={credentialDraft.username}
                      onChange={(event) => setCredentialDraft({ ...credentialDraft, username: event.target.value })}
                    />
                  </label>
                  <div className="password-input-group">
                    <div className="field-toolbar">
                      <label htmlFor="profile-password-input">密码</label>
                      {passwordVaultEnabled ? (
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => handleOpenPasswordGenerator('profile')}
                          aria-label="打开登录随机密码面板"
                        >
                          <RefreshCw size={14} />
                          生成
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="profile-password-input"
                      aria-label="登录密码"
                      type="password"
                      value={credentialDraft.password}
                      onChange={(event) => setCredentialDraft({ ...credentialDraft, password: event.target.value })}
                      placeholder={credentialDraft.id ? '留空则不修改' : ''}
                    />
                    {renderPasswordGenerator('profile')}
                  </div>
                  <div className="ops-row">
                    <button className="primary-button" type="button" onClick={handleSaveCredential} disabled={busy}>
                      <Save size={16} />
                      保存密码项
                    </button>
                    <button className="secondary-button" type="button" onClick={handleResetCredential} disabled={busy}>
                      清空
                    </button>
                  </div>
                </section>

                <button className="secondary-button wide" type="button" onClick={handleOpenSelectedProfileVault} disabled={busy}>
                  <LockKeyhole size={16} />
                  打开密码库
                </button>

                <button className="secondary-button wide" type="button" onClick={handleOpenSecurityLab} disabled={busy}>
                  <ShieldCheck size={16} />
                  打开本地安全实验页
                </button>
              </>
            )}
          </section>
        ) : activeTab === 'audit' ? (
          <section className="audit-list" id="audit">
            <div className="ops-row">
              <button className="secondary-button" type="button" onClick={handleAuditExport} disabled={busy}>
                <Download size={16} />
                导出审计
              </button>
              <button className="secondary-button" type="button" onClick={handleProfilesExport} disabled={busy}>
                <PackageCheck size={16} />
                导出配置
              </button>
            </div>
            {audits.map((event) => (
              <article className="audit-row" key={event.id}>
                <Clock3 size={15} />
                <div>
                  <strong>{event.action}</strong>
                  <p>{actionLabel[event.action] ?? event.action}</p>
                </div>
                <time>{formatDate(event.createdAt)}</time>
              </article>
            ))}
            {audits.length === 0 ? <div className="empty-state">暂无审计日志</div> : null}
          </section>
        ) : activeTab === 'users' ? (
          <section className="audit-list user-panel">
            <div className="form-section">
              <div className="form-title">
                <UserPlus size={17} />
                新增用户
              </div>
              <label>
                邮箱
                <input
                  aria-label="新用户邮箱"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })}
                  placeholder="member@example.com"
                />
              </label>
              <label>
                用户名称
                <input
                  aria-label="新用户名称"
                  value={userDraft.displayName}
                  onChange={(event) => setUserDraft({ ...userDraft, displayName: event.target.value })}
                  placeholder="运营成员"
                />
              </label>
              <div className="inline-grid">
                <label>
                  角色
                  <select
                    aria-label="新用户角色"
                    value={userDraft.role}
                    onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as UserRole })}
                  >
                    <option value="member">成员</option>
                    <option value="admin">管理员</option>
                  </select>
                </label>
                <label>
                  初始密码
                  <input
                    aria-label="新用户初始密码"
                    type="password"
                    value={userDraft.password}
                    onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })}
                    placeholder="至少 8 位"
                  />
                </label>
              </div>
              <button
                className="primary-button wide"
                type="button"
                onClick={handleCreateUser}
                disabled={busy || !userDraft.email || !userDraft.displayName || !userDraft.password}
              >
                <UserPlus size={16} />
                创建用户
              </button>
            </div>

            <div className="user-list" aria-label="用户列表">
              {users.map((user) => (
                <article className="user-row" key={user.id}>
                  <div>
                    <strong>{user.displayName}</strong>
                    <span>{user.email}</span>
                    <small>
                      {userRoleText[user.role]} · {user.lastLoginAt ? `最近登录 ${formatDate(user.lastLoginAt)}` : '尚未登录'}
                    </small>
                  </div>
                  <span className={`user-status-pill ${user.status}`}>{userStatusText[user.status]}</span>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => handleToggleUserStatus(user)}
                    disabled={busy || user.id === authStatus.currentUser?.id}
                  >
                    {user.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
                    {user.status === 'active' ? '停用' : '启用'}
                  </button>
                </article>
              ))}
              {users.length === 0 ? <div className="empty-state">暂无用户</div> : null}
            </div>
          </section>
        ) : activeTab === 'license' ? (
          <section className="audit-list license-panel">
            <div className="form-section">
              <div className="form-title">
                <KeyRound size={17} />
                授权中心
              </div>
              <div className={`license-status-card ${license?.status ?? 'inactive'}`}>
                <strong>{license ? licenseStatusText[license.status] : '未激活'}</strong>
                <span>{license?.teamName || '尚未绑定团队'}</span>
                <small>设备码：{license?.deviceId ?? '加载中'}</small>
              </div>
              <div className="inline-grid">
                <label>
                  套餐
                  <input value={license?.plan.name ?? '试用版'} readOnly />
                </label>
                <label>
                  到期时间
                  <input value={license?.expiresAt ? formatDate(license.expiresAt) : '未激活'} readOnly />
                </label>
              </div>
              <div className="usage-block">
                <span>环境用量 {usage?.profilesUsed ?? 0}/{usage?.profileLimit ?? 0}</span>
                <div className="usage-meter">
                  <span style={{ width: `${licenseUsagePercent}%` }} />
                </div>
                <span>席位用量 {usage?.seatsUsed ?? 0}/{usage?.seatLimit ?? 0}</span>
              </div>
              <label>
                激活码
                <input
                  aria-label="激活码"
                  value={activationCode}
                  onChange={(event) => setActivationCode(event.target.value)}
                  placeholder="粘贴人工销售发放的激活码"
                />
              </label>
              <div className="ops-row">
                <button className="primary-button" type="button" onClick={handleActivateLicense} disabled={busy || !activationCode}>
                  <BadgeCheck size={16} />
                  激活许可证
                </button>
                <button className="secondary-button" type="button" onClick={handleRefreshLicense} disabled={busy}>
                  <RefreshCw size={16} />
                  刷新状态
                </button>
                <button className="secondary-button" type="button" onClick={handleDeactivateLicense} disabled={busy}>
                  <Power size={16} />
                  解绑设备
                </button>
              </div>
            </div>

            <div className="form-section">
              <div className="form-title">
                <PackageCheck size={17} />
                运营工具
              </div>
              <button className="secondary-button wide" type="button" onClick={handleBatchProxyTest} disabled={busy}>
                <Wifi size={16} />
                批量检测代理
              </button>
              <button className="secondary-button wide" type="button" onClick={handlePackageLogs} disabled={busy}>
                <Download size={16} />
                打包支持日志
              </button>
              <a className="sales-link" href="mailto:sales@fingerbrowser.local?subject=指纹浏览器试卖咨询">
                <Mail size={16} />
                联系销售获取试卖激活码
              </a>
            </div>
          </section>
        ) : (
          <section className="audit-list trial-panel" id="trial">
            <div className="form-section">
              <div className="form-title">
                <PackageCheck size={17} />
                版本中心
              </div>
              <div className="version-grid">
                <span>当前版本：{appVersion?.version ?? '加载中'}</span>
                <span>构建渠道：{appVersion?.channel ?? 'trial'}</span>
                <span>最近检查：{releaseCheck ? formatDate(releaseCheck.checkedAt) : '未检查'}</span>
                <span>更新状态：{releaseCheck?.message ?? '手动检查 GitHub Release'}</span>
              </div>
              <div className="ops-row">
                <button className="primary-button" type="button" onClick={handleCheckUpdates} disabled={busy}>
                  <RefreshCw size={16} />
                  检查更新
                </button>
                <button className="secondary-button" type="button" onClick={handleOpenRelease} disabled={busy}>
                  <ExternalLink size={16} />
                  打开 Release
                </button>
              </div>
              <button className="secondary-button wide" type="button" onClick={handleCopyDiagnostics} disabled={busy}>
                <ClipboardCheck size={16} />
                复制诊断信息
              </button>
            </div>

            <div className="form-section feedback-form">
              <div className="form-title">
                <MessageSquare size={17} />
                反馈中心
              </div>
              <div className="inline-grid">
                <label>
                  问题类型
                  <select
                    aria-label="问题类型"
                    value={feedbackDraft.issueType}
                    onChange={(event) =>
                      setFeedbackDraft({ ...feedbackDraft, issueType: event.target.value as FeedbackIssueType })
                    }
                  >
                    <option value="bug">故障</option>
                    <option value="setup">部署/配置</option>
                    <option value="feature">功能建议</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label>
                  严重程度
                  <select
                    aria-label="严重程度"
                    value={feedbackDraft.severity}
                    onChange={(event) =>
                      setFeedbackDraft({ ...feedbackDraft, severity: event.target.value as FeedbackSeverity })
                    }
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                  </select>
                </label>
              </div>
              <div className="inline-grid">
                <label>
                  客户团队
                  <input
                    aria-label="客户团队"
                    value={feedbackDraft.teamName}
                    onChange={(event) => setFeedbackDraft({ ...feedbackDraft, teamName: event.target.value })}
                    placeholder={license?.teamName || '试卖团队'}
                  />
                </label>
                <label>
                  联系方式
                  <input
                    aria-label="联系方式"
                    value={feedbackDraft.contact}
                    onChange={(event) => setFeedbackDraft({ ...feedbackDraft, contact: event.target.value })}
                    placeholder="邮箱或微信"
                  />
                </label>
              </div>
              <label>
                问题描述
                <textarea
                  aria-label="问题描述"
                  value={feedbackDraft.description}
                  onChange={(event) => setFeedbackDraft({ ...feedbackDraft, description: event.target.value })}
                  placeholder="描述复现步骤、期望结果和实际现象"
                />
              </label>
              <label className="check-row">
                <input
                  aria-label="包含诊断摘要"
                  type="checkbox"
                  checked={feedbackDraft.includeDiagnostics}
                  onChange={(event) => setFeedbackDraft({ ...feedbackDraft, includeDiagnostics: event.target.checked })}
                />
                包含脱敏诊断摘要
              </label>
              <button className="primary-button wide" type="button" onClick={handlePackageFeedback} disabled={busy}>
                <Download size={16} />
                生成反馈包
              </button>
            </div>

            <div className="form-section">
              <div className="form-title">
                <Activity size={17} />
                本地试卖指标
              </div>
              <div className="metrics-grid">
                <span>激活 {metrics?.activationCount ?? 0}</span>
                <span>环境 {metrics?.profileCount ?? 0}</span>
                <span>启动 {metrics?.browserLaunchCount ?? 0}</span>
                <span>代理检测 {metrics?.proxyTestCount ?? 0}</span>
                <span>密码项 {metrics?.credentialCount ?? 0}</span>
                <span>反馈包 {metrics?.feedbackPackageCount ?? 0}</span>
                <span>更新检查 {metrics?.updateCheckCount ?? 0}</span>
              </div>
            </div>
          </section>
        )}

        <footer className="notice-bar" aria-live="polite">
          {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
          {notice}
        </footer>
          </>
        )}
      </aside>
      ) : null}
    </main>
  );
}
