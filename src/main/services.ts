import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import { app, clipboard, safeStorage } from 'electron';
import { createAppSettingsService, type AppSettingsService } from './domain/app-settings-service';
import { createCredentialService, type CredentialService } from './domain/credential-service';
import { createDesktopService, type DesktopService } from './domain/desktop-service';
import { createNodeSecretBox, createSafeStorageSecretBox, type SecretBox } from './domain/encryption';
import { createGoogleAccountService, type GoogleAccountService } from './domain/google-account-service';
import { getDeviceFingerprint } from './domain/license';
import { createLicenseService, type LicenseService } from './domain/license-service';
import { RELEASES_PAGE_URL } from './domain/release';
import { createTrialService, type TrialService } from './domain/trial-service';
import { createProfileService, type ProfileService } from './domain/profile-service';
import { createUserService, type UserService } from './domain/user-service';
import { createProxyPoolService, type ProxyPoolService } from './domain/proxy-pool-service';
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
import { LocalProxyManager } from './domain/local-proxy';
import { createLocalApiServer, createLocalApiToken, type LocalApiServer } from './domain/local-api';
import { launchProfileRuntime, stopProfileRuntime } from './domain/profile-runtime';

export interface ApplicationServices {
  dataDir: string;
  localApiTokenPath: string | null;
  secretBox: SecretBox;
  appSettingsService: AppSettingsService;
  userService: UserService;
  profileService: ProfileService;
  proxyPoolService: ProxyPoolService;
  desktopService: DesktopService;
  credentialService: CredentialService;
  licenseService: LicenseService;
  googleAccountService: GoogleAccountService;
  trialService: TrialService;
  chromiumInstaller: ChromiumInstaller;
  kernelRuntimeManager: KernelRuntimeManager;
  localProxyManager: LocalProxyManager;
  localApiServer: LocalApiServer;
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
  const userService = createUserService({ db });
  const profileService = createProfileService({
    db,
    dataDir,
    secretBox,
    getAuditActor: () => userService.currentActor()
  });
  const proxyPoolService = createProxyPoolService({ db, secretBox });
  const desktopService = createDesktopService({ db });
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
  const googleAccountService = createGoogleAccountService({
    settings: appSettingsService,
    secretBox
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
  const localProxyManager = new LocalProxyManager();
  const browserController = createBrowserController({
    chromiumInstaller,
    kernelRuntimeManager,
    localProxyManager,
    dataDir,
    secretBox,
    isE2E
  });
  const localApiToken = resolveLocalApiToken(dataDir);
  const localApiPort = normalizeLocalApiPort(process.env.FINGERBROWSER_LOCAL_API_PORT, isE2E);
  const localApiServer = createLocalApiServer({
    host: '127.0.0.1',
    port: localApiPort,
    token: localApiToken.token,
    version: () => trialService.version(),
    authStatus: () => userService.status(),
    listProfiles: () => {
      userService.requireAuthenticated();
      return profileService.listProfiles();
    },
    getProfile: (profileId) => {
      userService.requireAuthenticated();
      return profileService.getProfile(profileId);
    },
    launchProfile: async (profileId) => {
      userService.requireAuthenticated();
      return launchProfileRuntime(services, profileId);
    },
    stopProfile: async (profileId) => {
      userService.requireAuthenticated();
      return stopProfileRuntime(services, profileId);
    },
    listAuditEvents: (profileId) => {
      userService.requireAuthenticated();
      return profileService.listAuditEvents(profileId);
    },
    localProxyStatus: (profileId) => {
      userService.requireAuthenticated();
      return profileId ? [localProxyManager.statusOrStopped(profileId)] : localProxyManager.listStatuses();
    }
  });

  const services: ApplicationServices = {
    dataDir,
    localApiTokenPath: localApiToken.filePath,
    secretBox,
    appSettingsService,
    userService,
    profileService,
    proxyPoolService,
    desktopService,
    credentialService,
    licenseService,
    googleAccountService,
    trialService,
    chromiumInstaller,
    kernelRuntimeManager,
    localProxyManager,
    localApiServer,
    browserController
  };

  return services;
}

function resolveLocalApiToken(dataDir: string): { token: string; filePath: string | null } {
  const environmentToken = process.env.FINGERBROWSER_LOCAL_API_TOKEN?.trim();
  if (environmentToken) {
    return { token: environmentToken, filePath: null };
  }

  const filePath = path.join(dataDir, 'local-api.key');
  if (existsSync(filePath)) {
    const token = readFileSync(filePath, 'utf8').trim();
    if (token) {
      return { token, filePath };
    }
  }

  const token = createLocalApiToken();
  writeFileSync(filePath, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
  return { token, filePath };
}

function normalizeLocalApiPort(value: string | undefined, isE2E: boolean): number {
  if (!value && isE2E) {
    return 0;
  }
  const parsed = Number(value ?? '17345');
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return 17345;
  }
  return parsed;
}
