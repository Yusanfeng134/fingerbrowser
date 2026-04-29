import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActivateLicenseInput,
  AppApi,
  CreateProfileInput,
  ProxyConnectionInput,
  UpdateProfileInput
} from '../shared/types';

const api: AppApi = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles.list') as Promise<Awaited<ReturnType<AppApi['profiles']['list']>>>,
    create: (input: CreateProfileInput) => ipcRenderer.invoke('profiles.create', input) as ReturnType<AppApi['profiles']['create']>,
    bulkCreate: (inputs: CreateProfileInput[]) =>
      ipcRenderer.invoke('profiles.bulkCreate', inputs) as ReturnType<AppApi['profiles']['bulkCreate']>,
    update: (input: UpdateProfileInput) => ipcRenderer.invoke('profiles.update', input) as ReturnType<AppApi['profiles']['update']>,
    export: () => ipcRenderer.invoke('profiles.export') as ReturnType<AppApi['profiles']['export']>,
    launch: (profileId: string) => ipcRenderer.invoke('profiles.launch', profileId) as ReturnType<AppApi['profiles']['launch']>,
    stop: (profileId: string) => ipcRenderer.invoke('profiles.stop', profileId) as ReturnType<AppApi['profiles']['stop']>
  },
  proxy: {
    test: (input: ProxyConnectionInput & { profileId?: string }) =>
      ipcRenderer.invoke('proxy.test', input) as ReturnType<AppApi['proxy']['test']>,
    testAll: () => ipcRenderer.invoke('proxy.testAll') as ReturnType<AppApi['proxy']['testAll']>
  },
  audit: {
    list: (profileId?: string) => ipcRenderer.invoke('audit.list', profileId) as ReturnType<AppApi['audit']['list']>,
    export: (profileId?: string) => ipcRenderer.invoke('audit.export', profileId) as ReturnType<AppApi['audit']['export']>
  },
  chromium: {
    ensureInstalled: () => ipcRenderer.invoke('chromium.ensureInstalled') as ReturnType<AppApi['chromium']['ensureInstalled']>
  },
  license: {
    activate: (input: ActivateLicenseInput) =>
      ipcRenderer.invoke('license.activate', input) as ReturnType<AppApi['license']['activate']>,
    status: () => ipcRenderer.invoke('license.status') as ReturnType<AppApi['license']['status']>,
    refresh: () => ipcRenderer.invoke('license.refresh') as ReturnType<AppApi['license']['refresh']>,
    deactivate: () => ipcRenderer.invoke('license.deactivate') as ReturnType<AppApi['license']['deactivate']>,
    usage: () => ipcRenderer.invoke('license.usage') as ReturnType<AppApi['license']['usage']>
  },
  support: {
    packageLogs: () => ipcRenderer.invoke('support.packageLogs') as ReturnType<AppApi['support']['packageLogs']>
  }
};

contextBridge.exposeInMainWorld('fingerBrowser', api);
