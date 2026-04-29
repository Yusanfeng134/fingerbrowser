export type ProfileStatus = 'closed' | 'running' | 'error';
export type ProxyScheme = 'http' | 'https' | 'socks5';
export type ProxyTestStatus = 'untested' | 'testing' | 'passed' | 'failed';
export type PermissionDefault = 'ask' | 'deny';
export type WebRtcIpPolicy = 'default' | 'disable_non_proxied_udp';
export type AuditAction =
  | 'PROFILE_CREATED'
  | 'PROFILE_UPDATED'
  | 'PROFILE_LAUNCHED'
  | 'PROFILE_STOPPED'
  | 'PROXY_CREATED'
  | 'PROXY_UPDATED'
  | 'PROXY_TESTED'
  | 'CHROMIUM_INSTALLED'
  | 'ERROR_RECORDED';

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

export interface AppApi {
  profiles: {
    list: () => Promise<ProfileDetails[]>;
    create: (input: CreateProfileInput) => Promise<ProfileDetails>;
    update: (input: UpdateProfileInput) => Promise<ProfileDetails>;
    launch: (profileId: string) => Promise<LaunchResult>;
    stop: (profileId: string) => Promise<StopResult>;
  };
  proxy: {
    test: (input: ProxyConnectionInput & { profileId?: string }) => Promise<ProxyTestResult>;
  };
  audit: {
    list: (profileId?: string) => Promise<AuditEvent[]>;
  };
  chromium: {
    ensureInstalled: () => Promise<ChromiumInstallResult>;
  };
}
