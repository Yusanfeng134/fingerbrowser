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
  it('stores encrypted profile-scoped credentials and returns redacted entries', () => {
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

    const stored = db.prepare('select encrypted_password from profile_credentials where id = ?').get(firstCredential.id) as {
      encrypted_password: string;
    };
    const firstList = credentialService.listCredentials(firstProfile.id);

    expect(stored.encrypted_password).not.toContain('plain-password');
    expect(stored.encrypted_password).toMatch(/^v1:/);
    expect(firstList).toHaveLength(1);
    expect(firstList[0]).toMatchObject({
      profileId: firstProfile.id,
      title: 'Acme Admin',
      websiteUrl: 'https://admin.acme.test',
      username: 'alice'
    });
    expect(JSON.stringify(firstList)).not.toContain('plain-password');
    expect(JSON.stringify(firstList)).not.toContain('encryptedPassword');
  });

  it('updates metadata without replacing the password when the password is blank', () => {
    const { db, profileService, credentialService, clipboardWrites } = createHarness();
    const profile = profileService.createProfile({ name: '环境 A' });
    const credential = credentialService.createCredential({
      profileId: profile.id,
      title: 'Portal',
      websiteUrl: 'https://portal.test',
      username: 'alice',
      password: 'original-secret'
    });
    const before = db.prepare('select encrypted_password from profile_credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
    };

    credentialService.updateCredential({
      id: credential.id,
      title: 'Portal Ops',
      websiteUrl: 'https://portal.test/login',
      username: 'ops',
      password: ''
    });
    credentialService.copyPassword(credential.id);

    const after = db.prepare('select encrypted_password from profile_credentials where id = ?').get(credential.id) as {
      encrypted_password: string;
    };
    const list = credentialService.listCredentials(profile.id);

    expect(after.encrypted_password).toBe(before.encrypted_password);
    expect(clipboardWrites).toEqual(['original-secret']);
    expect(list[0]).toMatchObject({
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

    expect(credentialService.listCredentials(profile.id)).toEqual([]);
    expect(() => credentialService.copyPassword(credential.id)).toThrow('密码项不存在');
  });
});
