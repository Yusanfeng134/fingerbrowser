import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppSettingsService } from '../src/main/domain/app-settings-service';
import { createGoogleAccountService } from '../src/main/domain/google-account-service';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-google-account-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const settings = createAppSettingsService({ db });
  const secretBox = createNodeSecretBox('google-account-test-master-key');
  const googleAccountService = createGoogleAccountService({ settings, secretBox });
  return { db, googleAccountService };
}

describe('google account service', () => {
  it('stores Google API credentials encrypted and returns only redacted status', () => {
    const { db, googleAccountService } = createHarness();

    const status = googleAccountService.save({
      enabled: true,
      apiKey: 'google-api-key',
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret'
    });
    const row = db.prepare('select value_json from app_settings where key = ?').get('googleAccountConfig') as {
      value_json: string;
    };

    expect(status).toMatchObject({
      enabled: true,
      configured: true
    });
    expect(JSON.stringify(status)).not.toContain('google-api-key');
    expect(JSON.stringify(status)).not.toContain('google-client-secret');
    expect(row.value_json).not.toContain('google-api-key');
    expect(row.value_json).not.toContain('google-client-secret');
  });

  it('emits Chromium Google environment only for custom kernel when enabled', () => {
    const { googleAccountService } = createHarness();
    googleAccountService.save({
      enabled: true,
      apiKey: 'google-api-key',
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret'
    });

    expect(googleAccountService.runtimeEnvironment('official')).toEqual({});
    expect(googleAccountService.runtimeEnvironment('custom-kernel')).toEqual({
      FINGERBROWSER_GOOGLE_API_KEY: 'google-api-key',
      FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_ID: 'google-client-id',
      FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_SECRET: 'google-client-secret'
    });
  });

  it('preserves saved credentials when toggling enable state without new secrets', () => {
    const { googleAccountService } = createHarness();
    googleAccountService.save({
      enabled: true,
      apiKey: 'google-api-key',
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret'
    });

    googleAccountService.save({ enabled: false });
    expect(googleAccountService.runtimeEnvironment('custom-kernel')).toEqual({});

    googleAccountService.save({ enabled: true });
    expect(googleAccountService.runtimeEnvironment('custom-kernel').FINGERBROWSER_GOOGLE_API_KEY).toBe('google-api-key');
  });

  it('rejects enabling Google account login until all credentials are configured', () => {
    const { googleAccountService } = createHarness();

    expect(() =>
      googleAccountService.save({
        enabled: true,
        apiKey: 'google-api-key',
        clientId: 'google-client-id'
      })
    ).toThrow('Google 账号配置不完整');
  });
});
