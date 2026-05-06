import { describe, expect, it } from 'vitest';
import { createCloudApiService } from '../cloud-api/src/service';
import { createMemoryCloudStore } from '../cloud-api/src/memory-store';
import { createMemoryObjectStorage } from '../cloud-api/src/object-storage';
import { createTeamSyncKey, decryptCloudPayload, encryptCloudPayload } from '../src/main/domain/cloud-crypto';

describe('cloud api service', () => {
  it('logs in a cloud admin, accepts invited members, and enforces team roles', async () => {
    const cloud = createCloudApiService({
      store: createMemoryCloudStore(),
      objects: createMemoryObjectStorage(),
      tokenSecret: 'test-token-secret'
    });

    await cloud.bootstrapTeam({
      teamName: 'Acme Ops',
      adminEmail: ' Admin@Example.Test ',
      adminPassword: 'AdminPass123!',
      adminDisplayName: '管理员',
      teamKey: createTeamSyncKey()
    });

    const adminSession = await cloud.login({
      email: 'admin@example.test',
      password: 'AdminPass123!',
      deviceName: 'MacBook Pro'
    });
    const invite = await cloud.createInvite(adminSession.accessToken, {
      email: 'member@example.test',
      role: 'member'
    });
    const memberSession = await cloud.acceptInvite({
      inviteCode: invite.inviteCode,
      email: 'member@example.test',
      displayName: '运营成员',
      password: 'MemberPass123!',
      deviceName: 'Mac mini'
    });

    expect(adminSession.user).toMatchObject({ email: 'admin@example.test', role: 'admin' });
    expect(memberSession.user).toMatchObject({ email: 'member@example.test', role: 'member' });
    expect(() => cloud.createInvite(memberSession.accessToken, { email: 'other@example.test', role: 'member' })).toThrow(
      '需要管理员权限'
    );
  });

  it('locks profile snapshots to one device and stores only encrypted browser state', async () => {
    const store = createMemoryCloudStore();
    const objects = createMemoryObjectStorage();
    const cloud = createCloudApiService({
      store,
      objects,
      tokenSecret: 'test-token-secret',
      now: () => new Date('2026-05-06T08:00:00.000Z')
    });
    const teamKey = createTeamSyncKey();
    await cloud.bootstrapTeam({
      teamName: 'Acme Ops',
      adminEmail: 'admin@example.test',
      adminPassword: 'AdminPass123!',
      adminDisplayName: '管理员',
      teamKey
    });
    const firstDevice = await cloud.login({
      email: 'admin@example.test',
      password: 'AdminPass123!',
      deviceName: 'MacBook Pro'
    });
    const secondDevice = await cloud.login({
      email: 'admin@example.test',
      password: 'AdminPass123!',
      deviceName: 'Mac Studio'
    });

    const lock = await cloud.lockProfile(firstDevice.accessToken, {
      profileRemoteId: 'profile-remote-1'
    });
    expect(() =>
      cloud.lockProfile(secondDevice.accessToken, {
        profileRemoteId: 'profile-remote-1'
      })
    ).toThrow('环境正在其他设备运行');

    const plaintextProfile = 'cookie=customer-session; cache=private-browser-state';
    const encrypted = encryptCloudPayload(Buffer.from(plaintextProfile, 'utf8'), teamKey);
    await cloud.uploadProfileSnapshot(firstDevice.accessToken, {
      profileRemoteId: 'profile-remote-1',
      lockId: lock.id,
      encryptedArchive: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      algorithm: encrypted.algorithm
    });
    await cloud.unlockProfile(firstDevice.accessToken, {
      profileRemoteId: 'profile-remote-1',
      lockId: lock.id
    });

    const latest = await cloud.downloadLatestProfileSnapshot(secondDevice.accessToken, {
      profileRemoteId: 'profile-remote-1'
    });
    expect(decryptCloudPayload(latest.snapshot, teamKey).toString('utf8')).toBe(plaintextProfile);
    expect(JSON.stringify(store.dumpForTesting())).not.toContain('customer-session');
    expect(JSON.stringify(objects.dumpForTesting())).not.toContain('private-browser-state');
  });
});
