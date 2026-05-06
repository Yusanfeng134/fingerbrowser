import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AuditAction, SyncMigrationResult, SyncPullResult, SyncPushResult, SyncStatus } from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';
import type { CloudClient } from './cloud-client';
import { decryptCloudPayload, encryptCloudPayload } from './cloud-crypto';
import type { CredentialService } from './credential-service';
import type { SecretBox } from './encryption';
import type { ProfileService } from './profile-service';
import type { UserService } from './user-service';

interface CloudSyncServiceOptions {
  db: ApplicationDatabase;
  dataDir: string;
  secretBox: SecretBox;
  userService: UserService;
  profileService: ProfileService;
  credentialService: CredentialService;
  cloudClient: CloudClient;
}

interface ProfileSyncRow {
  id: string;
  name: string;
  owner: string;
  notes: string;
  group_name: string;
  tags_json: string;
  status: string;
  user_data_dir: string;
  chromium_version: string;
  runtime_channel: string;
  fingerprint_policy_json: string;
  proxy_id: string | null;
  last_launched_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  team_id: string | null;
  remote_id: string | null;
  sync_version: number;
}

interface ProxySyncRow {
  id: string;
  scheme: string;
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  bypass_list_json: string;
  last_test_status: string;
}

interface CredentialSyncRow {
  id: string;
  profile_id: string | null;
  title: string;
  website_url: string;
  username: string;
  encrypted_password: string;
  created_at: string;
  updated_at: string;
  last_copied_at: string | null;
  team_id: string | null;
  remote_id: string | null;
  sync_version: number;
}

interface AuditSyncRow {
  id: string;
  profile_id: string | null;
  action: AuditAction;
  actor: string;
  metadata_json: string;
  created_at: string;
  team_id: string | null;
  remote_id: string | null;
  sync_version: number;
}

interface ProfileCloudPayload {
  id: string;
  name: string;
  owner: string;
  notes: string;
  groupName: string;
  tags: string[];
  status: string;
  chromiumVersion: string;
  runtimeChannel: string;
  fingerprintPolicy: unknown;
  proxy: {
    id: string;
    scheme: string;
    host: string;
    port: number;
    username: string;
    password: string;
    bypassList: string[];
    lastTestStatus: string;
  } | null;
  lastLaunchedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CredentialCloudPayload {
  id: string;
  profileRemoteId: string | null;
  title: string;
  websiteUrl: string;
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
  lastCopiedAt: string | null;
}

interface AuditCloudPayload {
  id: string;
  profileRemoteId: string | null;
  action: AuditAction;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface PackedDirectoryEntry {
  relativePath: string;
  contentBase64: string;
}

export interface CloudSyncService {
  status(): SyncStatus;
  migrateLocalData(): SyncMigrationResult;
  pullWorkspace(): SyncPullResult;
  pushPendingChanges(): SyncPushResult;
  prepareProfileLaunch(profileId: string): void;
  finalizeProfileStop(profileId: string): void;
}

export function createCloudSyncService(options: CloudSyncServiceOptions): CloudSyncService {
  const runningLocks = new Map<string, { lockId: string; remoteId: string }>();

  function requireCloudSession() {
    const session = options.userService.currentCloudSession();
    const teamKey = options.userService.currentTeamKey();
    if (!session || !teamKey) {
      throw new Error('请先登录云账号');
    }
    return { session, teamKey };
  }

  function encodeJson(value: unknown, teamKey: string) {
    return encryptCloudPayload(Buffer.from(JSON.stringify(value), 'utf8'), teamKey);
  }

  function decodeJson<T>(payload: Parameters<typeof decryptCloudPayload>[0], teamKey: string): T {
    return JSON.parse(decryptCloudPayload(payload, teamKey).toString('utf8')) as T;
  }

  function listProfilesForSync(): ProfileSyncRow[] {
    return options.db.prepare('select * from profiles where deleted = 0 order by created_at asc').all() as ProfileSyncRow[];
  }

  function listCredentialsForSync(): CredentialSyncRow[] {
    return options.db.prepare('select * from credentials where deleted = 0 order by created_at asc').all() as CredentialSyncRow[];
  }

  function listAuditEventsForSync(): AuditSyncRow[] {
    return options.db.prepare('select * from audit_events where deleted = 0 order by created_at asc').all() as AuditSyncRow[];
  }

  function remoteProfileId(profileId: string): string {
    const row = options.db.prepare('select remote_id from profiles where id = ?').get(profileId) as { remote_id: string | null } | undefined;
    return row?.remote_id ?? profileId;
  }

  function profilePayload(row: ProfileSyncRow): ProfileCloudPayload {
    const proxy = row.proxy_id
      ? (options.db.prepare('select * from proxies where id = ?').get(row.proxy_id) as ProxySyncRow | undefined)
      : undefined;
    return {
      id: row.remote_id ?? row.id,
      name: row.name,
      owner: row.owner,
      notes: row.notes,
      groupName: row.group_name,
      tags: JSON.parse(row.tags_json) as string[],
      status: row.status,
      chromiumVersion: row.chromium_version,
      runtimeChannel: row.runtime_channel,
      fingerprintPolicy: JSON.parse(row.fingerprint_policy_json) as unknown,
      proxy: proxy
        ? {
            id: proxy.id,
            scheme: proxy.scheme,
            host: proxy.host,
            port: proxy.port,
            username: proxy.username,
            password: options.secretBox.decrypt(proxy.encrypted_password),
            bypassList: JSON.parse(proxy.bypass_list_json) as string[],
            lastTestStatus: proxy.last_test_status
          }
        : null,
      lastLaunchedAt: row.last_launched_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function credentialPayload(row: CredentialSyncRow): CredentialCloudPayload {
    return {
      id: row.remote_id ?? row.id,
      profileRemoteId: row.profile_id ? remoteProfileId(row.profile_id) : null,
      title: row.title,
      websiteUrl: row.website_url,
      username: row.username,
      password: options.secretBox.decrypt(row.encrypted_password),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCopiedAt: row.last_copied_at
    };
  }

  function auditPayload(row: AuditSyncRow): AuditCloudPayload {
    return {
      id: row.remote_id ?? row.id,
      profileRemoteId: row.profile_id ? remoteProfileId(row.profile_id) : null,
      action: row.action,
      actor: row.actor,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at
    };
  }

  function markSynced(table: string, id: string, teamId: string, remoteId: string, version: number): void {
    options.db
      .prepare(
        `update ${table}
         set team_id = ?, remote_id = ?, sync_version = ?, last_synced_at = ?, dirty = 0
         where id = ?`
      )
      .run(teamId, remoteId, version, new Date().toISOString(), id);
  }

  function hasLegacyDataToMigrate(teamId: string): boolean {
    const profileCount = options.db
      .prepare('select count(*) as count from profiles where deleted = 0 and (team_id is null or team_id != ?)')
      .get(teamId) as { count: number };
    const credentialCount = options.db
      .prepare('select count(*) as count from credentials where deleted = 0 and (team_id is null or team_id != ?)')
      .get(teamId) as { count: number };
    return profileCount.count + credentialCount.count > 0;
  }

  function upsertPulledProfile(payload: ProfileCloudPayload, teamId: string, version: number): void {
    const proxyId = payload.proxy ? `proxy-${payload.id}` : null;
    const now = new Date().toISOString();
    if (payload.proxy) {
      const encryptedPassword = options.secretBox.encrypt(payload.proxy.password);
      options.db
        .prepare(
          `insert into proxies (
            id, scheme, host, port, username, encrypted_password, bypass_list_json, last_test_status,
            team_id, remote_id, sync_version, last_synced_at, dirty, deleted, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(id) do update set
            scheme = excluded.scheme,
            host = excluded.host,
            port = excluded.port,
            username = excluded.username,
            encrypted_password = excluded.encrypted_password,
            bypass_list_json = excluded.bypass_list_json,
            last_test_status = excluded.last_test_status,
            team_id = excluded.team_id,
            remote_id = excluded.remote_id,
            sync_version = excluded.sync_version,
            last_synced_at = excluded.last_synced_at,
            dirty = 0,
            deleted = 0,
            updated_at = excluded.updated_at`
        )
        .run(
          proxyId,
          payload.proxy.scheme,
          payload.proxy.host,
          payload.proxy.port,
          payload.proxy.username,
          encryptedPassword,
          JSON.stringify(payload.proxy.bypassList),
          payload.proxy.lastTestStatus,
          teamId,
          payload.proxy.id,
          version,
          now,
          0,
          0,
          payload.createdAt,
          payload.updatedAt
        );
    }

    const userDataDir = path.join(options.dataDir, 'profiles', payload.id);
    mkdirSync(userDataDir, { recursive: true });
    options.db
      .prepare(
        `insert into profiles (
          id, name, owner, notes, group_name, tags_json, status, user_data_dir, chromium_version, runtime_channel,
          fingerprint_policy_json, proxy_id, last_launched_at, archived_at, team_id, remote_id, sync_version,
          last_synced_at, dirty, deleted, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          name = excluded.name,
          owner = excluded.owner,
          notes = excluded.notes,
          group_name = excluded.group_name,
          tags_json = excluded.tags_json,
          status = excluded.status,
          chromium_version = excluded.chromium_version,
          runtime_channel = excluded.runtime_channel,
          fingerprint_policy_json = excluded.fingerprint_policy_json,
          proxy_id = excluded.proxy_id,
          last_launched_at = excluded.last_launched_at,
          archived_at = excluded.archived_at,
          team_id = excluded.team_id,
          remote_id = excluded.remote_id,
          sync_version = excluded.sync_version,
          last_synced_at = excluded.last_synced_at,
          dirty = 0,
          deleted = 0,
          updated_at = excluded.updated_at`
      )
      .run(
        payload.id,
        payload.name,
        payload.owner,
        payload.notes,
        payload.groupName,
        JSON.stringify(payload.tags),
        payload.status,
        userDataDir,
        payload.chromiumVersion,
        payload.runtimeChannel,
        JSON.stringify(payload.fingerprintPolicy),
        proxyId,
        payload.lastLaunchedAt,
        payload.archivedAt,
        teamId,
        payload.id,
        version,
        now,
        0,
        0,
        payload.createdAt,
        payload.updatedAt
      );
  }

  function upsertPulledCredential(payload: CredentialCloudPayload, teamId: string, version: number): void {
    const now = new Date().toISOString();
    options.db
      .prepare(
        `insert into credentials (
          id, profile_id, title, website_url, username, encrypted_password, team_id, remote_id, sync_version,
          last_synced_at, dirty, deleted, created_at, updated_at, last_copied_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          profile_id = excluded.profile_id,
          title = excluded.title,
          website_url = excluded.website_url,
          username = excluded.username,
          encrypted_password = excluded.encrypted_password,
          team_id = excluded.team_id,
          remote_id = excluded.remote_id,
          sync_version = excluded.sync_version,
          last_synced_at = excluded.last_synced_at,
          dirty = 0,
          deleted = 0,
          updated_at = excluded.updated_at,
          last_copied_at = excluded.last_copied_at`
      )
      .run(
        payload.id,
        payload.profileRemoteId,
        payload.title,
        payload.websiteUrl,
        payload.username,
        options.secretBox.encrypt(payload.password),
        teamId,
        payload.id,
        version,
        now,
        0,
        0,
        payload.createdAt,
        payload.updatedAt,
        payload.lastCopiedAt
      );
  }

  function upsertPulledAudit(payload: AuditCloudPayload, teamId: string): void {
    options.db
      .prepare(
        `insert or ignore into audit_events (
          id, profile_id, action, actor, metadata_json, team_id, remote_id, sync_version, last_synced_at, dirty, deleted, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.id,
        payload.profileRemoteId,
        payload.action,
        payload.actor,
        JSON.stringify(payload.metadata),
        teamId,
        payload.id,
        1,
        new Date().toISOString(),
        0,
        0,
        payload.createdAt
      );
  }

  function packProfileDirectory(profileId: string): Buffer {
    const row = options.db.prepare('select user_data_dir from profiles where id = ?').get(profileId) as
      | { user_data_dir: string }
      | undefined;
    if (!row || !existsSync(row.user_data_dir)) {
      return Buffer.from('[]', 'utf8');
    }
    const entries: PackedDirectoryEntry[] = [];
    collectFiles(row.user_data_dir, row.user_data_dir, entries);
    return Buffer.from(JSON.stringify(entries), 'utf8');
  }

  function unpackProfileDirectory(profileId: string, archive: Buffer): void {
    const row = options.db.prepare('select user_data_dir from profiles where id = ?').get(profileId) as
      | { user_data_dir: string }
      | undefined;
    if (!row) {
      return;
    }
    const entries = JSON.parse(archive.toString('utf8')) as PackedDirectoryEntry[];
    rmSync(row.user_data_dir, { recursive: true, force: true });
    mkdirSync(row.user_data_dir, { recursive: true });
    for (const entry of entries) {
      const target = path.join(row.user_data_dir, entry.relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(entry.contentBase64, 'base64'));
    }
  }

  function collectFiles(root: string, current: string, entries: PackedDirectoryEntry[]): void {
    for (const name of readdirSync(current)) {
      const filePath = path.join(current, name);
      const relativePath = path.relative(root, filePath);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        collectFiles(root, filePath, entries);
      } else if (stat.isFile()) {
        entries.push({
          relativePath,
          contentBase64: readFileSync(filePath).toString('base64')
        });
      }
    }
  }

  function migrateAllLocalData(): SyncMigrationResult {
    const { session, teamKey } = requireCloudSession();
    const profiles = listProfilesForSync();
    const credentials = listCredentialsForSync();
    const auditEvents = listAuditEventsForSync();
    let migratedProfileSnapshots = 0;
    for (const profile of profiles) {
      const remoteId = profile.remote_id ?? profile.id;
      const record = options.cloudClient.upsertEnvironment(session.accessToken, {
        remoteId,
        encryptedPayload: encodeJson(profilePayload(profile), teamKey)
      });
      markSynced('profiles', profile.id, session.team.id, remoteId, record.version);
      if (profile.proxy_id) {
        markSynced('proxies', profile.proxy_id, session.team.id, profile.proxy_id, record.version);
      }
      const lock = options.cloudClient.lockProfile(session.accessToken, { profileRemoteId: remoteId, force: true });
      const snapshot = encryptCloudPayload(packProfileDirectory(profile.id), teamKey);
      options.cloudClient.uploadProfileSnapshot(session.accessToken, {
        profileRemoteId: remoteId,
        lockId: lock.id,
        ...snapshot
      });
      options.cloudClient.unlockProfile(session.accessToken, { profileRemoteId: remoteId, lockId: lock.id });
      migratedProfileSnapshots += 1;
    }
    for (const credential of credentials) {
      const remoteId = credential.remote_id ?? credential.id;
      const record = options.cloudClient.upsertCredential(session.accessToken, {
        remoteId,
        encryptedPayload: encodeJson(credentialPayload(credential), teamKey)
      });
      markSynced('credentials', credential.id, session.team.id, remoteId, record.version);
    }
    for (const auditEvent of auditEvents) {
      const remoteId = auditEvent.remote_id ?? auditEvent.id;
      options.cloudClient.appendAuditEvent(session.accessToken, {
        remoteId,
        profileRemoteId: auditEvent.profile_id ? remoteProfileId(auditEvent.profile_id) : null,
        encryptedPayload: encodeJson(auditPayload(auditEvent), teamKey),
        createdAt: auditEvent.created_at
      });
      markSynced('audit_events', auditEvent.id, session.team.id, remoteId, 1);
    }
    return {
      migratedProfiles: profiles.length,
      migratedCredentials: credentials.length,
      migratedAuditEvents: auditEvents.length,
      migratedProfileSnapshots
    };
  }

  return {
    status(): SyncStatus {
      const session = options.userService.currentCloudSession();
      const teamId = session?.team.id ?? null;
      const pendingProfiles = options.db.prepare('select count(*) as count from profiles where dirty = 1').get() as { count: number };
      const pendingCredentials = options.db.prepare('select count(*) as count from credentials where dirty = 1').get() as { count: number };
      const pendingAudit = options.db.prepare('select count(*) as count from audit_events where dirty = 1').get() as { count: number };
      return {
        authenticated: Boolean(session),
        teamId,
        teamName: session?.team.name ?? null,
        hasLocalDataToMigrate: teamId ? hasLegacyDataToMigrate(teamId) : false,
        pendingLocalRecords: pendingProfiles.count + pendingCredentials.count + pendingAudit.count,
        runningProfileLocks: runningLocks.size
      };
    },
    migrateLocalData(): SyncMigrationResult {
      return migrateAllLocalData();
    },
    pullWorkspace(): SyncPullResult {
      const { session, teamKey } = requireCloudSession();
      const environments = options.cloudClient.listEnvironments(session.accessToken);
      const credentials = options.cloudClient.listCredentials(session.accessToken);
      const auditEvents = options.cloudClient.listAuditEvents(session.accessToken);
      for (const record of environments) {
        upsertPulledProfile(decodeJson<ProfileCloudPayload>(record.encryptedPayload, teamKey), session.team.id, record.version);
      }
      for (const record of credentials) {
        upsertPulledCredential(decodeJson<CredentialCloudPayload>(record.encryptedPayload, teamKey), session.team.id, record.version);
      }
      for (const record of auditEvents) {
        upsertPulledAudit(decodeJson<AuditCloudPayload>(record.encryptedPayload, teamKey), session.team.id);
      }
      return {
        profiles: environments.length,
        credentials: credentials.length,
        auditEvents: auditEvents.length
      };
    },
    pushPendingChanges(): SyncPushResult {
      const result = migrateAllLocalData();
      return {
        profiles: result.migratedProfiles,
        credentials: result.migratedCredentials,
        auditEvents: result.migratedAuditEvents
      };
    },
    prepareProfileLaunch(profileId: string): void {
      const { session, teamKey } = requireCloudSession();
      const remoteId = remoteProfileId(profileId);
      const lock = options.cloudClient.lockProfile(session.accessToken, { profileRemoteId: remoteId });
      runningLocks.set(profileId, { lockId: lock.id, remoteId });
      try {
        const latest = options.cloudClient.downloadLatestProfileSnapshot(session.accessToken, { profileRemoteId: remoteId });
        unpackProfileDirectory(profileId, decryptCloudPayload(latest.snapshot, teamKey));
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('快照不存在')) {
          throw error;
        }
      }
    },
    finalizeProfileStop(profileId: string): void {
      const { session, teamKey } = requireCloudSession();
      const lock = runningLocks.get(profileId);
      if (!lock) {
        return;
      }
      const snapshot = encryptCloudPayload(packProfileDirectory(profileId), teamKey);
      options.cloudClient.uploadProfileSnapshot(session.accessToken, {
        profileRemoteId: lock.remoteId,
        lockId: lock.lockId,
        ...snapshot
      });
      options.cloudClient.unlockProfile(session.accessToken, {
        profileRemoteId: lock.remoteId,
        lockId: lock.lockId
      });
      runningLocks.delete(profileId);
    }
  };
}
