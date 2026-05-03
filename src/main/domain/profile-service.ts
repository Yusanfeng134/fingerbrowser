import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_FINGERPRINT_POLICY, CHROMIUM_VERSION } from '../../shared/defaults';
import { normalizeTimezone } from '../../shared/timezones';
import type {
  AuditAction,
  AuditEvent,
  BrowserProfile,
  CreateProfileInput,
  CreateProxyInput,
  DuplicateProfileInput,
  FingerprintPolicy,
  ProfileDetails,
  ProxyConfig,
  ProxyTestResult,
  RuntimeChannel,
  UpdateProfileInput
} from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';
import type { SecretBox } from './encryption';
import { assertValidProxyEndpoint, redactProxyConfig } from './proxy';

interface ProfileServiceOptions {
  db: ApplicationDatabase;
  dataDir: string;
  secretBox: SecretBox;
  getAuditActor?: () => string;
}

interface ProfileRow {
  id: string;
  name: string;
  group_name: string;
  tags_json: string;
  status: BrowserProfile['status'];
  user_data_dir: string;
  chromium_version: string;
  runtime_channel: RuntimeChannel;
  fingerprint_policy_json: string;
  proxy_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProxyRow {
  id: string;
  scheme: ProxyConfig['scheme'];
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  bypass_list_json: string;
  last_test_status: ProxyConfig['lastTestStatus'];
}

interface AuditRow {
  id: string;
  profile_id: string | null;
  action: AuditAction;
  actor: string;
  metadata_json: string;
  created_at: string;
}

export interface ProfileService {
  listProfiles(): ProfileDetails[];
  createProfile(input: CreateProfileInput): ProfileDetails;
  duplicateProfile(input: DuplicateProfileInput): ProfileDetails;
  updateProfile(input: UpdateProfileInput): ProfileDetails;
  getProfile(id: string): ProfileDetails;
  setProfileStatus(id: string, status: BrowserProfile['status']): ProfileDetails;
  setProxyTestStatus(proxyId: string, result: ProxyTestResult): void;
  listAuditEvents(profileId?: string): AuditEvent[];
  recordAudit(profileId: string | null, action: AuditAction, metadata?: Record<string, unknown>): void;
}

export function createProfileService(options: ProfileServiceOptions): ProfileService {
  const { db, dataDir, secretBox } = options;
  const profilesRoot = path.join(dataDir, 'profiles');
  mkdirSync(profilesRoot, { recursive: true });

  function normalizeFingerprintPolicy(input?: Partial<FingerprintPolicy>): FingerprintPolicy {
    return {
      ...DEFAULT_FINGERPRINT_POLICY,
      ...input,
      timezone: normalizeTimezone(input?.timezone ?? DEFAULT_FINGERPRINT_POLICY.timezone),
      windowSize: {
        ...DEFAULT_FINGERPRINT_POLICY.windowSize,
        ...input?.windowSize
      }
    };
  }

  function normalizeRuntimeChannel(input?: RuntimeChannel): RuntimeChannel {
    return input === 'custom-kernel' ? 'custom-kernel' : 'official';
  }

  function normalizeTags(tags?: string[]): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  function normalizeGroupName(groupName?: string): string {
    return groupName?.trim() ?? '';
  }

  function assertValidProfileName(name: string): void {
    if (!name.trim()) {
      throw new Error('环境名称不能为空');
    }
  }

  function mapProxy(row: ProxyRow | undefined): ProxyConfig | null {
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      scheme: row.scheme,
      host: row.host,
      port: row.port,
      username: row.username,
      encryptedPassword: row.encrypted_password,
      bypassList: JSON.parse(row.bypass_list_json) as string[],
      lastTestStatus: row.last_test_status
    };
  }

  function mapProfile(row: ProfileRow): BrowserProfile {
    return {
      id: row.id,
      name: row.name,
      groupName: row.group_name ?? '',
      tags: JSON.parse(row.tags_json) as string[],
      status: row.status,
      userDataDir: row.user_data_dir,
      chromiumVersion: row.chromium_version,
      runtimeChannel: normalizeRuntimeChannel(row.runtime_channel),
      fingerprintPolicy: JSON.parse(row.fingerprint_policy_json) as FingerprintPolicy,
      proxyId: row.proxy_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function attachProxy(profile: BrowserProfile): ProfileDetails {
    const proxy = profile.proxyId
      ? mapProxy(db.prepare('select * from proxies where id = ?').get(profile.proxyId) as ProxyRow | undefined)
      : null;
    return {
      ...profile,
      proxy
    };
  }

  function createProxy(input: CreateProxyInput): ProxyConfig {
    assertValidProxyEndpoint({
      scheme: input.scheme,
      host: input.host,
      port: input.port
    });
    const now = new Date().toISOString();
    const proxy: ProxyConfig = {
      id: randomUUID(),
      scheme: input.scheme,
      host: input.host.trim(),
      port: input.port,
      username: input.username?.trim() ?? '',
      encryptedPassword: secretBox.encrypt(input.password ?? ''),
      bypassList: input.bypassList ?? [],
      lastTestStatus: 'untested'
    };

    db.prepare(
      `insert into proxies (
        id, scheme, host, port, username, encrypted_password, bypass_list_json, last_test_status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      proxy.id,
      proxy.scheme,
      proxy.host,
      proxy.port,
      proxy.username,
      proxy.encryptedPassword,
      JSON.stringify(proxy.bypassList),
      proxy.lastTestStatus,
      now,
      now
    );
    return proxy;
  }

  function duplicateProxy(proxyId: string): ProxyConfig {
    const source = db.prepare('select * from proxies where id = ?').get(proxyId) as ProxyRow | undefined;
    if (!source) {
      throw new Error('代理配置不存在');
    }
    const now = new Date().toISOString();
    const duplicated: ProxyConfig = {
      id: randomUUID(),
      scheme: source.scheme,
      host: source.host,
      port: source.port,
      username: source.username,
      encryptedPassword: source.encrypted_password,
      bypassList: JSON.parse(source.bypass_list_json) as string[],
      lastTestStatus: 'untested'
    };

    db.prepare(
      `insert into proxies (
        id, scheme, host, port, username, encrypted_password, bypass_list_json, last_test_status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      duplicated.id,
      duplicated.scheme,
      duplicated.host,
      duplicated.port,
      duplicated.username,
      duplicated.encryptedPassword,
      JSON.stringify(duplicated.bypassList),
      duplicated.lastTestStatus,
      now,
      now
    );
    return duplicated;
  }

  function updateOrCreateProxy(input: CreateProxyInput | null | undefined, existingProxyId: string | null): string | null {
    if (!input) {
      return null;
    }
    assertValidProxyEndpoint({
      scheme: input.scheme,
      host: input.host,
      port: input.port
    });

    if (!existingProxyId) {
      return createProxy(input).id;
    }

    const now = new Date().toISOString();
    const encryptedPassword =
      typeof input.password === 'string' && input.password.length > 0
        ? secretBox.encrypt(input.password)
        : ((db.prepare('select encrypted_password from proxies where id = ?').get(existingProxyId) as
            | { encrypted_password: string }
            | undefined)?.encrypted_password ?? '');

    db.prepare(
      `update proxies
       set scheme = ?, host = ?, port = ?, username = ?, encrypted_password = ?, bypass_list_json = ?, updated_at = ?
       where id = ?`
    ).run(
      input.scheme,
      input.host.trim(),
      input.port,
      input.username?.trim() ?? '',
      encryptedPassword,
      JSON.stringify(input.bypassList ?? []),
      now,
      existingProxyId
    );
    return existingProxyId;
  }

  function listProfiles(): ProfileDetails[] {
    const rows = db.prepare('select * from profiles order by updated_at desc').all() as ProfileRow[];
    return rows.map(mapProfile).map(attachProxy);
  }

  function getProfile(id: string): ProfileDetails {
    const row = db.prepare('select * from profiles where id = ?').get(id) as ProfileRow | undefined;
    if (!row) {
      throw new Error('浏览器环境不存在');
    }
    return attachProxy(mapProfile(row));
  }

  function recordAudit(profileId: string | null, action: AuditAction, metadata: Record<string, unknown> = {}): void {
    const actor = options.getAuditActor?.() ?? 'local-user';
    db.prepare(
      'insert into audit_events (id, profile_id, action, actor, metadata_json, created_at) values (?, ?, ?, ?, ?, ?)'
    ).run(randomUUID(), profileId, action, actor, JSON.stringify(metadata), new Date().toISOString());
  }

  return {
    listProfiles,
    createProfile(input: CreateProfileInput): ProfileDetails {
      assertValidProfileName(input.name);
      const id = randomUUID();
      const now = new Date().toISOString();
      const proxy = input.proxy ? createProxy(input.proxy) : null;
      const userDataDir = path.join(profilesRoot, id);
      mkdirSync(userDataDir, { recursive: true });

      db.prepare(
        `insert into profiles (
          id, name, group_name, tags_json, status, user_data_dir, chromium_version, runtime_channel, fingerprint_policy_json, proxy_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.name.trim(),
        normalizeGroupName(input.groupName),
        JSON.stringify(normalizeTags(input.tags)),
        'closed',
        userDataDir,
        CHROMIUM_VERSION,
        normalizeRuntimeChannel(input.runtimeChannel),
        JSON.stringify(normalizeFingerprintPolicy(input.fingerprintPolicy)),
        proxy?.id ?? null,
        now,
        now
      );

      recordAudit(id, 'PROFILE_CREATED', {
        name: input.name.trim(),
        groupName: normalizeGroupName(input.groupName),
        tags: normalizeTags(input.tags)
      });
      if (proxy) {
        recordAudit(id, 'PROXY_CREATED', redactProxyConfig(proxy));
      }
      return getProfile(id);
    },
    duplicateProfile(input: DuplicateProfileInput): ProfileDetails {
      const source = getProfile(input.profileId);
      const name = input.name?.trim() || `${source.name} 副本`;
      assertValidProfileName(name);
      const id = randomUUID();
      const now = new Date().toISOString();
      const shouldIncludeProxy = input.includeProxy !== false && Boolean(source.proxyId);
      const proxy = shouldIncludeProxy && source.proxyId ? duplicateProxy(source.proxyId) : null;
      const userDataDir = path.join(profilesRoot, id);
      mkdirSync(userDataDir, { recursive: true });

      db.prepare(
        `insert into profiles (
          id, name, group_name, tags_json, status, user_data_dir, chromium_version, runtime_channel, fingerprint_policy_json, proxy_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        name,
        normalizeGroupName(input.groupName ?? source.groupName),
        JSON.stringify(normalizeTags(input.tags ?? source.tags)),
        'closed',
        userDataDir,
        source.chromiumVersion,
        normalizeRuntimeChannel(source.runtimeChannel),
        JSON.stringify(normalizeFingerprintPolicy(source.fingerprintPolicy)),
        proxy?.id ?? null,
        now,
        now
      );

      recordAudit(id, 'PROFILE_DUPLICATED', {
        sourceProfileId: source.id,
        name,
        groupName: normalizeGroupName(input.groupName ?? source.groupName),
        tags: normalizeTags(input.tags ?? source.tags),
        runtimeChannel: normalizeRuntimeChannel(source.runtimeChannel),
        hasProxy: Boolean(proxy)
      });
      if (proxy) {
        recordAudit(id, 'PROXY_CREATED', redactProxyConfig(proxy));
      }
      return getProfile(id);
    },
    updateProfile(input: UpdateProfileInput): ProfileDetails {
      assertValidProfileName(input.name);
      const existing = getProfile(input.id);
      const proxyId = updateOrCreateProxy(input.proxy, existing.proxyId);
      const now = new Date().toISOString();

      db.prepare(
        `update profiles
         set name = ?, group_name = ?, tags_json = ?, fingerprint_policy_json = ?, runtime_channel = ?, proxy_id = ?, updated_at = ?
         where id = ?`
      ).run(
        input.name.trim(),
        normalizeGroupName(input.groupName),
        JSON.stringify(normalizeTags(input.tags)),
        JSON.stringify(normalizeFingerprintPolicy(input.fingerprintPolicy)),
        normalizeRuntimeChannel(input.runtimeChannel),
        proxyId,
        now,
        input.id
      );

      recordAudit(input.id, 'PROFILE_UPDATED', {
        name: input.name.trim(),
        groupName: normalizeGroupName(input.groupName),
        tags: normalizeTags(input.tags),
        runtimeChannel: normalizeRuntimeChannel(input.runtimeChannel),
        hasProxy: Boolean(proxyId)
      });
      if (proxyId) {
        recordAudit(input.id, existing.proxyId ? 'PROXY_UPDATED' : 'PROXY_CREATED', { proxyId });
      }
      return getProfile(input.id);
    },
    getProfile,
    setProfileStatus(id: string, status: BrowserProfile['status']): ProfileDetails {
      db.prepare('update profiles set status = ?, updated_at = ? where id = ?').run(status, new Date().toISOString(), id);
      return getProfile(id);
    },
    setProxyTestStatus(proxyId: string, result: ProxyTestResult): void {
      db.prepare('update proxies set last_test_status = ?, updated_at = ? where id = ?').run(
        result.status,
        result.testedAt,
        proxyId
      );
    },
    listAuditEvents(profileId?: string): AuditEvent[] {
      const rows = profileId
        ? (db
            .prepare('select * from audit_events where profile_id = ? order by created_at desc')
            .all(profileId) as AuditRow[])
        : (db.prepare('select * from audit_events order by created_at asc').all() as AuditRow[]);
      return rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        action: row.action,
        actor: row.actor,
        metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
        createdAt: row.created_at
      }));
    },
    recordAudit
  };
}
