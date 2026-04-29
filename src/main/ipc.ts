import { ipcMain } from 'electron';
import path from 'node:path';
import type {
  ActivateLicenseInput,
  CreateCredentialInput,
  CreateProfileInput,
  ProxyConnectionInput,
  UpdateCredentialInput,
  UpdateProfileInput
} from '../shared/types';
import { exportAuditEvents, exportProfiles, packageSupportLogs } from './domain/commercial-ops';
import type { ApplicationServices } from './services';
import { testProxyConnection } from './domain/proxy';

export function registerIpcHandlers(services: ApplicationServices): void {
  ipcMain.handle('profiles.list', () => services.profileService.listProfiles());

  ipcMain.handle('profiles.create', (_event, input: CreateProfileInput) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, 1);
    return services.profileService.createProfile(input);
  });

  ipcMain.handle('profiles.bulkCreate', (_event, inputs: CreateProfileInput[]) => {
    services.licenseService.assertCanCreateProfiles(services.profileService.listProfiles().length, inputs.length);
    return inputs.map((input) => services.profileService.createProfile(input));
  });

  ipcMain.handle('profiles.update', (_event, input: UpdateProfileInput) => services.profileService.updateProfile(input));

  ipcMain.handle('profiles.export', async () => {
    const filePath = exportProfiles(services.profileService.listProfiles(), path.join(services.dataDir, 'exports'));
    services.profileService.recordAudit(null, 'PROFILES_EXPORTED', { filePath });
    return { filePath };
  });

  ipcMain.handle('profiles.launch', async (_event, profileId: string) => {
    const profile = services.profileService.getProfile(profileId);
    const result = await services.browserController.launch(profile, profile.proxy);
    services.profileService.setProfileStatus(profileId, 'running');
    services.profileService.recordAudit(profileId, 'PROFILE_LAUNCHED', { pid: result.pid });
    return {
      profileId,
      pid: result.pid,
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
    const result = await testProxyConnection(input);
    if (input.profileId) {
      const profile = services.profileService.getProfile(input.profileId);
      if (profile.proxyId) {
        services.profileService.setProxyTestStatus(profile.proxyId, result);
        services.profileService.recordAudit(input.profileId, 'PROXY_TESTED', {
          status: result.status,
          host: input.host,
          port: input.port
        });
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
          timeoutMs: 3000
        });
        services.profileService.setProxyTestStatus(profile.proxy.id, result);
        services.profileService.recordAudit(profile.id, 'PROXY_TESTED', {
          status: result.status,
          host: profile.proxy.host,
          port: profile.proxy.port
        });
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

  ipcMain.handle('credentials.list', (_event, profileId: string) => {
    services.licenseService.assertCanUseCredentials();
    return services.credentialService.listCredentials(profileId);
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

  ipcMain.handle('license.activate', async (_event, input: ActivateLicenseInput) => {
    const state = await services.licenseService.activate(input);
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
