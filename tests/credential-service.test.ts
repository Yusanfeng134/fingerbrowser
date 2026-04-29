import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialService } from '../src/main/domain/credential-service';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createProfileService } from '../src/main/domain/profile-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-credential-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const secretBox = createNodeSecretBox('credential-test-master-key');
  const clipboardWrites: string[] = [];
  const profileService = createProfileService({ db, dataDir, secretBox });
  const credentialService = createCredentialService({
    db,
    secretBox,
    writeClipboard: (value) => clipboardWrites.push(value)
  });
  return {
    db,
    profileService,
    credentialService,
    clipboardWrites
  };
}

describe('credential service', () => {
  it('stores encrypted global credentials and filters by optional profile binding', () => {
    const { db, profileService, credentialService } = createHarness();
    const firstProfile = profileService.createProfile({ name: '环境 A' });
    const secondProfile = profileService.createProfile({ name: '环境 B' });

    const firstCredential = credentialService.createCredential({
      profileId: firstProfile.id,
      title: 'Acme Admin',
      websiteUrl: 'https://admin.acme.test',
      username: 'alice',
      password: 'plain-password'
    });
    credentialService.createCredential({
      profileId: secondProfile.id,
      title: 'Acme Admin',
      websiteUrl: 'https://admin.acme.test',
      username: 'bob',
      password: 'second-secret'
    });
    credentialService.createCredential({
      profileId: null,
      title: 'Shared Mail',
      websiteUrl: 'https://mail.acme.test',
      username: 'shared',
      password: 'shared-secret'
    });

    const stored = db.prepare('select encrypted_password from credentials where id = ?').get(firstCredential.id) as {
      encrypted_password: string;
    };
    const firstList = credentialService.listCredentials({ profileId: firstProfile.id });
    const globalList = credentialService.listCredentials();
    const unboundList = credentialService.listCredentials({ binding: 'unbound' });

    expect(stored.encrypted_password).not.toContain('plain-password');
    expect(stored.encrypted_password).toMatch(/^v1:/);
    expect(firstList).toHaveLength(1);
    expect(firstList[0]).toMatchObject({
      profileId: firstProfile.id,
      profileName: '环境 A',
      title: 'Acme Admin',
      websiteUrl: 'https://admin.acme.test',
      username: 'alice'
    });
    expect(globalList).toHaveLength(3);
    expect(unboundList).toHaveLength(1);
    expect(unboundList[0]).toMatchObject({
      profileId: null,
      profileName: null,
      title: 'Shared Mail'
    });
    expect(JSON.stringify(firstList)).not.toContain('plain-password');
    expect(JSON.stringify(firstList)).not.toContain('encryptedPassword');
    expect(credentialService.listCredentials({ binding: 'bound' })).toHaveLength(2);
    expect(credentialService.countCredentials()).toBe(3);
  });

  it('updates metadata without replacing the password when the password is blank', () => {
    const { db, profileService, credentialService, clipboardWrites } = createHarness();
    const profile = profileService.createProfile({ name: '环境 A' });
    const credential = credentialService.createCredential({
      profileId: null,
      title: 'Portal',
      websiteUrl: 'https://portal.test',
      username: 'alice',
      password: 'original-secret'
    });
    const before = db.prepare('select encrypted_password from credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
    };

    credentialService.updateCredential({
      id: credential.id,
      profileId: profile.id,
      title: 'Portal Ops',
      websiteUrl: 'https://portal.test/login',
      username: 'ops',
      password: ''
    });
    credentialService.copyPassword(credential.id);

    const after = db.prepare('select encrypted_password from credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
    };
    const list = credentialService.listCredentials({ profileId: profile.id });

    expect(after.encrypted_password).toBe(before.encrypted_password);
    expect(clipboardWrites).toEqual(['original-secret']);
    expect(list[0]).toMatchObject({
      profileId: profile.id,
      profileName: '环境 A',
      title: 'Portal Ops',
      username: 'ops',
      websiteUrl: 'https://portal.test/login'
    });
  });

  it('copies usernames and passwords without returning plaintext to the caller', () => {
    const { profileService, credentialService, clipboardWrites } = createHarness();
    const profile = profileService.createProfile({ name: '环境 A' });
    const credential = credentialService.createCredential({
      profileId: profile.id,
      title: 'Console',
      websiteUrl: 'https://console.test',
      username: 'operator',
      password: 'copy-secret'
    });

    const usernameResult = credentialService.copyUsername(credential.id);
    const passwordResult = credentialService.copyPassword(credential.id);

    expect(clipboardWrites).toEqual(['operator', 'copy-secret']);
    expect(JSON.stringify(usernameResult)).not.toContain('operator');
    expect(JSON.stringify(passwordResult)).not.toContain('copy-secret');
    expect(passwordResult.copiedAt).toBeTruthy();
  });

  it('reveals a password without copying it or updating the copied timestamp', () => {
    const { db, profileService, credentialService, clipboardWrites } = createHarness();
    const profile = profileService.createProfile({ name: '环境 A' });
    const credential = credentialService.createCredential({
      profileId: profile.id,
      title: 'Console',
      websiteUrl: 'https://console.test',
      username: 'operator',
      password: 'view-secret'
    });
    const before = db.prepare('select encrypted_password, last_copied_at from credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
      last_copied_at: string | null;
    };

    const revealResult = credentialService.revealPassword(credential.id);
    const after = db.prepare('select encrypted_password, last_copied_at from credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
      last_copied_at: string | null;
    };

    expect(revealResult).toMatchObject({
      id: credential.id,
      profileId: profile.id,
      password: 'view-secret'
    });
    expect(revealResult.revealedAt).toBeTruthy();
    expect(clipboardWrites).toEqual([]);
    expect(after.encrypted_password).toBe(before.encrypted_password);
    expect(after.last_copied_at).toBe(before.last_copied_at);
    expect(JSON.stringify(credentialService.listCredentials({ profileId: profile.id }))).not.toContain('view-secret');
  });

  it('deletes credentials and rejects later copy attempts', () => {
    const { profileService, credentialService } = createHarness();
    const profile = profileService.createProfile({ name: '环境 A' });
    const credential = credentialService.createCredential({
      profileId: profile.id,
      title: 'Console',
      websiteUrl: 'https://console.test',
      username: 'operator',
      password: 'copy-secret'
    });

    credentialService.deleteCredential(credential.id);

    expect(credentialService.listCredentials({ profileId: profile.id })).toEqual([]);
    expect(() => credentialService.copyPassword(credential.id)).toThrow('密码项不存在');
  });

  it('migrates legacy profile credentials into the global credentials table idempotently', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-credential-migration-'));
    tempDirs.push(dataDir);
    const dbPath = path.join(dataDir, 'app.sqlite');
    let db = openApplicationDatabase(dbPath);
    const profileService = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('migration-key')
    });
    const profile = profileService.createProfile({ name: '迁移环境' });
    db.prepare(
      `insert into profile_credentials (
        id, profile_id, title, website_url, username, encrypted_password, created_at, updated_at, last_copied_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'legacy-credential-id',
      profile.id,
      'Legacy Admin',
      'https://legacy.test',
      'legacy-user',
      'v1:legacy:encrypted:value',
      '2026-04-29T08:00:00.000Z',
      '2026-04-29T08:00:00.000Z',
      null
    );
    db.close();

    db = openApplicationDatabase(dbPath);
    db.close();
    db = openApplicationDatabase(dbPath);
    const migratedRows = db.prepare('select * from credentials where id = ?').all('legacy-credential-id');

    expect(migratedRows).toHaveLength(1);
    expect(migratedRows[0]).toMatchObject({
      profile_id: profile.id,
      title: 'Legacy Admin',
      username: 'legacy-user'
    });
    db.close();
  });
});
