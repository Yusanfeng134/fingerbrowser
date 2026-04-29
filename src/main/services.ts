import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { createNodeSecretBox, createSafeStorageSecretBox, type SecretBox } from './domain/encryption';
import { createProfileService, type ProfileService } from './domain/profile-service';
import { openApplicationDatabase } from './infrastructure/database';
import {
  createChromiumInstaller,
  createMockChromiumInstaller,
  type ChromiumInstaller
} from './infrastructure/chromium-installer';
import { createBrowserController } from './infrastructure/browser-runtime';
import type { BrowserController } from './domain/chromium';

export interface ApplicationServices {
  dataDir: string;
  secretBox: SecretBox;
  profileService: ProfileService;
  chromiumInstaller: ChromiumInstaller;
  browserController: BrowserController;
}

export function createApplicationServices(): ApplicationServices {
  const isE2E = process.env.FINGERBROWSER_E2E === '1';
  const dataDir = process.env.FINGERBROWSER_DATA_DIR ?? path.join(app.getPath('userData'), 'data');
  mkdirSync(dataDir, { recursive: true });

  const secretBox =
    !isE2E && safeStorage.isEncryptionAvailable()
      ? createSafeStorageSecretBox(safeStorage)
      : createNodeSecretBox(`fingerbrowser:${dataDir}`);
  const db = openApplicationDatabase(path.join(dataDir, 'fingerbrowser.sqlite'));
  const profileService = createProfileService({
    db,
    dataDir,
    secretBox
  });
  const chromiumInstaller = isE2E
    ? createMockChromiumInstaller()
    : createChromiumInstaller(path.join(dataDir, 'chromium'));
  const browserController = createBrowserController({
    chromiumInstaller,
    dataDir,
    secretBox,
    isE2E
  });

  return {
    dataDir,
    secretBox,
    profileService,
    chromiumInstaller,
    browserController
  };
}
