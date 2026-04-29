import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialService } from '../src/main/domain/credential-service';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createManualActivationCode } from '../src/main/domain/license';
import { createLicenseService } from '../src/main/domain/license-service';
import { createProfileService } from '../src/main/domain/profile-service';
import { createTrialService } from '../src/main/domain/trial-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';
import type { LicenseState } from '../src/shared/types';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-trial-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const secretBox = createNodeSecretBox('trial-test-master-key');
  const profileService = createProfileService({ db, dataDir, secretBox });
  const credentialService = createCredentialService({
    db,
    secretBox,
    writeClipboard: () => undefined
  });
  const licenseService = createLicenseService({
    db,
    secretBox,
    signingSecret: 'trial-test-license-secret',
    deviceId: 'trial-device',
    now: () => new Date('2026-04-29T08:00:00.000Z')
  });
  const trialService = createTrialService({
    db,
    exportDir: path.join(dataDir, 'exports'),
    version: {
      version: '0.1.0',
      channel: 'trial',
      releaseUrl: 'https://github.com/Yusanfeng134/fingerbrowser/releases'
    }
  });
  return { dataDir, profileService, credentialService, licenseService, trialService };
}

async function activate(licenseService: ReturnType<typeof createLicenseService>) {
  const activationCode = createManualActivationCode({
    signingSecret: 'trial-test-license-secret',
    planId: 'trial',
    teamName: '试卖团队',
    issuedAt: new Date('2026-04-29T08:00:00.000Z'),
    expiresAt: new Date('2026-05-06T08:00:00.000Z')
  });
  return licenseService.activate({ activationCode });
}

describe('trial service', () => {
  it('increments local metrics without uploading data', () => {
    const { trialService } = createHarness();

    trialService.incrementMetric('activationCount');
    trialService.incrementMetric('activationCount');
    trialService.incrementMetric('proxyTestCount');

    expect(trialService.metrics({ profileCount: 3, credentialCount: 4 })).toMatchObject({
      activationCount: 2,
      proxyTestCount: 1,
      profileCount: 3,
      credentialCount: 4
    });
  });

  it('derives onboarding checklist status from local app state', async () => {
    const { profileService, credentialService, licenseService, trialService } = createHarness();
    const license = await activate(licenseService);
    const profile = profileService.createProfile({
      name: '试卖环境',
      proxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'operator',
        password: 'proxy-password'
      }
    });
    credentialService.createCredential({
      profileId: profile.id,
      title: '后台',
      websiteUrl: 'https://console.example.test',
      username: 'operator',
      password: 'credential-secret'
    });
    profileService.recordAudit(profile.id, 'PROXY_TESTED', { status: 'passed' });
    profileService.recordAudit(profile.id, 'PROFILE_LAUNCHED', { pid: 100 });
    profileService.recordAudit(null, 'FEEDBACK_PACKAGED', { filePath: '/tmp/feedback.json' });

    const status = trialService.onboardingStatus({
      license,
      profiles: profileService.listProfiles(),
      audits: profileService.listAuditEvents(),
      credentialCount: 1
    });

    expect(status.dismissed).toBe(false);
    expect(status.items).toEqual([
      { id: 'activate-license', label: '激活许可证', completed: true },
      { id: 'create-profile', label: '创建浏览器环境', completed: true },
      { id: 'configure-proxy', label: '配置并检测代理', completed: true },
      { id: 'save-password', label: '保存环境密码', completed: true },
      { id: 'launch-browser', label: '启动 Chromium', completed: true },
      { id: 'package-feedback', label: '导出反馈包', completed: true }
    ]);
  });

  it('creates a redacted local feedback package', async () => {
    const { profileService, credentialService, licenseService, trialService } = createHarness();
    const license = (await activate(licenseService)) as LicenseState;
    const profile = profileService.createProfile({
      name: '反馈环境',
      proxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'operator',
        password: 'plain-proxy-password'
      }
    });
    credentialService.createCredential({
      profileId: profile.id,
      title: '后台',
      websiteUrl: 'https://console.example.test',
      username: 'operator',
      password: 'credential-secret'
    });
    profileService.recordAudit(profile.id, 'CREDENTIAL_CREATED', {
      password: 'credential-secret',
      encryptedPassword: 'v1:sensitive'
    });

    const result = trialService.packageFeedback({
      input: {
        issueType: 'bug',
        severity: 'high',
        teamName: '试卖团队',
        contact: 'operator@example.test',
        description: '启动失败',
        includeDiagnostics: true
      },
      license,
      profiles: profileService.listProfiles(),
      audits: profileService.listAuditEvents(),
      metrics: trialService.metrics({ profileCount: 1, credentialCount: 1 })
    });
    const content = readFileSync(result.filePath, 'utf8');

    expect(existsSync(result.filePath)).toBe(true);
    expect(content).toContain('"issueType": "bug"');
    expect(content).toContain('"version": "0.1.0"');
    expect(content).not.toContain('plain-proxy-password');
    expect(content).not.toContain('credential-secret');
    expect(content).not.toContain('v1:sensitive');
    expect(content).not.toContain('Cookie');
  });
});
