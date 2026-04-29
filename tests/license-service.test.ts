import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createManualActivationCode } from '../src/main/domain/license';
import { createLicenseService } from '../src/main/domain/license-service';
import { createProfileService } from '../src/main/domain/profile-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];
const signingSecret = 'license-service-test-secret';

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-license-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const secretBox = createNodeSecretBox('test-master-key');
  return {
    dataDir,
    db,
    secretBox,
    profileService: createProfileService({ db, dataDir, secretBox }),
    licenseService: createLicenseService({
      db,
      secretBox,
      signingSecret,
      deviceId: 'device-unit-test',
      now: () => new Date('2026-04-29T08:00:00.000Z')
    })
  };
}

describe('license service', () => {
  it('activates a signed code, binds it to the current device, and stores no plaintext token', async () => {
    const { db, licenseService } = createHarness();
    const activationCode = createManualActivationCode({
      signingSecret,
      planId: 'trial',
      teamName: '试卖团队',
      issuedAt: new Date('2026-04-29T08:00:00.000Z'),
      expiresAt: new Date('2026-05-06T08:00:00.000Z')
    });

    const state = await licenseService.activate({ activationCode });

    expect(state.status).toBe('active');
    expect(state.teamName).toBe('试卖团队');
    expect(state.deviceId).toBe('device-unit-test');
    const row = db.prepare('select encrypted_activation_token from license_cache limit 1').get() as {
      encrypted_activation_token: string;
    };
    expect(row.encrypted_activation_token).not.toContain(activationCode);
  });

  it('enforces profile limits before creating new environments', async () => {
    const { licenseService, profileService } = createHarness();
    const activationCode = createManualActivationCode({
      signingSecret,
      planId: 'trial',
      teamName: '试卖团队',
      issuedAt: new Date('2026-04-29T08:00:00.000Z'),
      expiresAt: new Date('2026-05-06T08:00:00.000Z'),
      overrides: { profileLimit: 1 }
    });
    await licenseService.activate({ activationCode });
    profileService.createProfile({ name: '环境 1' });

    expect(() => licenseService.assertCanCreateProfiles(profileService.listProfiles().length, 1)).toThrow(
      '当前套餐最多可创建 1 个环境'
    );
  });

  it('deactivates the cached license', async () => {
    const { licenseService } = createHarness();
    const activationCode = createManualActivationCode({
      signingSecret,
      planId: 'pro',
      teamName: '试卖团队',
      issuedAt: new Date('2026-04-29T08:00:00.000Z'),
      expiresAt: new Date('2026-05-29T08:00:00.000Z')
    });
    await licenseService.activate({ activationCode });

    const state = await licenseService.deactivate();

    expect(state.status).toBe('inactive');
  });
});
