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

  it('creates a folder from two shortcuts and keeps them inside the folder', () => {
    const { desktopService, profileService } = createHarness();
    const first = profileService.createProfile({ name: '账号 1' });
    const second = profileService.createProfile({ name: '账号 2' });
    const firstShortcut = desktopService.createShortcut({ profileId: first.id });
    const secondShortcut = desktopService.createShortcut({ profileId: second.id });

    const folder = desktopService.createFolderFromShortcuts({
      sourceShortcutId: firstShortcut.id,
      targetShortcutId: secondShortcut.id
    });
    const folders = desktopService.listFolders();
    const shortcuts = desktopService.listShortcuts();

    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({
      id: folder.id,
      name: '新建文件夹',
      shortcutCount: 2
    });
    expect(shortcuts.map((shortcut) => shortcut.folderId)).toEqual([folder.id, folder.id]);
    expect(shortcuts.map((shortcut) => shortcut.folderName)).toEqual(['新建文件夹', '新建文件夹']);
  });

  it('moves shortcuts into and out of folders and supports scoped ordering', () => {
    const { desktopService, profileService } = createHarness();
    const first = profileService.createProfile({ name: '环境 A' });
    const second = profileService.createProfile({ name: '环境 B' });
    const third = profileService.createProfile({ name: '环境 C' });
    const firstShortcut = desktopService.createShortcut({ profileId: first.id });
    const secondShortcut = desktopService.createShortcut({ profileId: second.id });
    const thirdShortcut = desktopService.createShortcut({ profileId: third.id });
    const folder = desktopService.createFolder({ name: '客户组' });

    desktopService.moveShortcut({ shortcutId: firstShortcut.id, folderId: folder.id });
    desktopService.moveShortcut({ shortcutId: secondShortcut.id, folderId: folder.id });
    desktopService.reorderFolderShortcuts({
      folderId: folder.id,
      shortcutIds: [secondShortcut.id, firstShortcut.id]
    });
    desktopService.moveShortcut({ shortcutId: firstShortcut.id, folderId: null });
    desktopService.reorderDesktopItems({
      items: [
        { type: 'shortcut', id: thirdShortcut.id },
        { type: 'folder', id: folder.id },
        { type: 'shortcut', id: firstShortcut.id }
      ]
    });

    const shortcuts = desktopService.listShortcuts();
    const topItems = desktopService.listDesktopItems();
    const folderShortcuts = shortcuts.filter((shortcut) => shortcut.folderId === folder.id);

    expect(folderShortcuts.map((shortcut) => shortcut.id)).toEqual([secondShortcut.id]);
    expect(shortcuts.find((shortcut) => shortcut.id === firstShortcut.id)?.folderId).toBeNull();
    expect(topItems.map((item) => `${item.type}:${item.id}`)).toEqual([
      `shortcut:${thirdShortcut.id}`,
      `folder:${folder.id}`,
      `shortcut:${firstShortcut.id}`
    ]);
  });
});
