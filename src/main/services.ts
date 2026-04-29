import { mkdirSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import { app, clipboard, safeStorage } from 'electron';
import { createAppSettingsService, type AppSettingsService } from './domain/app-settings-service';
import { createCredentialService, type CredentialService } from './domain/credential-service';
import { createNodeSecretBox, createSafeStorageSecretBox, type SecretBox } from './domain/encryption';
import { getDeviceFingerprint } from './domain/license';
import { createLicenseService, type LicenseService } from './domain/license-service';
import { RELEASES_PAGE_URL } from './domain/release';
import { createTrialService, type TrialService } from './domain/trial-service';
import { createProfileService, type ProfileService } from './domain/profile-service';
import {
  createKernelRuntimeManager,
  createMockKernelRuntimeManager,
  type KernelRuntimeManager
} from './domain/kernel-runtime';
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
  appSettingsService: AppSettingsService;
  profileService: ProfileService;
  credentialService: CredentialService;
  licenseService: LicenseService;
  trialService: TrialService;
  chromiumInstaller: ChromiumInstaller;
  kernelRuntimeManager: KernelRuntimeManager;
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
  const appSettingsService = createAppSettingsService({ db });
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
  const trialService = createTrialService({
    db,
    exportDir: path.join(dataDir, 'exports'),
    version: {
      version: app.getVersion(),
      channel: 'trial',
      releaseUrl: RELEASES_PAGE_URL
    }
  });
  const chromiumInstaller = isE2E
    ? createMockChromiumInstaller()
    : createChromiumInstaller(path.join(dataDir, 'chromium'));
  const kernelRuntimeManager = isE2E
    ? createMockKernelRuntimeManager(process.execPath)
    : createKernelRuntimeManager({
        dataDir,
        settings: appSettingsService,
        environmentManifestPath: process.env.FINGERBROWSER_KERNEL_MANIFEST
      });
  const browserController = createBrowserController({
    chromiumInstaller,
    kernelRuntimeManager,
    dataDir,
    secretBox,
    isE2E
  });

  return {
    dataDir,
    secretBox,
    appSettingsService,
    profileService,
    credentialService,
    licenseService,
    trialService,
    chromiumInstaller,
    kernelRuntimeManager,
    browserController
  };
}
