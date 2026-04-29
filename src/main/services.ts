import { mkdirSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import { app, clipboard, safeStorage } from 'electron';
import { createCredentialService, type CredentialService } from './domain/credential-service';
import { createNodeSecretBox, createSafeStorageSecretBox, type SecretBox } from './domain/encryption';
import { getDeviceFingerprint } from './domain/license';
import { createLicenseService, type LicenseService } from './domain/license-service';
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
  credentialService: CredentialService;
  licenseService: LicenseService;
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
  const credentialService = createCredentialService({
    db,
    secretBox,
    writeClipboard: (value) => clipboard.writeText(value)
  });
  const deviceSeed = `${process.platform}:${hostname()}:${userInfo().username}:${app.getPath('userData')}`;
  const licenseService = createLicenseService({
    db,
    secretBox,
    signingSecret: process.env.FINGERBROWSER_LICENSE_SIGNING_SECRET ?? 'fingerbrowser-commercial-trial-dev-secret',
    deviceId: getDeviceFingerprint(deviceSeed)
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
    credentialService,
    licenseService,
    chromiumInstaller,
    browserController
  };
}
