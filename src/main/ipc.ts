import { app, dialog, ipcMain, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type {
  ActivateLicenseInput,
  CreateCredentialInput,
  FeedbackPackageInput,
  CreateProfileInput,
  ListCredentialsInput,
  ProxyConnectionInput,
  UpdateCredentialInput,
  UpdateProfileInput
} from '../shared/types';
import { exportAuditEvents, exportProfiles, packageSupportLogs } from './domain/commercial-ops';
import type { ApplicationServices } from './services';
import { testProxyConnection } from './domain/proxy';
import { checkForUpdates, RELEASES_PAGE_URL } from './domain/release';

export function registerIpcHandlers(services: ApplicationServices): void {
  ipcMain.handle('profiles.list', () => services.profileService.listProfiles());

  ipcMain.handle('profiles.create', (_event, input: CreateProfileInput) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, 1);
    const profile = services.profileService.createProfile(input);
    services.trialService.incrementMetric('profileCreateCount');
    return profile;
  });

  ipcMain.handle('profiles.bulkCreate', (_event, inputs: CreateProfileInput[]) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, inputs.length);
    return inputs.map((input) => {
      const profile = services.profileService.createProfile(input);
      services.trialService.incrementMetric('profileCreateCount');
      return profile;
    });
  });

  ipcMain.handle('profiles.update', (_event, input: UpdateProfileInput) => services.profileService.updateProfile(input));

  ipcMain.handle('profiles.export', async () => {
    const filePath = exportProfiles(services.profileService.listProfiles(), path.join(services.dataDir, 'exports'));
    services.profileService.recordAudit(null, 'PROFILES_EXPORTED', { filePath });
    return { filePath };
  });

  ipcMain.handle('profiles.launch', async (_event, profileId: string) => {
    const profile = services.profileService.getProfile(profileId);
    const credentialStartUrls = services.credentialService.listLaunchUrlsForProfile(profileId);
    const result = await services.browserController.launch(profile, profile.proxy, {
      startUrls: credentialStartUrls
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
    services.profileService.recordAudit(profileId, 'PROFILE_LAUNCHED', {
      pid: result.pid,
      runtimeChannel: result.runtimeChannel,
      credentialUrlCount: credentialStartUrls.length
    });
    services.trialService.incrementMetric('browserLaunchCount');
    return {
      profileId,
      pid: result.pid,
      runtimeChannel: result.runtimeChannel,
      status: 'running' as const
    };
  });

  ipcMain.handle('profiles.stop', async (_event, profileId: string) => {
    await services.browserController.stop(profileId);
    services.profileService.setProfileStatus(profileId, 'closed');
    services.profileService.recordAudit(profileId, 'PROFILE_STOPPED');
    return {
      profileId,
      status: 'closed' as const
    };
  });

  ipcMain.handle('proxy.test', async (_event, input: ProxyConnectionInput & { profileId?: string }) => {
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
        services.profileService.recordAudit(input.profileId, 'PROXY_TESTED', {
          status: result.status,
          host: input.host,
          port: input.port,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch
        });
        services.trialService.incrementMetric('proxyTestCount');
      }
    }
    return result;
  });

  ipcMain.handle('proxy.testAll', async () => {
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
        services.profileService.recordAudit(profile.id, 'PROXY_TESTED', {
          status: result.status,
          host: profile.proxy.host,
          port: profile.proxy.port,
          ipTimezone: result.ipTimezone,
          timezoneMatch: result.timezoneMatch
        });
        services.trialService.incrementMetric('proxyTestCount');
        return { profileId: profile.id, result };
      })
    );
    return results;
  });

  ipcMain.handle('audit.list', (_event, profileId?: string) => services.profileService.listAuditEvents(profileId));

  ipcMain.handle('audit.export', async (_event, profileId?: string) => {
    const filePath = exportAuditEvents(services.profileService.listAuditEvents(profileId), path.join(services.dataDir, 'exports'));
    services.profileService.recordAudit(profileId ?? null, 'AUDIT_EXPORTED', { filePath });
    return { filePath };
  });

  ipcMain.handle('chromium.ensureInstalled', async () => {
    const result = await services.chromiumInstaller.ensureInstalled();
    services.profileService.recordAudit(null, 'CHROMIUM_INSTALLED', {
      version: result.version,
      alreadyInstalled: result.alreadyInstalled
    });
    return result;
  });

  ipcMain.handle('kernel.manifest', () => services.kernelRuntimeManager.manifest());

  ipcMain.handle('kernel.status', () => services.kernelRuntimeManager.status());

  ipcMain.handle('kernel.ensureInstalled', async () => {
    const result = await services.kernelRuntimeManager.ensureInstalled();
    services.profileService.recordAudit(null, 'KERNEL_INSTALLED', {
      version: result.manifest.version,
      baseChromiumRevision: result.manifest.baseChromiumRevision,
      patchsetVersion: result.manifest.patchsetVersion,
      alreadyInstalled: result.alreadyInstalled
    });
    return result;
  });

  ipcMain.handle('kernel.importManifest', async (_event, manifestPath?: string) => {
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

  ipcMain.handle('kernel.clearManifest', () => {
    const previous = services.kernelRuntimeManager.status();
    const status = services.kernelRuntimeManager.clearManifest();
    services.profileService.recordAudit(null, 'KERNEL_MANIFEST_CLEARED', {
      previousVersion: previous.manifest.version,
      source: previous.source
    });
    return status;
  });

  ipcMain.handle('kernel.openRuntimeFolder', async () => {
    const status = services.kernelRuntimeManager.status();
    mkdirSync(status.runtimeRoot, { recursive: true });
    const errorMessage = await shell.openPath(status.runtimeRoot);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    return { folderPath: status.runtimeRoot };
  });

  ipcMain.handle('app.version', () => services.trialService.version());

  ipcMain.handle('release.checkForUpdates', async () => {
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

  ipcMain.handle('release.openLatestRelease', async () => {
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

  ipcMain.handle('onboarding.status', () => onboardingStatus());

  ipcMain.handle('onboarding.dismiss', async () => {
    services.trialService.dismissOnboarding();
    return onboardingStatus();
  });

  ipcMain.handle('onboarding.reset', async () => {
    services.trialService.resetOnboarding();
    return onboardingStatus();
  });

  ipcMain.handle('trial.metrics', () =>
    services.trialService.metrics({
      profileCount: services.profileService.listProfiles().length,
      credentialCount: services.credentialService.countCredentials()
    })
  );

  ipcMain.handle('feedback.package', async (_event, input: FeedbackPackageInput) => {
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

  ipcMain.handle('credentials.list', (_event, input?: ListCredentialsInput) => {
    services.licenseService.assertCanUseCredentials();
    return services.credentialService.listCredentials(input);
  });

  ipcMain.handle('credentials.create', (_event, input: CreateCredentialInput) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.createCredential(input);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_CREATED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return credential;
  });

  ipcMain.handle('credentials.update', (_event, input: UpdateCredentialInput) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.updateCredential(input);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_UPDATED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return credential;
  });

  ipcMain.handle('credentials.delete', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const credential = services.credentialService.deleteCredential(id);
    services.profileService.recordAudit(credential.profileId, 'CREDENTIAL_DELETED', {
      credentialId: credential.id,
      title: credential.title,
      websiteUrl: credential.websiteUrl
    });
    return { id };
  });

  ipcMain.handle('credentials.copyUsername', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.copyUsername(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_USERNAME_COPIED', {
      credentialId: id
    });
    return result;
  });

  ipcMain.handle('credentials.copyPassword', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.copyPassword(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_PASSWORD_COPIED', {
      credentialId: id
    });
    return result;
  });

  ipcMain.handle('credentials.revealPassword', (_event, id: string) => {
    services.licenseService.assertCanUseCredentials();
    const result = services.credentialService.revealPassword(id);
    services.profileService.recordAudit(result.profileId, 'CREDENTIAL_PASSWORD_REVEALED', {
      credentialId: id
    });
    return result;
  });

  ipcMain.handle('license.activate', async (_event, input: ActivateLicenseInput) => {
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

  ipcMain.handle('license.status', () => services.licenseService.redactedStatus());

  ipcMain.handle('license.refresh', async () => {
    const state = await services.licenseService.refresh();
    services.profileService.recordAudit(null, 'LICENSE_REFRESHED', {
      status: state.status,
      teamName: state.teamName,
      plan: state.plan.id,
      expiresAt: state.expiresAt
    });
    return services.licenseService.redactedStatus();
  });

  ipcMain.handle('license.deactivate', async () => {
    const state = await services.licenseService.deactivate();
    services.profileService.recordAudit(null, 'LICENSE_DEACTIVATED');
    return state;
  });

  ipcMain.handle('license.usage', async () => {
    const state = await services.licenseService.status();
    return {
      profilesUsed: services.profileService.listProfiles().length,
      profileLimit: state.plan.profileLimit,
      seatsUsed: state.status === 'inactive' ? 0 : 1,
      seatLimit: state.plan.seatLimit
    };
  });

  ipcMain.handle('support.packageLogs', async () => {
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
