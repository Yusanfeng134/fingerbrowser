export type CloudUserRole = 'admin' | 'member';
export type CloudUserStatus = 'active' | 'disabled';
export type CloudCipherAlgorithm = 'aes-256-gcm';

export interface CloudTeam {
  id: string;
  name: string;
  createdAt: string;
}

export interface CloudUser {
  id: string;
  teamId: string;
  email: string;
  displayName: string;
  role: CloudUserRole;
  status: CloudUserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface CloudDevice {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  user: CloudUser;
  team: CloudTeam;
  device: CloudDevice;
  teamKey: string;
  expiresAt: string;
}

export interface CloudEncryptedPayload {
  ciphertext: string;
  nonce: string;
  authTag: string;
  algorithm: CloudCipherAlgorithm;
}

export interface CloudInvite {
  id: string;
  teamId: string;
  email: string;
  role: CloudUserRole;
  inviteCode: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface CloudEnvironmentRecord {
  remoteId: string;
  teamId: string;
  encryptedPayload: CloudEncryptedPayload;
  version: number;
  updatedAt: string;
}

export interface CloudCredentialRecord {
  remoteId: string;
  teamId: string;
  encryptedPayload: CloudEncryptedPayload;
  version: number;
  updatedAt: string;
}

export interface CloudAuditEventRecord {
  remoteId: string;
  teamId: string;
  profileRemoteId: string | null;
  encryptedPayload: CloudEncryptedPayload;
  createdAt: string;
}

export interface CloudProfileLock {
  id: string;
  teamId: string;
  profileRemoteId: string;
  deviceId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface CloudProfileSnapshot {
  id: string;
  teamId: string;
  profileRemoteId: string;
  objectKey: string;
  snapshot: CloudEncryptedPayload;
  version: number;
  createdAt: string;
}

export interface BootstrapTeamInput {
  teamName: string;
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
  teamKey: string;
}

export interface CloudLoginInput {
  email: string;
  password: string;
  deviceName: string;
}

export interface AcceptInviteInput extends CloudLoginInput {
  inviteCode: string;
  displayName: string;
}

export interface CreateInviteInput {
  email: string;
  role: CloudUserRole;
}

export interface LockProfileInput {
  profileRemoteId: string;
  force?: boolean;
}

export interface UnlockProfileInput {
  profileRemoteId: string;
  lockId: string;
}

export interface UploadProfileSnapshotInput {
  profileRemoteId: string;
  lockId: string;
  encryptedArchive?: string;
  ciphertext?: string;
  nonce: string;
  authTag: string;
  algorithm: CloudCipherAlgorithm;
}

export interface LatestProfileSnapshotInput {
  profileRemoteId: string;
}
