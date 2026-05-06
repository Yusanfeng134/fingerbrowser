import type { CloudApiService } from '../../../cloud-api/src/service';
import type {
  CloudAuditEventRecord,
  CloudCredentialRecord,
  CloudEncryptedPayload,
  CloudEnvironmentRecord,
  CloudInvite,
  CloudProfileLock,
  CloudProfileSnapshot,
  CloudSession,
  CloudUser,
  CreateInviteInput
} from '../../../cloud-api/src/types';

export interface CloudClient {
  login(input: { email: string; password: string; deviceName: string }): CloudSession;
  acceptInvite(input: { inviteCode: string; email: string; displayName: string; password: string; deviceName: string }): CloudSession;
  logout(accessToken: string): void;
  listTeamMembers(accessToken: string): CloudUser[];
  createInvite(accessToken: string, input: CreateInviteInput): CloudInvite;
  upsertEnvironment(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudEnvironmentRecord;
  listEnvironments(accessToken: string): CloudEnvironmentRecord[];
  upsertCredential(accessToken: string, input: { remoteId: string; encryptedPayload: CloudEncryptedPayload }): CloudCredentialRecord;
  listCredentials(accessToken: string): CloudCredentialRecord[];
  appendAuditEvent(
    accessToken: string,
    input: { remoteId: string; profileRemoteId: string | null; encryptedPayload: CloudEncryptedPayload; createdAt?: string }
  ): CloudAuditEventRecord;
  listAuditEvents(accessToken: string): CloudAuditEventRecord[];
  lockProfile(accessToken: string, input: { profileRemoteId: string; force?: boolean }): CloudProfileLock;
  unlockProfile(accessToken: string, input: { profileRemoteId: string; lockId: string }): void;
  uploadProfileSnapshot(
    accessToken: string,
    input: { profileRemoteId: string; lockId: string } & CloudEncryptedPayload
  ): CloudProfileSnapshot;
  downloadLatestProfileSnapshot(accessToken: string, input: { profileRemoteId: string }): CloudProfileSnapshot;
}

export function createCloudClient(service: CloudApiService): CloudClient {
  return {
    login: (input) => service.login(input),
    acceptInvite: (input) => service.acceptInvite(input),
    logout: (accessToken) => service.logout(accessToken),
    listTeamMembers: (accessToken) => service.listTeamMembers(accessToken),
    createInvite: (accessToken, input) => service.createInvite(accessToken, input),
    upsertEnvironment: (accessToken, input) => service.upsertEnvironment(accessToken, input),
    listEnvironments: (accessToken) => service.listEnvironments(accessToken),
    upsertCredential: (accessToken, input) => service.upsertCredential(accessToken, input),
    listCredentials: (accessToken) => service.listCredentials(accessToken),
    appendAuditEvent: (accessToken, input) => service.appendAuditEvent(accessToken, input),
    listAuditEvents: (accessToken) => service.listAuditEvents(accessToken),
    lockProfile: (accessToken, input) => service.lockProfile(accessToken, input),
    unlockProfile: (accessToken, input) => service.unlockProfile(accessToken, input),
    uploadProfileSnapshot: (accessToken, input) => service.uploadProfileSnapshot(accessToken, input),
    downloadLatestProfileSnapshot: (accessToken, input) => service.downloadLatestProfileSnapshot(accessToken, input)
  };
}
