import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopService } from '../src/main/domain/desktop-service';
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
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-desktop-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const secretBox = createNodeSecretBox('desktop-test-master-key');
  const profileService = createProfileService({ db, dataDir, secretBox });
  const desktopService = createDesktopService({ db });
  return { desktopService, profileService };
}

describe('desktop service', () => {
  it('creates one shortcut per profile and returns launch-ready metadata', () => {
    const { desktopService, profileService } = createHarness();
    const profile = profileService.createProfile({
      name: '芝加哥运营环境',
      tags: ['试卖']
    });

    const shortcut = desktopService.createShortcut({ profileId: profile.id });
    const duplicate = desktopService.createShortcut({ profileId: profile.id });
    const shortcuts = desktopService.listShortcuts();

    expect(duplicate.id).toBe(shortcut.id);
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0]).toMatchObject({
      id: shortcut.id,
      profileId: profile.id,
      label: '芝加哥运营环境',
      profileStatus: 'closed',
      runtimeChannel: 'official'
    });
    expect(shortcuts[0].iconVariant).toBeTruthy();
  });

  it('deletes shortcuts without deleting the bound profile', () => {
    const { desktopService, profileService } = createHarness();
    const profile = profileService.createProfile({ name: '客户支持环境' });
    const shortcut = desktopService.createShortcut({ profileId: profile.id });

    desktopService.deleteShortcut(shortcut.id);

    expect(desktopService.listShortcuts()).toEqual([]);
    expect(profileService.getProfile(profile.id).name).toBe('客户支持环境');
  });

  it('rejects shortcuts for missing profiles', () => {
    const { desktopService } = createHarness();

    expect(() => desktopService.createShortcut({ profileId: 'missing-profile' })).toThrow('浏览器环境不存在');
  });
});
