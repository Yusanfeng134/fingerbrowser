import type {
  CloudAuditEventRecord,
  CloudCredentialRecord,
  CloudDevice,
  CloudEnvironmentRecord,
  CloudInvite,
  CloudProfileLock,
  CloudProfileSnapshot,
  CloudTeam,
  CloudUser
} from './types';

export interface StoredCloudTeam extends CloudTeam {
  teamKey: string;
}

export interface StoredCloudUser extends CloudUser {
  passwordSalt: string;
  passwordHash: string;
}

export interface StoredCloudSession {
  accessToken: string;
  refreshToken: string;
  teamId: string;
  userId: string;
  deviceId: string;
  expiresAt: string;
}

export interface MemoryCloudStoreDump {
  teams: Array<Omit<StoredCloudTeam, 'teamKey'>>;
  users: Array<Omit<StoredCloudUser, 'passwordSalt' | 'passwordHash'>>;
  devices: CloudDevice[];
  invites: Array<Omit<CloudInvite, 'inviteCode'>>;
  environments: CloudEnvironmentRecord[];
  credentials: CloudCredentialRecord[];
  auditEvents: CloudAuditEventRecord[];
  locks: CloudProfileLock[];
  snapshots: Array<Omit<CloudProfileSnapshot, 'snapshot'>>;
}

export interface MemoryCloudStore {
  teams: Map<string, StoredCloudTeam>;
  users: Map<string, StoredCloudUser>;
  devices: Map<string, CloudDevice>;
  sessions: Map<string, StoredCloudSession>;
  invites: Map<string, CloudInvite>;
  environments: Map<string, CloudEnvironmentRecord>;
  credentials: Map<string, CloudCredentialRecord>;
  auditEvents: Map<string, CloudAuditEventRecord>;
  locks: Map<string, CloudProfileLock>;
  snapshots: Map<string, CloudProfileSnapshot>;
  dumpForTesting(): MemoryCloudStoreDump;
}

export function createMemoryCloudStore(): MemoryCloudStore {
  const store: MemoryCloudStore = {
    teams: new Map(),
    users: new Map(),
    devices: new Map(),
    sessions: new Map(),
    invites: new Map(),
    environments: new Map(),
    credentials: new Map(),
    auditEvents: new Map(),
    locks: new Map(),
    snapshots: new Map(),
    dumpForTesting(): MemoryCloudStoreDump {
      return {
        teams: [...store.teams.values()].map((team) => ({
          id: team.id,
          name: team.name,
          createdAt: team.createdAt
        })),
        users: [...store.users.values()].map((user) => ({
          id: user.id,
          teamId: user.teamId,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt
        })),
        devices: [...store.devices.values()],
        invites: [...store.invites.values()].map((invite) => ({
          id: invite.id,
          teamId: invite.teamId,
          email: invite.email,
          role: invite.role,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          acceptedAt: invite.acceptedAt
        })),
        environments: [...store.environments.values()],
        credentials: [...store.credentials.values()],
        auditEvents: [...store.auditEvents.values()],
        locks: [...store.locks.values()],
        snapshots: [...store.snapshots.values()].map((snapshot) => ({
          id: snapshot.id,
          teamId: snapshot.teamId,
          profileRemoteId: snapshot.profileRemoteId,
          objectKey: snapshot.objectKey,
          version: snapshot.version,
          createdAt: snapshot.createdAt
        }))
      };
    }
  };
  return store;
}
