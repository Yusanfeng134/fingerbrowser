import { app, dialog, ipcMain, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type {
  ActivateLicenseInput,
  BootstrapUserInput,
  CreateProxyPoolEntryInput,
  CreateUserInput,
  CreateCredentialInput,
  FeedbackPackageInput,
  CreateProfileFromTemplateInput,
  CreateProfileInput,
  CreateProfileTemplateFromProfileInput,
  DuplicateProfileInput,
  CreateDesktopFolderFromShortcutsInput,
  CreateDesktopFolderInput,
  ListCredentialsInput,
  LoginInput,
  MoveDesktopShortcutInput,
  ProfileDetails,
  ProxyConnectionInput,
  ProxyTestResult,
  ReorderDesktopFolderShortcutsInput,
  ReorderDesktopItemsInput,
  UpdateCredentialInput,
  UpdateProxyPoolEntryInput,
  UpdateUserInput,
  UpdateProfileInput
} from '../shared/types';
import { exportAuditEvents, exportProfiles, packageSupportLogs } from './domain/commercial-ops';
import type { ApplicationServices } from './services';
import { testProxyConnection } from './domain/proxy';
import { checkForUpdates, RELEASES_PAGE_URL } from './domain/release';
import { writeCredentialSafetyLabPage } from './domain/security-lab';
import { detectLocalProxyPorts, detectMacSystemProxy } from './domain/system-proxy';

export function registerIpcHandlers(services: ApplicationServices): void {
  const handleAuthenticated = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, (event, ...args) => {
      services.userService.requireAuthenticated();
      return listener(event, ...args);
    });
  };

  ipcMain.handle('auth.status', () => services.userService.status());

  ipcMain.handle('auth.bootstrap', (_event, input: BootstrapUserInput) => {
    const status = services.userService.bootstrap(input);
    services.profileService.recordAudit(null, 'USER_BOOTSTRAPPED', {
      userId: status.currentUser?.id,
      email: status.currentUser?.email,
      role: status.currentUser?.role
    });
    return status;
  });

  ipcMain.handle('auth.login', (_event, input: LoginInput) => {
    const status = services.userService.login(input);
    services.profileService.recordAudit(null, 'USER_LOGGED_IN', {
      userId: status.currentUser?.id,
      email: status.currentUser?.email
    });
    return status;
  });

  ipcMain.handle('auth.logout', () => {
    const user = services.userService.requireAuthenticated();
    services.profileService.recordAudit(null, 'USER_LOGGED_OUT', {
      userId: user.id,
      email: user.email
    });
    return services.userService.logout();
  });

  handleAuthenticated('users.list', () => services.userService.listUsers());

  handleAuthenticated('users.create', (_event, input: CreateUserInput) => {
    const user = services.userService.createUser(input);
    services.profileService.recordAudit(null, 'USER_CREATED', {
      userId: user.id,
      email: user.email,
      role: user.role
    });
    return user;
  });

  handleAuthenticated('users.update', (_event, input: UpdateUserInput) => {
    const user = services.userService.updateUser(input);
    services.profileService.recordAudit(null, 'USER_UPDATED', {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status
    });
    return user;
  });

  handleAuthenticated('profiles.list', () => services.profileService.listProfiles());

  handleAuthenticated('profiles.create', (_event, input: CreateProfileInput) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, 1);
    const profile = services.profileService.createProfile(input);
    services.trialService.incrementMetric('profileCreateCount');
    return profile;
  });

  handleAuthenticated('profiles.bulkCreate', (_event, inputs: CreateProfileInput[]) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, inputs.length);
    return inputs.map((input) => {
      const profile = services.profileService.createProfile(input);
      services.trialService.incrementMetric('profileCreateCount');
      return profile;
    });
  });

  handleAuthenticated('profiles.duplicate', (_event, input: DuplicateProfileInput) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, 1);
    const profile = services.profileService.duplicateProfile(input);
    services.trialService.incrementMetric('profileCreateCount');
    return profile;
  });

  handleAuthenticated('profiles.update', (_event, input: UpdateProfileInput) => services.profileService.updateProfile(input));

  handleAuthenticated('profileTemplates.list', () => services.profileService.listProfileTemplates());

  handleAuthenticated('profileTemplates.createFromProfile', (_event, input: CreateProfileTemplateFromProfileInput) => {
    return services.profileService.createTemplateFromProfile(input);
  });

  handleAuthenticated('profileTemplates.createProfile', (_event, input: CreateProfileFromTemplateInput) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, 1);
    const profile = services.profileService.createProfileFromTemplate(input);
    services.trialService.incrementMetric('profileCreateCount');
    return profile;
  });

  handleAuthenticated('profileTemplates.delete', (_event, id: string) => {
    services.profileService.deleteProfileTemplate(id);
    return { id };
  });

  handleAuthenticated('profiles.export', async () => {
    const filePath = exportProfiles(services.profileService.listProfiles(), path.join(services.dataDir, 'exports'));
    services.profileService.recordAudit(null, 'PROFILES_EXPORTED', { filePath });
    return { filePath };
  });

  handleAuthenticated('profiles.launch', async (_event, profileId: string) => {
    return launchProfile(services, profileId);
  });

  handleAuthenticated('desktop.list', () => services.desktopService.listShortcuts());

  handleAuthenticated('desktop.listFolders', () => services.desktopService.listFolders());

  handleAuthenticated('desktop.listItems', () => services.desktopService.listDesktopItems());

  handleAuthenticated('desktop.createShortcut', (_event, input: { profileId: string }) => {
    const shortcut = services.desktopService.createShortcut(input);
    services.profileService.recordAudit(shortcut.profileId, 'DESKTOP_SHORTCUT_CREATED', {
      shortcutId: shortcut.id
    });
    return shortcut;
  });

  handleAuthenticated('desktop.createFolder', (_event, input?: CreateDesktopFolderInput) => {
    const folder = services.desktopService.createFolder(input);
    services.profileService.recordAudit(null, 'DESKTOP_FOLDER_CREATED', {
      folderId: folder.id,
      name: folder.name
    });
    return folder;
  });

  handleAuthenticated('desktop.createFolderFromShortcuts', (_event, input: CreateDesktopFolderFromShortcutsInput) => {
    const folder = services.desktopService.createFolderFromShortcuts(input);
    services.profileService.recordAudit(null, 'DESKTOP_FOLDER_CREATED', {
      folderId: folder.id,
      name: folder.name,
      sourceShortcutId: input.sourceShortcutId,
      targetShortcutId: input.targetShortcutId
    });
    return folder;
  });

  handleAuthenticated('desktop.moveShortcut', (_event, input: MoveDesktopShortcutInput) => {
    const shortcut = services.desktopService.moveShortcut(input);
    services.profileService.recordAudit(shortcut.profileId, 'DESKTOP_SHORTCUT_MOVED', {
      shortcutId: shortcut.id,
      folderId: shortcut.folderId
    });
    return shortcut;
  });

  handleAuthenticated('desktop.reorderItems', (_event, input: ReorderDesktopItemsInput) => {
    return services.desktopService.reorderDesktopItems(input);
  });

  handleAuthenticated('desktop.reorderFolderShortcuts', (_event, input: ReorderDesktopFolderShortcutsInput) => {
    return services.desktopService.reorderFolderShortcuts(input);
  });

  handleAuthenticated('desktop.deleteShortcut', (_event, id: string) => {
    const shortcut = services.desktopService.getShortcut(id);
    services.desktopService.deleteShortcut(id);
    services.profileService.recordAudit(shortcut.profileId, 'DESKTOP_SHORTCUT_DELETED', {
      shortcutId: id
    });
    return { id };
  });

  handleAuthenticated('desktop.deleteFolder', (_event, id: string) => {
    services.desktopService.deleteFolder(id);
    services.profileService.recordAudit(null, 'DESKTOP_FOLDER_DELETED', {
      folderId: id
    });
    return { id };
  });

  handleAuthenticated('desktop.launchShortcut', async (_event, id: string) => {
    const shortcut = services.desktopService.getShortcut(id);
    services.profileService.recordAudit(shortcut.profileId, 'DESKTOP_SHORTCUT_LAUNCHED', {
      shortcutId: id
    });
    return launchProfile(services, shortcut.profileId);
  });

  handleAuthenticated('profiles.stop', async (_event, profileId: string) => {
    const proxyStatus = services.localProxyManager.status(profileId);
    await services.browserController.stop(profileId);
    services.profileService.setProfileStatus(profileId, 'closed');
    if (proxyStatus?.state === 'running') {
      services.profileService.recordAudit(profileId, 'LOCAL_PROXY_STOPPED', {
        listenPort: proxyStatus.listenPort,
        upstreamScheme: proxyStatus.upstreamScheme,
        connectionCount: proxyStatus.connectionCount,
        failureCount: proxyStatus.failureCount
      });
    }
    services.profileService.recordAudit(profileId, 'PROFILE_STOPPED');
    return {
      profileId,
      status: 'closed' as const
    };
  });

  handleAuthenticated('proxy.test', async (_event, input: ProxyConnectionInput & { profileId?: string }) => {
    const profile = input.profileId ? services.profileService.getProfile(input.profileId) : null;
    const result = await testProxyConnection({
      ...input,
      username: input.username || profile?.proxy?.username,
      password:
        input.password ||
        (profile?.proxy?.encryptedPassword ? services.secretBox.decrypt(profile.proxy.encryptedPassword) : undefined)
    });
    if (input.profileId && profile) {
      if (profile.proxyId) {
        services.profileService.setProxyTestStatus(profile.proxyId, result);
        services.localProxyManager.updateExitMetadata(input.profileId, {
          ip: result.ip,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch,
          ...(result.status === 'failed' ? { error: result.message } : {})
        });
        services.profileService.recordAudit(input.profileId, 'PROXY_TESTED', {
          status: result.status,
          host: input.host,
          port: input.port,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch
        });
        if (result.status === 'failed') {
          services.profileService.recordAudit(input.profileId, 'LOCAL_PROXY_ERROR', {
            upstreamScheme: input.scheme,
            host: input.host,
            port: input.port,
            message: result.message
          });
        }
        services.trialService.incrementMetric('proxyTestCount');
      }
    }
    return result;
  });

  handleAuthenticated('proxy.testAll', async () => {
    const profiles = services.profileService.listProfiles().filter((profile) => profile.proxy);
    const results = await Promise.all(
      profiles.map(async (profile) => {
        if (!profile.proxy) {
          throw new Error('代理配置不存在');
        }
        const result = await testProxyConnection({
          scheme: profile.proxy.scheme,
          host: profile.proxy.host,
          port: profile.proxy.port,
          username: profile.proxy.username,
          password: profile.proxy.encryptedPassword ? services.secretBox.decrypt(profile.proxy.encryptedPassword) : undefined,
          expectedTimezone: profile.fingerprintPolicy.timezone,
          timeoutMs: 3000
        });
        services.profileService.setProxyTestStatus(profile.proxy.id, result);
        services.localProxyManager.updateExitMetadata(profile.id, {
          ip: result.ip,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch,
          ...(result.status === 'failed' ? { error: result.message } : {})
        });
        services.profileService.recordAudit(profile.id, 'PROXY_TESTED', {
          status: result.status,
          host: profile.proxy.host,
          port: profile.proxy.port,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch
        });
        if (result.status === 'failed') {
          services.profileService.recordAudit(profile.id, 'LOCAL_PROXY_ERROR', {
            upstreamScheme: profile.proxy.scheme,
            host: profile.proxy.host,
            port: profile.proxy.port,
            message: result.message
          });
        }
        services.trialService.incrementMetric('proxyTestCount');
        return { profileId: profile.id, result };
      })
    );
    return results;
  });

  handleAuthenticated('proxy.localStatus', (_event, profileId?: string) => {
    if (profileId) {
      return [services.localProxyManager.statusOrStopped(profileId)];
    }
    return services.localProxyManager.listStatuses();
  });

  handleAuthenticated('proxy.system', () => detectMacSystemProxy());

  handleAuthenticated('proxy.scanLocal', () => detectLocalProxyPorts());

  handleAuthenticated('proxyPool.list', () => services.proxyPoolService.listEntries());

  handleAuthenticated('proxyPool.create', (_event, input: CreateProxyPoolEntryInput) => {
    const entry = services.proxyPoolService.createEntry(input);
    services.profileService.recordAudit(null, 'PROXY_POOL_CREATED', {
      entryId: entry.id,
      name: entry.name,
      scheme: entry.scheme,
      host: entry.host,
      port: entry.port,
      timezone: entry.timezone
    });
    return entry;
  });

  handleAuthenticated('proxyPool.update', (_event, input: UpdateProxyPoolEntryInput) => {
    const entry = services.proxyPoolService.updateEntry(input);
    services.profileService.recordAudit(null, 'PROXY_POOL_UPDATED', {
      entryId: entry.id,
      name: entry.name,
      scheme: entry.scheme,
      host: entry.host,
      port: entry.port,
      timezone: entry.timezone
    });
    return entry;
  });

  handleAuthenticated('proxyPool.delete', (_event, id: string) => {
    const entry = services.proxyPoolService.deleteEntry(id);
    services.profileService.recordAudit(null, 'PROXY_POOL_DELETED', {
      entryId: entry.id,
      name: entry.name,
      host: entry.host,
      port: entry.port
    });
    return { id };
  });

  handleAuthenticated('proxyPool.test', async (_event, id: string) => {
    const entry = services.proxyPoolService.getEntry(id);
    const proxyInput = services.proxyPoolService.toProfileProxyInput(id);
    const result = await testProxyConnection({
      ...proxyInput,
      expectedTimezone: entry.timezone || undefined,
      timeoutMs: 3000
    });
    const updated = services.proxyPoolService.updateTestResult(id, result);
    services.profileService.recordAudit(null, 'PROXY_POOL_TESTED', {
      entryId: updated.id,
      name: updated.name,
      status: result.status,
      host: updated.host,
      port: updated.port,
      ipTimezone: result.ipTimezone,
      timezoneMatch: result.timezoneMatch
    });
    services.trialService.incrementMetric('proxyTestCount');
    return result;
  });

  handleAuthenticated('proxyPool.applyToProfile', (_event, input: { entryId: string; profileId: string; matchTimezone?: boolean }) => {
    const entry = services.proxyPoolService.getEntry(input.entryId);
    const profile = services.profileService.getProfile(input.profileId);
    const proxy = services.proxyPoolService.toProfileProxyInput(input.entryId);
    const updated = services.profileService.updateProfile({
      id: profile.id,
      name: profile.name,
      groupName: profile.groupName,
      tags: profile.tags,
      fingerprintPolicy:
        input.matchTimezone && entry.timezone
          ? {
              ...profile.fingerprintPolicy,
              timezone: entry.timezone
            }
          : profile.fingerprintPolicy,
      runtimeChannel: profile.runtimeChannel,
      proxy
    });
    services.profileService.recordAudit(profile.id, 'PROXY_POOL_APPLIED', {
      entryId: entry.id,
      name: entry.name,
      host: entry.host,
      port: entry.port,
      matchTimezone: Boolean(input.matchTimezone && entry.timezone)
    });
    return updated;
  });

  handleAuthenticated('audit.list', (_event, profileId?: string) => services.profileService.listAuditEvents(profileId));

  handleAuthenticated('audit.export', async (_event, profileId?: string) => {
    const filePath = exportAuditEvents(services.profileService.listAuditEvents(profileId), path.join(services.dataDir, 'exports'));
    services.profileService.recordAudit(profileId ?? null, 'AUDIT_EXPORTED', { filePath });
    return { filePath };
  });

  handleAuthenticated('chromium.ensureInstalled', async () => {
    const result = await services.chromiumInstaller.ensureInstalled();
    services.profileService.recordAudit(null, 'CHROMIUM_INSTALLED', {
      version: result.version,
      alreadyInstalled: result.alreadyInstalled
    });
    return result;
  });

  handleAuthenticated('kernel.manifest', () => services.kernelRuntimeManager.manifest());

  handleAuthenticated('kernel.status', () => services.kernelRuntimeManager.status());

  handleAuthenticated('kernel.ensureInstalled', async () => {
    const result = await services.kernelRuntimeManager.ensureInstalled();
    services.profileService.recordAudit(null, 'KERNEL_INSTALLED', {
      version: result.manifest.version,
      baseChromiumRevision: result.manifest.baseChromiumRevision,
      patchsetVersion: result.manifest.patchsetVersion,
      alreadyInstalled: result.alreadyInstalled
    });
    return result;
  });

  handleAuthenticated('kernel.importManifest', async (_event, manifestPath?: string) => {
    let selectedPath = manifestPath;
    if (!selectedPath) {
      const result = await dialog.showOpenDialog({
        title: '导入自研内核 manifest',
        properties: ['openFile'],
        filters: [{ name: 'Kernel manifest', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePaths[0]) {
        throw new Error('已取消导入自研内核 manifest');
      }
      selectedPath = result.filePaths[0];
    }
    const status = services.kernelRuntimeManager.importManifest(selectedPath);
    services.profileService.recordAudit(null, 'KERNEL_MANIFEST_IMPORTED', {
      version: status.manifest.version,
      baseChromiumRevision: status.manifest.baseChromiumRevision,
      patchsetVersion: status.manifest.patchsetVersion,
      source: status.source
    });
    return status;
  });

  handleAuthenticated('kernel.clearManifest', () => {
    const previous = services.kernelRuntimeManager.status();
    const status = services.kernelRuntimeManager.clearManifest();
    services.profileService.recordAudit(null, 'KERNEL_MANIFEST_CLEARED', {
      previousVersion: previous.manifest.version,
      source: previous.source
    });
    return status;
  });

  handleAuthenticated('kernel.openRuntimeFolder', async () => {
    const status = services.kernelRuntimeManager.status();
    mkdirSync(status.runtimeRoot, { recursive: true });
    const errorMessage = await shell.openPath(status.runtimeRoot);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    return { folderPath: status.runtimeRoot };
  });

  handleAuthenticated('googleAccount.status', () => services.googleAccountService.status());

  handleAuthenticated('googleAccount.save', (_event, input) => {
    const status = services.googleAccountService.save(input);
    services.profileService.recordAudit(null, 'GOOGLE_ACCOUNT_CONFIG_UPDATED', {
      enabled: status.enabled,
      configured: status.configured
    });
    return status;
  });

  handleAuthenticated('googleAccount.clear', () => {
    const previous = services.googleAccountService.status();
    const status = services.googleAccountService.clear();
    services.profileService.recordAudit(null, 'GOOGLE_ACCOUNT_CONFIG_CLEARED', {
      previouslyEnabled: previous.enabled,
      previouslyConfigured: previous.configured
    });
    return status;
  });

  handleAuthenticated('app.version', () => services.trialService.version());

  handleAuthenticated('release.checkForUpdates', async () => {
    services.trialService.incrementMetric('updateCheckCount');
    const result = await checkForUpdates({
      currentVersion: app.getVersion(),
      fetchJson: async (url) => {
        if (process.env.FINGERBROWSER_E2E === '1') {
          throw new Error('E2E 更新检查模拟失败');
        }
        const response = await fetch(url, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': `fingerbrowser/${app.getVersion()}`
          }
        });
        if (!response.ok) {
          throw new Error(`GitHub API ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      }
    });
    services.profileService.recordAudit(null, 'UPDATE_CHECKED', {
      status: result.status,
      latestVersion: result.latestVersion
    });
    return result;
  });

  handleAuthenticated('release.openLatestRelease', async () => {
    await shell.openExternal(RELEASES_PAGE_URL);
    return { releaseUrl: RELEASES_PAGE_URL };
  });

  async function onboardingStatus() {
    const license = await services.licenseService.status();
    return services.trialService.onboardingStatus({
      license,
      profiles: services.profileService.listProfiles(),
      audits: services.profileService.listAuditEvents(),
      credentialCount: services.credentialService.countCredentials()
    });
  }

  handleAuthenticated('onboarding.status', () => onboardingStatus());

  handleAuthenticated('onboarding.dismiss', async () => {
    services.trialService.dismissOnboarding();
    return onboardingStatus();
  });

  handleAuthenticated('onboarding.reset', async () => {
    services.trialService.resetOnboarding();
    return onboardingStatus();
  });

  handleAuthenticated('trial.metrics', () =>
    services.trialService.metrics({
      profileCount: services.profileService.listProfiles().length,
      credentialCount: services.credentialService.countCredentials()
    })
  );

  handleAuthenticated('feedback.package', async (_event, input: FeedbackPackageInput) => {
    const license = await services.licenseService.redactedStatus();
    services.trialService.incrementMetric('feedbackPackageCount');
    const metrics = services.trialService.metrics({
      profileCount: services.profileService.listProfiles().length,
      credentialCount: services.credentialService.countCredentials()
    });
    const result = services.trialService.packageFeedback({
      input,
      license,
      profiles: services.profileService.listProfiles(),
      audits: services.profileService.listAuditEvents(),
      metrics,
      kernel: services.kernelRuntimeManager.status()
    });
    services.profileService.recordAudit(null, 'FEEDBACK_PACKAGED', { filePath: result.filePath });
    return result;
  });

  handleAuthenticated('securityLab.open', async (_event, profileId: string) => {
    services.licenseService.assertCanUseCredentials();
    const profile = services.profileService.getProfile(profileId);
    const boundCredentialCount = services.credentialService.listCredentials({ profileId: profile.id }).length;
    const result = writeCredentialSafetyLabPage({
      dataDir: services.dataDir,
      profileId: profile.id,
      boundCredentialCount
    });
    const openError = await shell.openPath(result.filePath);
    if (openError) {
      throw new Error(openError);
    }
    services.profileService.recordAudit(profile.id, 'SECURITY_LAB_OPENED', {
      boundCredentialCount: result.boundCredentialCount,
      filePath: result.filePath
    });
    return result;
  });

  handleAuthenticated('credentials.list', (_event, input?: ListCredentialsInput) => {
    services.licenseService.assertCanUseCredentials();
    return services.credentialService.listCredentials(input);
  });

  handleAuthenticated('credentials.create', (_event, input: CreateCredentialInput) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.createCredential(input);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_CREATED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return credential;
  });

  handleAuthenticated('credentials.update', (_event, input: UpdateCredentialInput) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.updateCredential(input);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_UPDATED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return credential;
  });

  handleAuthenticated('credentials.delete', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.deleteCredential(id);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_DELETED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return { id };
  });

  handleAuthenticated('credentials.copyUsername', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.copyUsername(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_USERNAME_COPIED', {
      credentialId: id
    });
    return result;
  });

  handleAuthenticated('credentials.copyPassword', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.copyPassword(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_PASSWORD_COPIED', {
      credentialId: id
    });
    return result;
  });

  handleAuthenticated('credentials.revealPassword', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.revealPassword(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_PASSWORD_REVEALED', {
      credentialId: id
    });
    return result;
  });

  handleAuthenticated('license.activate', async (_event, input: ActivateLicenseInput) => {
    const state = await services.licenseService.activate(input);
    services.trialService.incrementMetric('activationCount');
    services.profileService.recordAudit(null, 'LICENSE_ACTIVATED', {
      status: state.status,
      teamName: state.teamName,
      plan: state.plan.id,
      expiresAt: state.expiresAt
    });
    return services.licenseService.redactedStatus();
  });

  handleAuthenticated('license.status', () => services.licenseService.redactedStatus());

  handleAuthenticated('license.refresh', async () => {
    const state = await services.licenseService.refresh();
    services.profileService.recordAudit(null, 'LICENSE_REFRESHED', {
      status: state.status,
      teamName: state.teamName,
      plan: state.plan.id,
      expiresAt: state.expiresAt
    });
    return services.licenseService.redactedStatus();
  });

  handleAuthenticated('license.deactivate', async () => {
    const state = await services.licenseService.deactivate();
    services.profileService.recordAudit(null, 'LICENSE_DEACTIVATED');
    return state;
  });

  handleAuthenticated('license.usage', async () => {
    const state = await services.licenseService.status();
    return {
      profilesUsed: services.profileService.listProfiles().length,
      profileLimit: state.plan.profileLimit,
      seatsUsed: state.status === 'inactive' ? 0 : 1,
      seatLimit: state.plan.seatLimit
    };
  });

  handleAuthenticated('support.packageLogs', async () => {
    const license = await services.licenseService.redactedStatus();
    const filePath = packageSupportLogs({
      exportDir: path.join(services.dataDir, 'exports'),
      audits: services.profileService.listAuditEvents(),
      profiles: services.profileService.listProfiles(),
      license
    });
    services.profileService.recordAudit(null, 'SUPPORT_LOGS_PACKAGED', { filePath });
    return { filePath };
  });
}

async function launchProfile(services: ApplicationServices, profileId: string) {
  const profile = services.profileService.getProfile(profileId);
  const credentialStartUrls = services.credentialService.listLaunchUrlsForProfile(profileId);
  const proxyDiagnostic = await createLaunchProxyDiagnostic(services, profile);
  const result = await services.browserController.launch(profile, profile.proxy, {
    startUrls: credentialStartUrls,
    proxyDiagnostic,
    googleApiEnvironment: services.googleAccountService.runtimeEnvironment(profile.runtimeChannel)
  });
  services.profileService.setProfileStatus(profileId, 'running');
  if (result.runtimeChannel === 'custom-kernel') {
    services.profileService.recordAudit(profileId, 'KERNEL_POLICY_APPLIED', {
      runtimeChannel: result.runtimeChannel,
      kernelVersion: result.kernelVersion
    });
    services.profileService.recordAudit(profileId, 'KERNEL_LAUNCHED', {
      runtimeChannel: result.runtimeChannel,
      kernelVersion: result.kernelVersion
    });
  }
  if (result.localProxy) {
    services.profileService.recordAudit(profileId, 'LOCAL_PROXY_STARTED', {
      listenHost: result.localProxy.listenHost,
      listenPort: result.localProxy.listenPort,
      upstreamScheme: result.localProxy.upstreamScheme
    });
  }
  services.profileService.recordAudit(profileId, 'PROFILE_LAUNCHED', {
    pid: result.pid,
    runtimeChannel: result.runtimeChannel,
    credentialUrlCount: credentialStartUrls.length,
    localProxyEnabled: Boolean(result.localProxy),
    upstreamScheme: result.localProxy?.upstreamScheme,
    proxyDiagnosticStatus: proxyDiagnostic?.status,
    proxyDiagnosticIpTimezone: proxyDiagnostic?.ipTimezone,
    proxyDiagnosticTimezoneMatch: proxyDiagnostic?.timezoneMatch
  });
  services.trialService.incrementMetric('browserLaunchCount');
  return {
    profileId,
    pid: result.pid,
    runtimeChannel: result.runtimeChannel,
    status: 'running' as const,
    ...(result.localProxy ? { localProxy: result.localProxy } : {})
  };
}

async function createLaunchProxyDiagnostic(
  services: ApplicationServices,
  profile: ProfileDetails
): Promise<ProxyTestResult | null> {
  if (!profile.proxy) {
    return null;
  }

  const result = await safeTestProfileProxy(services, profile);
  services.profileService.setProxyTestStatus(profile.proxy.id, result);
  services.localProxyManager.updateExitMetadata(profile.id, {
    ip: result.ip,
    ipTimezone: result.ipTimezone,
    timezoneMatch: result.timezoneMatch,
    ...(result.status === 'failed' ? { error: result.message } : {})
  });
  return result;
}

async function safeTestProfileProxy(services: ApplicationServices, profile: ProfileDetails): Promise<ProxyTestResult> {
  if (!profile.proxy) {
    return {
      status: 'failed',
      message: '代理配置不存在',
      testedAt: new Date().toISOString()
    };
  }

  try {
    return await testProxyConnection({
      scheme: profile.proxy.scheme,
      host: profile.proxy.host,
      port: profile.proxy.port,
      username: profile.proxy.username,
      password: profile.proxy.encryptedPassword ? services.secretBox.decrypt(profile.proxy.encryptedPassword) : undefined,
      expectedTimezone: profile.fingerprintPolicy.timezone,
      timeoutMs: 3000
    });
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? `代理出口预检测失败：${error.message}` : '代理出口预检测失败：未知错误',
      testedAt: new Date().toISOString()
    };
  }
}
