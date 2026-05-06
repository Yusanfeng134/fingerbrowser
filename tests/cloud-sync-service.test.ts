import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCloudApiService } from '../cloud-api/src/service';
import { createMemoryCloudStore } from '../cloud-api/src/memory-store';
import { createMemoryObjectStorage } from '../cloud-api/src/object-storage';
import { DEFAULT_FINGERPRINT_POLICY } from '../src/shared/defaults';
import { createCloudClient } from '../src/main/domain/cloud-client';
import { createTeamSyncKey } from '../src/main/domain/cloud-crypto';
import { createCloudSyncService } from '../src/main/domain/cloud-sync-service';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createCredentialService } from '../src/main/domain/credential-service';
import { createProfileService } from '../src/main/domain/profile-service';
import { createUserService } from '../src/main/domain/user-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-cloud-sync-test-'));
  tempDirs.push(dir);
  return dir;
}

function createHarness(
  cloud: ReturnType<typeof createCloudApiService>,
  options: { dataDir?: string; clipboard?: string[] } = {}
) {
  const dataDir = options.dataDir ?? tempDir();
  const clipboard = options.clipboard ?? [];
  const secretBox = createNodeSecretBox(`fingerbrowser-test:${dataDir}`);
  const db = openApplicationDatabase(path.join(dataDir, 'fingerbrowser.sqlite'));
  const userService = createUserService({
    db,
    cloudClient: createCloudClient(cloud),
    deviceName: 'test-device'
  });
  const profileService = createProfileService({
    db,
    dataDir,
    secretBox,
    getAuditActor: () => userService.currentActor()
  });
  const credentialService = createCredentialService({
    db,
    secretBox,
    writeClipboard: (value) => clipboard.push(value)
  });
  const syncService = createCloudSyncService({
    db,
    dataDir,
    secretBox,
    userService,
    profileService,
    credentialService,
    cloudClient: createCloudClient(cloud)
  });
  return { dataDir, db, userService, profileService, credentialService, syncService, clipboard };
}

describe('cloud sync service', () => {
  it('requires cloud login before local environments, credentials, and audit are available', async () => {
    const cloud = createCloudApiService({
      store: createMemoryCloudStore(),
      objects: createMemoryObjectStorage(),
      tokenSecret: 'test-token-secret'
    });
    await cloud.bootstrapTeam({
      teamName: 'Acme Ops',
      adminEmail: 'admin@example.test',
      adminPassword: 'AdminPass123!',
      adminDisplayName: '管理员',
      teamKey: createTeamSyncKey()
    });
    const first = createHarness(cloud);

    expect(first.userService.status()).toMatchObject({
      bootstrapped: true,
      authenticated: false,
      mode: 'cloud'
    });
    expect(() => first.userService.requireAuthenticated()).toThrow('请先登录云账号');

    const status = await first.userService.login({
      email: 'admin@example.test',
      password: 'AdminPass123!'
    });

    expect(status).toMatchObject({
      authenticated: true,
      currentUser: { email: 'admin@example.test', displayName: '管理员', role: 'admin' },
      currentTeam: { name: 'Acme Ops' },
      currentDevice: { name: 'test-device' }
    });
    first.db.close();
  });

  it('migrates confirmed local data and restores the same team workspace on another device', async () => {
    const cloud = createCloudApiService({
      store: createMemoryCloudStore(),
      objects: createMemoryObjectStorage(),
      tokenSecret: 'test-token-secret'
    });
    await cloud.bootstrapTeam({
      teamName: 'Acme Ops',
      adminEmail: 'admin@example.test',
      adminPassword: 'AdminPass123!',
      adminDisplayName: '管理员',
      teamKey: createTeamSyncKey()
    });
    const first = createHarness(cloud);
    await first.userService.login({
      email: 'admin@example.test',
      password: 'AdminPass123!'
    });
    const profile = first.profileService.createProfile({
      name: '跨设备环境',
      owner: '运营负责人',
      notes: '需要跨设备同步',
      groupName: '团队 A',
      tags: ['同步'],
      fingerprintPolicy: DEFAULT_FINGERPRINT_POLICY,
      proxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'proxy-user',
        password: 'proxy-password'
      }
    });
    first.credentialService.createCredential({
      profileId: profile.id,
      title: '后台账号',
      websiteUrl: 'https://console.example.test/login',
      username: 'operator@example.test',
      password: 'credential-password'
    });
    first.profileService.recordAudit(profile.id, 'PROFILE_UPDATED', {
      note: 'migrated after explicit confirmation'
    });

    expect(await first.syncService.status()).toMatchObject({
      authenticated: true,
      hasLocalDataToMigrate: true
    });
    const migrated = await first.syncService.migrateLocalData();
    expect(migrated).toMatchObject({
      migratedProfiles: 1,
      migratedCredentials: 1,
      migratedAuditEvents: 3
    });

    const second = createHarness(cloud);
    await second.userService.login({
      email: 'admin@example.test',
      password: 'AdminPass123!'
    });
    const pulled = await second.syncService.pullWorkspace();

    expect(pulled).toMatchObject({
      profiles: 1,
      credentials: 1,
      auditEvents: 3
    });
    expect(second.profileService.listProfiles()[0]).toMatchObject({
      name: '跨设备环境',
      owner: '运营负责人',
      groupName: '团队 A',
      proxy: {
        host: '127.0.0.1',
        username: 'proxy-user'
      }
    });
    const restoredCredential = second.credentialService.listCredentials()[0];
    expect(restoredCredential).toMatchObject({
      title: '后台账号',
      username: 'operator@example.test',
      profileName: '跨设备环境'
    });
    second.credentialService.copyPassword(restoredCredential.id);
    expect(second.clipboard).toEqual(['credential-password']);
    expect(JSON.stringify((cloud as { dumpForTesting: () => unknown }).dumpForTesting())).not.toContain('credential-password');
    expect(JSON.stringify((cloud as { dumpForTesting: () => unknown }).dumpForTesting())).not.toContain('proxy-password');

    first.db.close();
    second.db.close();
  });
});
