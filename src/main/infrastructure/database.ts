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
  `);
  return db;
}
