import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActivateLicenseInput,
  AppApi,
  CreateCredentialInput,
  CreateProfileInput,
  ListCredentialsInput,
  ProxyConnectionInput,
  UpdateCredentialInput,
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
    testAll: () => ipcRenderer.invoke('proxy.testAll') as ReturnType<AppApi['proxy']['testAll']>,
    localStatus: (profileId?: string) =>
      ipcRenderer.invoke('proxy.localStatus', profileId) as ReturnType<AppApi['proxy']['localStatus']>,
    system: () => ipcRenderer.invoke('proxy.system') as ReturnType<AppApi['proxy']['system']>,
    scanLocal: () => ipcRenderer.invoke('proxy.scanLocal') as ReturnType<AppApi['proxy']['scanLocal']>
  },
  audit: {
    list: (profileId?: string) => ipcRenderer.invoke('audit.list', profileId) as ReturnType<AppApi['audit']['list']>,
    export: (profileId?: string) => ipcRenderer.invoke('audit.export', profileId) as ReturnType<AppApi['audit']['export']>
  },
  chromium: {
    ensureInstalled: () => ipcRenderer.invoke('chromium.ensureInstalled') as ReturnType<AppApi['chromium']['ensureInstalled']>
  },
  kernel: {
    manifest: () => ipcRenderer.invoke('kernel.manifest') as ReturnType<AppApi['kernel']['manifest']>,
    status: () => ipcRenderer.invoke('kernel.status') as ReturnType<AppApi['kernel']['status']>,
    ensureInstalled: () => ipcRenderer.invoke('kernel.ensureInstalled') as ReturnType<AppApi['kernel']['ensureInstalled']>,
    importManifest: (manifestPath?: string) =>
      ipcRenderer.invoke('kernel.importManifest', manifestPath) as ReturnType<AppApi['kernel']['importManifest']>,
    clearManifest: () => ipcRenderer.invoke('kernel.clearManifest') as ReturnType<AppApi['kernel']['clearManifest']>,
    openRuntimeFolder: () =>
      ipcRenderer.invoke('kernel.openRuntimeFolder') as ReturnType<AppApi['kernel']['openRuntimeFolder']>
  },
  app: {
    version: () => ipcRenderer.invoke('app.version') as ReturnType<AppApi['app']['version']>
  },
  release: {
    checkForUpdates: () =>
      ipcRenderer.invoke('release.checkForUpdates') as ReturnType<AppApi['release']['checkForUpdates']>,
    openLatestRelease: () =>
      ipcRenderer.invoke('release.openLatestRelease') as ReturnType<AppApi['release']['openLatestRelease']>
  },
  onboarding: {
    status: () => ipcRenderer.invoke('onboarding.status') as ReturnType<AppApi['onboarding']['status']>,
    dismiss: () => ipcRenderer.invoke('onboarding.dismiss') as ReturnType<AppApi['onboarding']['dismiss']>,
    reset: () => ipcRenderer.invoke('onboarding.reset') as ReturnType<AppApi['onboarding']['reset']>
  },
  trial: {
    metrics: () => ipcRenderer.invoke('trial.metrics') as ReturnType<AppApi['trial']['metrics']>
  },
  feedback: {
    package: (input) => ipcRenderer.invoke('feedback.package', input) as ReturnType<AppApi['feedback']['package']>
  },
  securityLab: {
    open: (profileId: string) =>
      ipcRenderer.invoke('securityLab.open', profileId) as ReturnType<AppApi['securityLab']['open']>
  },
  credentials: {
    list: (input?: ListCredentialsInput) =>
      ipcRenderer.invoke('credentials.list', input) as ReturnType<AppApi['credentials']['list']>,
    create: (input: CreateCredentialInput) =>
      ipcRenderer.invoke('credentials.create', input) as ReturnType<AppApi['credentials']['create']>,
    update: (input: UpdateCredentialInput) =>
      ipcRenderer.invoke('credentials.update', input) as ReturnType<AppApi['credentials']['update']>,
    delete: (id: string) => ipcRenderer.invoke('credentials.delete', id) as ReturnType<AppApi['credentials']['delete']>,
    copyUsername: (id: string) =>
      ipcRenderer.invoke('credentials.copyUsername', id) as ReturnType<AppApi['credentials']['copyUsername']>,
    copyPassword: (id: string) =>
      ipcRenderer.invoke('credentials.copyPassword', id) as ReturnType<AppApi['credentials']['copyPassword']>,
    revealPassword: (id: string) =>
      ipcRenderer.invoke('credentials.revealPassword', id) as ReturnType<AppApi['credentials']['revealPassword']>
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
