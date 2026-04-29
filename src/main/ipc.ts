import { ipcMain } from 'electron';
import type { CreateProfileInput, ProxyConnectionInput, UpdateProfileInput } from '../shared/types';
import type { ApplicationServices } from './services';
import { testProxyConnection } from './domain/proxy';

export function registerIpcHandlers(services: ApplicationServices): void {
  ipcMain.handle('profiles.list', () => services.profileService.listProfiles());

  ipcMain.handle('profiles.create', (_event, input: CreateProfileInput) => services.profileService.createProfile(input));

  ipcMain.handle('profiles.update', (_event, input: UpdateProfileInput) => services.profileService.updateProfile(input));

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

  ipcMain.handle('audit.list', (_event, profileId?: string) => services.profileService.listAuditEvents(profileId));

  ipcMain.handle('chromium.ensureInstalled', async () => {
    const result = await services.chromiumInstaller.ensureInstalled();
    services.profileService.recordAudit(null, 'CHROMIUM_INSTALLED', {
      version: result.version,
      alreadyInstalled: result.alreadyInstalled
    });
    return result;
  });
}
