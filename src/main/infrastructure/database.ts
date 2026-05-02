import Database from 'better-sqlite3';

export type ApplicationDatabase = Database.Database;

export function openApplicationDatabase(filePath: string): ApplicationDatabase {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    create table if not exists profiles (
      id text primary key,
      name text not null,
      tags_json text not null,
      status text not null,
      user_data_dir text not null unique,
      chromium_version text not null,
      runtime_channel text not null default 'official',
      fingerprint_policy_json text not null,
      proxy_id text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists proxies (
      id text primary key,
      scheme text not null,
      host text not null,
      port integer not null,
      username text not null,
      encrypted_password text not null,
      bypass_list_json text not null,
      last_test_status text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists audit_events (
      id text primary key,
      profile_id text,
      action text not null,
      actor text not null,
      metadata_json text not null,
      created_at text not null
    );

    create table if not exists license_cache (
      id integer primary key check (id = 1),
      team_name text not null,
      plan_json text not null,
      device_id text not null,
      encrypted_activation_token text not null,
      activated_at text not null,
      expires_at text not null,
      last_checked_at text not null
    );

    create table if not exists profile_credentials (
      id text primary key,
      profile_id text not null,
      title text not null,
      website_url text not null,
      username text not null,
      encrypted_password text not null,
      created_at text not null,
      updated_at text not null,
      last_copied_at text
    );

    create index if not exists idx_profile_credentials_profile_id on profile_credentials(profile_id);

    create table if not exists credentials (
      id text primary key,
      profile_id text,
      title text not null,
      website_url text not null,
      username text not null,
      encrypted_password text not null,
      created_at text not null,
      updated_at text not null,
      last_copied_at text
    );

    create index if not exists idx_credentials_profile_id on credentials(profile_id);

    create table if not exists desktop_shortcuts (
      id text primary key,
      profile_id text not null unique,
      icon_variant text not null,
      position_index integer not null,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_desktop_shortcuts_position on desktop_shortcuts(position_index, created_at);

    insert or ignore into credentials (
      id, profile_id, title, website_url, username, encrypted_password, created_at, updated_at, last_copied_at
    )
    select id, profile_id, title, website_url, username, encrypted_password, created_at, updated_at, last_copied_at
    from profile_credentials;

    create table if not exists trial_metrics (
      key text primary key,
      value integer not null,
      updated_at text not null
    );

    create table if not exists onboarding_state (
      id integer primary key check (id = 1),
      dismissed_at text
    );

    create table if not exists app_settings (
      key text primary key,
      value_json text not null,
      updated_at text not null
    );
  `);
  const profileColumns = db.pragma('table_info(profiles)') as Array<{ name: string }>;
  if (!profileColumns.some((column) => column.name === 'runtime_channel')) {
    db.exec("alter table profiles add column runtime_channel text not null default 'official';");
  }
  return db;
}
