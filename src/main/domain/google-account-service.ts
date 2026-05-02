import type { GoogleAccountConfigStatus, RuntimeChannel, SaveGoogleAccountConfigInput } from '../../shared/types';
import type { AppSettingsService, AppSettingsValues } from './app-settings-service';
import type { SecretBox } from './encryption';

type StoredGoogleAccountConfig = AppSettingsValues['googleAccountConfig'];

interface GoogleAccountServiceOptions {
  settings: AppSettingsService;
  secretBox: SecretBox;
  now?: () => Date;
}

export interface GoogleAccountService {
  status(): GoogleAccountConfigStatus;
  save(input: SaveGoogleAccountConfigInput): GoogleAccountConfigStatus;
  clear(): GoogleAccountConfigStatus;
  runtimeEnvironment(runtimeChannel: RuntimeChannel): NodeJS.ProcessEnv;
}

const EMPTY_STATUS: GoogleAccountConfigStatus = {
  enabled: false,
  configured: false,
  updatedAt: null
};

export function createGoogleAccountService(options: GoogleAccountServiceOptions): GoogleAccountService {
  const now = options.now ?? (() => new Date());

  function load(): StoredGoogleAccountConfig | null {
    return options.settings.get('googleAccountConfig');
  }

  function configured(config: StoredGoogleAccountConfig | null): boolean {
    return Boolean(config?.encryptedApiKey && config.encryptedClientId && config.encryptedClientSecret);
  }

  function toStatus(config: StoredGoogleAccountConfig | null): GoogleAccountConfigStatus {
    if (!config) {
      return EMPTY_STATUS;
    }
    return {
      enabled: config.enabled,
      configured: configured(config),
      updatedAt: config.updatedAt
    };
  }

  function nextEncryptedValue(currentValue: string | undefined, inputValue: string | undefined): string {
    const trimmed = inputValue?.trim();
    if (trimmed) {
      return options.secretBox.encrypt(trimmed);
    }
    return currentValue ?? '';
  }

  return {
    status(): GoogleAccountConfigStatus {
      return toStatus(load());
    },

    save(input: SaveGoogleAccountConfigInput): GoogleAccountConfigStatus {
      const current = load();
      const next: StoredGoogleAccountConfig = {
        enabled: input.enabled,
        encryptedApiKey: nextEncryptedValue(current?.encryptedApiKey, input.apiKey),
        encryptedClientId: nextEncryptedValue(current?.encryptedClientId, input.clientId),
        encryptedClientSecret: nextEncryptedValue(current?.encryptedClientSecret, input.clientSecret),
        updatedAt: now().toISOString()
      };

      if (next.enabled && !configured(next)) {
        throw new Error('Google 账号配置不完整：请填写 API Key、OAuth Client ID 和 OAuth Client Secret');
      }

      options.settings.set('googleAccountConfig', next);
      return toStatus(next);
    },

    clear(): GoogleAccountConfigStatus {
      options.settings.delete('googleAccountConfig');
      return EMPTY_STATUS;
    },

    runtimeEnvironment(runtimeChannel: RuntimeChannel): NodeJS.ProcessEnv {
      const config = load();
      if (runtimeChannel !== 'custom-kernel' || !config?.enabled || !configured(config)) {
        return {};
      }
      return {
        FINGERBROWSER_GOOGLE_API_KEY: options.secretBox.decrypt(config.encryptedApiKey),
        FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_ID: options.secretBox.decrypt(config.encryptedClientId),
        FINGERBROWSER_GOOGLE_DEFAULT_CLIENT_SECRET: options.secretBox.decrypt(config.encryptedClientSecret)
      };
    }
  };
}
