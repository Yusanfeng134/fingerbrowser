import type { ApplicationDatabase } from '../infrastructure/database';

export interface AppSettingsValues {
  kernelManifestPath: string;
  kernelManifestImportedAt: string;
}

export type AppSettingsKey = keyof AppSettingsValues;

interface AppSettingsRow {
  value_json: string;
}

export interface AppSettingsService {
  get<K extends AppSettingsKey>(key: K): AppSettingsValues[K] | null;
  set<K extends AppSettingsKey>(key: K, value: AppSettingsValues[K]): void;
  delete(key: AppSettingsKey): void;
}

interface CreateAppSettingsServiceOptions {
  db: ApplicationDatabase;
  now?: () => Date;
}

export function createAppSettingsService(options: CreateAppSettingsServiceOptions): AppSettingsService {
  const now = options.now ?? (() => new Date());

  return {
    get<K extends AppSettingsKey>(key: K): AppSettingsValues[K] | null {
      const row = options.db.prepare('select value_json from app_settings where key = ?').get(key) as
        | AppSettingsRow
        | undefined;
      if (!row) {
        return null;
      }
      return JSON.parse(row.value_json) as AppSettingsValues[K];
    },
    set<K extends AppSettingsKey>(key: K, value: AppSettingsValues[K]): void {
      options.db
        .prepare(
          `insert into app_settings (key, value_json, updated_at)
           values (?, ?, ?)
           on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at`
        )
        .run(key, JSON.stringify(value), now().toISOString());
    },
    delete(key: AppSettingsKey): void {
      options.db.prepare('delete from app_settings where key = ?').run(key);
    }
  };
}
