import type { ApplicationDatabase } from '../infrastructure/database';
import type { SecretBox } from './encryption';
import {
  evaluateLicenseState,
  inactiveLicenseState,
  parseActivationCode,
  redactLicenseState
} from './license';
import type { ActivateLicenseInput, LicenseState, RedactedLicenseState } from '../../shared/types';

interface LicenseServiceOptions {
  db: ApplicationDatabase;
  secretBox: SecretBox;
  signingSecret: string;
  deviceId: string;
  now?: () => Date;
}

interface LicenseCacheRow {
  id: number;
  team_name: string;
  plan_json: string;
  device_id: string;
  encrypted_activation_token: string;
  activated_at: string;
  expires_at: string;
  last_checked_at: string;
}

export interface LicenseService {
  activate(input: ActivateLicenseInput): Promise<LicenseState>;
  status(): Promise<LicenseState>;
  refresh(): Promise<LicenseState>;
  deactivate(): Promise<LicenseState>;
  assertCanCreateProfiles(currentProfiles: number, requestedProfiles: number): void;
  redactedStatus(): Promise<RedactedLicenseState>;
}

export function createLicenseService(options: LicenseServiceOptions): LicenseService {
  const now = options.now ?? (() => new Date());

  function checkedAt(): string {
    return now().toISOString();
  }

  function rowToState(row: LicenseCacheRow): LicenseState {
    return evaluateLicenseState({
      plan: JSON.parse(row.plan_json) as LicenseState['plan'],
      teamName: row.team_name,
      deviceId: row.device_id,
      activationToken: options.secretBox.decrypt(row.encrypted_activation_token),
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
      checkedAt: checkedAt()
    });
  }

  function currentRow(): LicenseCacheRow | undefined {
    return options.db.prepare('select * from license_cache order by id desc limit 1').get() as LicenseCacheRow | undefined;
  }

  async function status(): Promise<LicenseState> {
    const row = currentRow();
    if (!row) {
      return inactiveLicenseState(options.deviceId, checkedAt());
    }
    const state = rowToState(row);
    options.db.prepare('update license_cache set last_checked_at = ? where id = ?').run(state.checkedAt, row.id);
    return state;
  }

  return {
    async activate(input: ActivateLicenseInput): Promise<LicenseState> {
      const payload = parseActivationCode(input.activationCode.trim(), options.signingSecret);
      const activatedAt = checkedAt();
      options.db.prepare('delete from license_cache').run();
      options.db
        .prepare(
          `insert into license_cache (
            team_name, plan_json, device_id, encrypted_activation_token, activated_at, expires_at, last_checked_at
          ) values (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          payload.teamName,
          JSON.stringify(payload.plan),
          options.deviceId,
          options.secretBox.encrypt(input.activationCode.trim()),
          activatedAt,
          payload.expiresAt,
          activatedAt
        );
      return status();
    },
    status,
    async refresh(): Promise<LicenseState> {
      return status();
    },
    async deactivate(): Promise<LicenseState> {
      options.db.prepare('delete from license_cache').run();
      return inactiveLicenseState(options.deviceId, checkedAt());
    },
    assertCanCreateProfiles(currentProfiles: number, requestedProfiles: number): void {
      const row = currentRow();
      if (!row) {
        throw new Error('请先激活许可证');
      }
      const state = rowToState(row);
      if (state.status === 'expired' || state.status === 'inactive') {
        throw new Error('许可证已过期，请联系销售续期');
      }
      const nextCount = currentProfiles + requestedProfiles;
      if (nextCount > state.plan.profileLimit) {
        throw new Error(`当前套餐最多可创建 ${state.plan.profileLimit} 个环境`);
      }
    },
    async redactedStatus(): Promise<RedactedLicenseState> {
      return redactLicenseState(await status());
    }
  };
}
