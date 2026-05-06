import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { MemoryCloudStore, StoredCloudSession, StoredCloudTeam, StoredCloudUser } from './memory-store';
import type { CloudObjectStorage } from './object-storage';
import type {
  AcceptInviteInput,
  BootstrapTeamInput,
  CloudAuditEventRecord,
  CloudCredentialRecord,
  CloudDevice,
  CloudEncryptedPayload,
  CloudEnvironmentRecord,
  CloudInvite,
  CloudLoginInput,
  CloudProfileLock,
  CloudProfileSnapshot,
  CloudSession,
  CloudTeam,
  CloudUser,
  CreateInviteInput,
  LatestProfileSnapshotInput,
  LockProfileInput,
  UnlockProfileInput,
  UploadProfileSnapshotInput
} from './types';

const PASSWORD_HASH_LENGTH = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_LOCK_TTL_MS = 30 * 60 * 1000;

export interface CreateCloudApiServiceOptions {
  store: MemoryCloudStore;
  objects: CloudObjectStorage;
  tokenSecret: string;
  now?: () => Date;
}

export interface CloudApiService {
  bootstrapTeam(input: BootstrapTeamInput): CloudTeam;
  login(input: CloudLoginInput): CloudSession;
  refresh(refreshToken: string): CloudSession;
  logout(accessToken: string): void;
  me(accessToken: string): { user: CloudUser; team: CloudTeam; device: CloudDevice };
  createInvite(accessToken: string, input: CreateInviteInput): CloudInvite;
  acceptInvite(input: AcceptInviteInput): CloudSession;
  listTeamMembers(accessToken: string): CloudUser[];
  upsertEnvironment(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudEnvironmentRecord;
  listEnvironments(accessToken: string): CloudEnvironmentRecord[];
  upsertCredential(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudCredentialRecord;
  listCredentials(accessToken: string): CloudCredentialRecord[];
  appendAuditEvent(
    accessToken: string,
    input: { remoteId: string; profileRemoteId: string | null; encryptedPayload: CloudEncryptedPayload; createdAt?: string }
  ): CloudAuditEventRecord;
  listAuditEvents(accessToken: string): CloudAuditEventRecord[];
  lockProfile(accessToken: string, input: LockProfileInput): CloudProfileLock;
  unlockProfile(accessToken: string, input: UnlockProfileInput): void;
  uploadProfileSnapshot(accessToken: string, input: UploadProfileSnapshotInput): CloudProfileSnapshot;
  downloadLatestProfileSnapshot(accessToken: string, input: LatestProfileSnapshotInput): CloudProfileSnapshot;
  dumpForTesting(): unknown;
}

export function createCloudApiService(options: CreateCloudApiServiceOptions): CloudApiService {
  const { store, objects } = options;
  const now = options.now ?? (() => new Date());

  function currentIso(): string {
    return now().toISOString();
  }

  function normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new Error('邮箱格式无效');
    }
    return normalized;
  }

  function normalizePassword(password: string): string {
    if (password.length < 8) {
      throw new Error('密码至少需要 8 位');
    }
    return password;
  }

  function normalizeDisplayName(displayName: string): string {
    const normalized = displayName.trim();
    if (!normalized) {
      throw new Error('用户名称不能为空');
    }
    return normalized;
  }

  function createPasswordSecret(password: string): { salt: string; hash: string } {
    const salt = randomBytes(16).toString('base64url');
    return {
      salt,
      hash: scryptSync(password, salt, PASSWORD_HASH_LENGTH).toString('base64url')
    };
  }

  function verifyPassword(password: string, user: StoredCloudUser): boolean {
    const expected = Buffer.from(user.passwordHash, 'base64url');
    const actual = Buffer.from(scryptSync(password, user.passwordSalt, PASSWORD_HASH_LENGTH).toString('base64url'), 'base64url');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  function publicUser(user: StoredCloudUser): CloudUser {
    return {
      id: user.id,
      teamId: user.teamId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  function publicTeam(team: StoredCloudTeam): CloudTeam {
    return {
      id: team.id,
      name: team.name,
      createdAt: team.createdAt
    };
  }

  function getUserByEmail(email: string): StoredCloudUser | null {
    return [...store.users.values()].find((user) => user.email === email) ?? null;
  }

  function authorize(accessToken: string): {
    session: StoredCloudSession;
    user: StoredCloudUser;
    team: StoredCloudTeam;
    device: CloudDevice;
  } {
    const session = store.sessions.get(accessToken);
    if (!session) {
      throw new Error('云账号会话无效');
    }
    if (new Date(session.expiresAt).getTime() <= now().getTime()) {
      store.sessions.delete(accessToken);
      throw new Error('云账号会话已过期');
    }
    const user = store.users.get(session.userId);
    const team = store.teams.get(session.teamId);
    const device = store.devices.get(session.deviceId);
    if (!user || !team || !device || user.status !== 'active') {
      throw new Error('云账号会话无效');
    }
    return { session, user, team, device };
  }

  function issueSession(user: StoredCloudUser, team: StoredCloudTeam, deviceName: string): CloudSession {
    const timestamp = currentIso();
    const existingDevice = [...store.devices.values()].find(
      (device) => device.userId === user.id && device.name === deviceName
    );
    const device: CloudDevice = existingDevice
      ? { ...existingDevice, lastSeenAt: timestamp }
      : {
          id: randomUUID(),
          teamId: team.id,
          userId: user.id,
          name: deviceName.trim() || 'Unnamed device',
          createdAt: timestamp,
          lastSeenAt: timestamp
        };
    store.devices.set(device.id, device);
    const accessToken = `fb_at_${randomBytes(24).toString('base64url')}`;
    const refreshToken = `fb_rt_${randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS).toISOString();
    store.sessions.set(accessToken, {
      accessToken,
      refreshToken,
      teamId: team.id,
      userId: user.id,
      deviceId: device.id,
      expiresAt
    });
    const loggedInAt = timestamp;
    store.users.set(user.id, {
      ...user,
      lastLoginAt: loggedInAt,
      updatedAt: loggedInAt
    });
    return {
      accessToken,
      refreshToken,
      user: publicUser(store.users.get(user.id) ?? user),
      team: publicTeam(team),
      device,
      teamKey: team.teamKey,
      expiresAt
    };
  }

  function requireAdmin(accessToken: string): ReturnType<typeof authorize> {
    const actor = authorize(accessToken);
    if (actor.user.role !== 'admin') {
      throw new Error('需要管理员权限');
    }
    return actor;
  }

  function assertSameTeam(token: string, recordTeamId: string): ReturnType<typeof authorize> {
    const actor = authorize(token);
    if (actor.team.id !== recordTeamId) {
      throw new Error('无权访问团队数据');
    }
    return actor;
  }

  return {
    bootstrapTeam(input: BootstrapTeamInput): CloudTeam {
      const email = normalizeEmail(input.adminEmail);
      if (getUserByEmail(email)) {
        throw new Error('云账号邮箱已存在');
      }
      const createdAt = currentIso();
      const team: StoredCloudTeam = {
        id: randomUUID(),
        name: input.teamName.trim() || 'FingerBrowser Team',
        teamKey: input.teamKey,
        createdAt
      };
      const secret = createPasswordSecret(normalizePassword(input.adminPassword));
      const user: StoredCloudUser = {
        id: randomUUID(),
        teamId: team.id,
        email,
        displayName: normalizeDisplayName(input.adminDisplayName),
        role: 'admin',
        status: 'active',
        passwordSalt: secret.salt,
        passwordHash: secret.hash,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: null
      };
      store.teams.set(team.id, team);
      store.users.set(user.id, user);
      return publicTeam(team);
    },
    login(input: CloudLoginInput): CloudSession {
      const email = normalizeEmail(input.email);
      const user = getUserByEmail(email);
      if (!user || !verifyPassword(input.password, user)) {
        throw new Error('云账号或密码错误');
      }
      if (user.status !== 'active') {
        throw new Error('云账号已停用');
      }
      const team = store.teams.get(user.teamId);
      if (!team) {
        throw new Error('团队不存在');
      }
      return issueSession(user, team, input.deviceName);
    },
    refresh(refreshToken: string): CloudSession {
      const session = [...store.sessions.values()].find((value) => value.refreshToken === refreshToken);
      if (!session) {
        throw new Error('刷新令牌无效');
      }
      const user = store.users.get(session.userId);
      const team = store.teams.get(session.teamId);
      const device = store.devices.get(session.deviceId);
      if (!user || !team || !device) {
        throw new Error('刷新令牌无效');
      }
      return issueSession(user, team, device.name);
    },
    logout(accessToken: string): void {
      store.sessions.delete(accessToken);
    },
    me(accessToken: string): { user: CloudUser; team: CloudTeam; device: CloudDevice } {
      const actor = authorize(accessToken);
      return {
        user: publicUser(actor.user),
        team: publicTeam(actor.team),
        device: actor.device
      };
    },
    createInvite(accessToken: string, input: CreateInviteInput): CloudInvite {
      const actor = requireAdmin(accessToken);
      const createdAt = currentIso();
      const invite: CloudInvite = {
        id: randomUUID(),
        teamId: actor.team.id,
        email: normalizeEmail(input.email),
        role: input.role === 'admin' ? 'admin' : 'member',
        inviteCode: `fb_inv_${actor.team.teamKey}_${randomBytes(16).toString('base64url')}`,
        createdAt,
        expiresAt: new Date(now().getTime() + INVITE_TTL_MS).toISOString(),
        acceptedAt: null
      };
      store.invites.set(invite.inviteCode, invite);
      return invite;
    },
    acceptInvite(input: AcceptInviteInput): CloudSession {
      const invite = store.invites.get(input.inviteCode);
      if (!invite || invite.acceptedAt) {
        throw new Error('邀请码无效');
      }
      if (new Date(invite.expiresAt).getTime() <= now().getTime()) {
        throw new Error('邀请码已过期');
      }
      const email = normalizeEmail(input.email);
      if (email !== invite.email) {
        throw new Error('邀请码邮箱不匹配');
      }
      if (getUserByEmail(email)) {
        throw new Error('云账号邮箱已存在');
      }
      const team = store.teams.get(invite.teamId);
      if (!team) {
        throw new Error('团队不存在');
      }
      const createdAt = currentIso();
      const secret = createPasswordSecret(normalizePassword(input.password));
      const user: StoredCloudUser = {
        id: randomUUID(),
        teamId: team.id,
        email,
        displayName: normalizeDisplayName(input.displayName),
        role: invite.role,
        status: 'active',
        passwordSalt: secret.salt,
        passwordHash: secret.hash,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: null
      };
      store.users.set(user.id, user);
      store.invites.set(invite.inviteCode, {
        ...invite,
        acceptedAt: createdAt
      });
      return issueSession(user, team, input.deviceName);
    },
    listTeamMembers(accessToken: string): CloudUser[] {
      const actor = authorize(accessToken);
      return [...store.users.values()]
        .filter((user) => user.teamId === actor.team.id)
        .map(publicUser)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    },
    upsertEnvironment(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudEnvironmentRecord {
      const actor = authorize(accessToken);
      const existing = store.environments.get(`${actor.team.id}:${input.remoteId}`);
      const record: CloudEnvironmentRecord = {
        remoteId: input.remoteId,
        teamId: actor.team.id,
        encryptedPayload: input.encryptedPayload,
        version: (existing?.version ?? 0) + 1,
        updatedAt: currentIso()
      };
      store.environments.set(`${actor.team.id}:${input.remoteId}`, record);
      return record;
    },
    listEnvironments(accessToken: string): CloudEnvironmentRecord[] {
      const actor = authorize(accessToken);
      return [...store.environments.values()].filter((record) => record.teamId === actor.team.id);
    },
    upsertCredential(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudCredentialRecord {
      const actor = authorize(accessToken);
      const existing = store.credentials.get(`${actor.team.id}:${input.remoteId}`);
      const record: CloudCredentialRecord = {
        remoteId: input.remoteId,
        teamId: actor.team.id,
        encryptedPayload: input.encryptedPayload,
        version: (existing?.version ?? 0) + 1,
        updatedAt: currentIso()
      };
      store.credentials.set(`${actor.team.id}:${input.remoteId}`, record);
      return record;
    },
    listCredentials(accessToken: string): CloudCredentialRecord[] {
      const actor = authorize(accessToken);
      return [...store.credentials.values()].filter((record) => record.teamId === actor.team.id);
    },
    appendAuditEvent(
      accessToken: string,
      input: { remoteId: string; profileRemoteId: string | null; encryptedPayload: CloudEncryptedPayload; createdAt?: string }
    ): CloudAuditEventRecord {
      const actor = authorize(accessToken);
      const record: CloudAuditEventRecord = {
        remoteId: input.remoteId,
        teamId: actor.team.id,
        profileRemoteId: input.profileRemoteId,
        encryptedPayload: input.encryptedPayload,
        createdAt: input.createdAt ?? currentIso()
      };
      store.auditEvents.set(`${actor.team.id}:${input.remoteId}`, record);
      return record;
    },
    listAuditEvents(accessToken: string): CloudAuditEventRecord[] {
      const actor = authorize(accessToken);
      return [...store.auditEvents.values()].filter((record) => record.teamId === actor.team.id);
    },
    lockProfile(accessToken: string, input: LockProfileInput): CloudProfileLock {
      const actor = authorize(accessToken);
      const lockKey = `${actor.team.id}:${input.profileRemoteId}`;
      const existing = store.locks.get(lockKey);
      const isExpired = existing ? new Date(existing.expiresAt).getTime() <= now().getTime() : true;
      if (existing && !isExpired && existing.deviceId !== actor.device.id && !input.force) {
        throw new Error('环境正在其他设备运行');
      }
      const lock: CloudProfileLock = {
        id: randomUUID(),
        teamId: actor.team.id,
        profileRemoteId: input.profileRemoteId,
        deviceId: actor.device.id,
        userId: actor.user.id,
        createdAt: currentIso(),
        expiresAt: new Date(now().getTime() + PROFILE_LOCK_TTL_MS).toISOString()
      };
      store.locks.set(lockKey, lock);
      return lock;
    },
    unlockProfile(accessToken: string, input: UnlockProfileInput): void {
      const actor = assertSameTeam(accessToken, authorize(accessToken).team.id);
      const lockKey = `${actor.team.id}:${input.profileRemoteId}`;
      const existing = store.locks.get(lockKey);
      if (!existing || existing.id !== input.lockId || existing.deviceId !== actor.device.id) {
        throw new Error('环境锁不存在或不属于当前设备');
      }
      store.locks.delete(lockKey);
    },
    uploadProfileSnapshot(accessToken: string, input: UploadProfileSnapshotInput): CloudProfileSnapshot {
      const actor = authorize(accessToken);
      const lock = store.locks.get(`${actor.team.id}:${input.profileRemoteId}`);
      if (!lock || lock.id !== input.lockId || lock.deviceId !== actor.device.id) {
        throw new Error('需要持有环境锁才能上传快照');
      }
      const existing = [...store.snapshots.values()]
        .filter((snapshot) => snapshot.teamId === actor.team.id && snapshot.profileRemoteId === input.profileRemoteId)
        .sort((first, second) => second.version - first.version)[0];
      const version = (existing?.version ?? 0) + 1;
      const objectKey = `${actor.team.id}/${input.profileRemoteId}/${version}.fbprofile`;
      const ciphertext = input.encryptedArchive ?? input.ciphertext;
      if (!ciphertext) {
        throw new Error('缺少加密 profile 快照');
      }
      const encryptedObject: CloudEncryptedPayload = {
        ciphertext,
        nonce: input.nonce,
        authTag: input.authTag,
        algorithm: input.algorithm
      };
      objects.putObject(objectKey, encryptedObject);
      const snapshot: CloudProfileSnapshot = {
        id: randomUUID(),
        teamId: actor.team.id,
        profileRemoteId: input.profileRemoteId,
        objectKey,
        snapshot: encryptedObject,
        version,
        createdAt: currentIso()
      };
      store.snapshots.set(`${actor.team.id}:${input.profileRemoteId}:${version}`, snapshot);
      return snapshot;
    },
    downloadLatestProfileSnapshot(accessToken: string, input: LatestProfileSnapshotInput): CloudProfileSnapshot {
      const actor = authorize(accessToken);
      const latest = [...store.snapshots.values()]
        .filter((snapshot) => snapshot.teamId === actor.team.id && snapshot.profileRemoteId === input.profileRemoteId)
        .sort((first, second) => second.version - first.version)[0];
      if (!latest) {
        throw new Error('云端环境快照不存在');
      }
      return {
        ...latest,
        snapshot: objects.getObject(latest.objectKey)
      };
    },
    dumpForTesting(): unknown {
      return {
        metadata: store.dumpForTesting(),
        objects: objects.dumpForTesting()
      };
    }
  };
}
