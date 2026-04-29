import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppApi,
  CreateProfileInput,
  ProxyConnectionInput,
  UpdateProfileInput
} from '../shared/types';

const api: AppApi = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles.list') as Promise<Awaited<ReturnType<AppApi['profiles']['list']>>>,
    create: (input: CreateProfileInput) => ipcRenderer.invoke('profiles.create', input) as ReturnType<AppApi['profiles']['create']>,
    update: (input: UpdateProfileInput) => ipcRenderer.invoke('profiles.update', input) as ReturnType<AppApi['profiles']['update']>,
    launch: (profileId: string) => ipcRenderer.invoke('profiles.launch', profileId) as ReturnType<AppApi['profiles']['launch']>,
    stop: (profileId: string) => ipcRenderer.invoke('profiles.stop', profileId) as ReturnType<AppApi['profiles']['stop']>
  },
  proxy: {
    test: (input: ProxyConnectionInput & { profileId?: string }) =>
      ipcRenderer.invoke('proxy.test', input) as ReturnType<AppApi['proxy']['test']>
  },
  audit: {
    list: (profileId?: string) => ipcRenderer.invoke('audit.list', profileId) as ReturnType<AppApi['audit']['list']>
  },
  chromium: {
    ensureInstalled: () => ipcRenderer.invoke('chromium.ensureInstalled') as ReturnType<AppApi['chromium']['ensureInstalled']>
  }
};

contextBridge.exposeInMainWorld('fingerBrowser', api);
