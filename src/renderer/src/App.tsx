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
  Wifi,
  X
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FINGERPRINT_POLICY } from '../../shared/defaults';
import { TIMEZONE_OPTION_GROUPS } from '../../shared/timezones';
import type {
  AuditEvent,
  AppVersionInfo,
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
  ProfileDetails,
  ProxyRuntimeStatus,
  ProxyScheme,
  RedactedLicenseState,
  ReleaseCheckResult,
  RuntimeChannel,
  SystemProxyDetectionResult,
  TrialMetrics,
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

interface DraftState {
  id: string | null;
  name: string;
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

type ActiveTab = 'config' | 'credentials' | 'audit' | 'license' | 'trial';
type WorkspaceView = 'profiles' | 'vault' | 'desktop';
type VaultEditorMode = 'view' | 'edit' | 'new';
type SideNavKey = 'profiles' | 'vault' | 'desktop';
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

const emptyDraft: DraftState = {
  id: null,
  name: '',
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

const kernelManifestSourceText: Record<KernelManifestSource, string> = {
  default: '内置默认',
  environment: '环境变量',
  imported: '应用内导入'
};

const actionLabel: Record<string, string> = {
  PROFILE_CREATED: '创建环境',
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

function profileToDraft(profile: ProfileDetails): DraftState {
  return {
    id: profile.id,
    name: profile.name,
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
  const [profiles, setProfiles] = useState<ProfileDetails[]>([]);
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
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return profiles;
    }
    return profiles.filter((profile) => {
      const haystack = [profile.name, profile.tags.join(','), profile.proxy?.host ?? '', profile.status].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [profiles, query]);

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

  useEffect(() => {
    void Promise.all([
      loadProfiles(),
      loadDesktopShortcuts(),
      loadCommercialState(),
      loadTrialState(),
      loadKernelState(),
      loadGoogleAccountState(),
      loadProxyRuntimeStatus()
    ]).catch((error) => setNotice(error instanceof Error ? error.message : '加载环境失败'));
  }, [
    loadCommercialState,
    loadDesktopShortcuts,
    loadGoogleAccountState,
    loadKernelState,
    loadProfiles,
    loadProxyRuntimeStatus,
    loadTrialState
  ]);

  useEffect(() => {
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
  }, [credentialsEnabled, loadAudits, loadCredentials, loadProxyRuntimeStatus, selectedProfile]);

  useEffect(() => {
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
  }, [loadDesktopShortcuts, loadVaultCredentials, workspaceView]);

  useEffect(() => {
    setRevealedCredential(null);
  }, [activeTab, selectedVaultCredentialId, vaultMenuId, workspaceView]);

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
        <div className="policy-note">
          <ShieldCheck size={17} />
          <span>仅做可解释的隐私归一化与合规审计。</span>
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

        <div className="search-row">
          <Search size={16} />
          <input
            aria-label="搜索环境"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、标签、代理或状态"
          />
        </div>

        <div className="table-header">
          <span>环境</span>
          <span>状态</span>
          <span>代理</span>
          <span>内核</span>
        </div>

        <div className="profile-rows" role="list" aria-label="环境列表">
          {filteredProfiles.map((profile) => (
            <button
              className={`profile-row ${profile.id === selectedId ? 'selected' : ''}`}
              key={profile.id}
              onClick={() => {
                setSelectedId(profile.id);
                setActiveTab('config');
                setActiveNavKey('profiles');
              }}
              type="button"
            >
              <span className="profile-name-cell">
                <strong>{profile.name}</strong>
                <small>{profile.tags.length > 0 ? profile.tags.join(' / ') : '未设置标签'}</small>
              </span>
              <span className={`status-pill ${statusTone[profile.status]}`}>
                <Circle size={9} fill="currentColor" />
                {statusText[profile.status]}
              </span>
              <span>{profile.proxy ? `${profile.proxy.scheme}://${profile.proxy.host}:${profile.proxy.port}` : '未配置'}</span>
              <span>{runtimeChannelText[profile.runtimeChannel]}</span>
            </button>
          ))}
          {filteredProfiles.length === 0 ? (
            <div className="empty-state">
              <Activity size={18} />
              <span>暂无环境，点击“新建环境”开始。</span>
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
            <button type="button" className="secondary-button" onClick={handleStop} disabled={!selectedProfile || busy}>
              <Power size={16} />
              关闭环境
            </button>
            <button type="button" className="primary-button" onClick={handleLaunch} disabled={!selectedProfile || busy}>
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
            <section className="form-section">
              <div className="form-title">
                <SlidersHorizontal size={17} />
                基础信息
              </div>
              <label>
                环境名称
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                标签
                <input
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  placeholder="合规,华东,测试"
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
