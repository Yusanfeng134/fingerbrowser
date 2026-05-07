import { BrowserWindow, app, shell } from 'electron';
import path from 'node:path';
import { createApplicationServices } from './services';
import { registerIpcHandlers } from './ipc';
import type { ApplicationServices } from './services';
import { resolveRendererEntry } from './renderer-entry';
import { isServerMode, startServerMode } from './server-mode';

let mainWindow: BrowserWindow | null = null;
let applicationServices: ApplicationServices | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: '指纹浏览器',
    backgroundColor: '#f6f4ee',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const rendererEntry = resolveRendererEntry({
    isPackaged: app.isPackaged,
    mainDir: __dirname,
    rendererUrl: process.env.ELECTRON_RENDERER_URL
  });

  if (rendererEntry.kind === 'url') {
    void mainWindow.loadURL(rendererEntry.value);
  } else {
    void mainWindow.loadFile(rendererEntry.value);
  }
}

void app.whenReady().then(async () => {
  const serverMode = isServerMode();
  const services = createApplicationServices({ serverMode });
  applicationServices = services;
  if (serverMode) {
    await startServerMode(services);
    registerServerShutdownHandlers();
    return;
  }

  registerIpcHandlers(services);
  void services.localApiServer.start().catch((error) => {
    console.error('Local API 启动失败', error);
  });
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((error) => {
  console.error('FingerBrowser 启动失败', error);
  app.exit(1);
});

app.on('before-quit', () => {
  void applicationServices?.localApiServer.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerServerShutdownHandlers(): void {
  const shutdown = (): void => {
    void applicationServices?.localApiServer.stop().finally(() => {
      app.quit();
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
