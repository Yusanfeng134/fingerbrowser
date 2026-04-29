import { existsSync, mkdirSync } from 'node:fs';
import {
  Browser,
  BrowserTag,
  computeExecutablePath,
  detectBrowserPlatform,
  install,
  resolveBuildId
} from '@puppeteer/browsers';
import type { ChromiumInstallResult } from '../../shared/types';

export interface ChromiumInstaller {
  ensureInstalled(): Promise<ChromiumInstallResult>;
}

export function createChromiumInstaller(cacheDir: string): ChromiumInstaller {
  mkdirSync(cacheDir, { recursive: true });

  return {
    async ensureInstalled(): Promise<ChromiumInstallResult> {
      const platform = detectBrowserPlatform();
      if (!platform) {
        throw new Error('当前平台不支持托管 Chromium');
      }

      const buildId = await resolveBuildId(Browser.CHROME, platform, BrowserTag.STABLE);
      const executablePath = computeExecutablePath({
        browser: Browser.CHROME,
        buildId,
        cacheDir,
        platform
      });

      if (existsSync(executablePath)) {
        return {
          executablePath,
          version: buildId,
          alreadyInstalled: true
        };
      }

      const installed = await install({
        browser: Browser.CHROME,
        buildId,
        cacheDir,
        platform,
        buildIdAlias: 'stable',
        downloadProgressCallback: 'default'
      });

      return {
        executablePath: installed.executablePath,
        version: buildId,
        alreadyInstalled: false
      };
    }
  };
}

export function createMockChromiumInstaller(): ChromiumInstaller {
  return {
    async ensureInstalled(): Promise<ChromiumInstallResult> {
      return {
        executablePath: process.execPath,
        version: 'e2e-mock',
        alreadyInstalled: true
      };
    }
  };
}
