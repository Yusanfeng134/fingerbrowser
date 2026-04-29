import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createProfileService } from '../src/main/domain/profile-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('profile service', () => {
  it('creates isolated persistent profiles, encrypts proxy passwords, and writes audit events', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });

    const first = service.createProfile({
      name: '运营环境 A',
      tags: ['华东', '合规'],
      proxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'operator-a',
        password: 'plain-proxy-password',
        bypassList: ['localhost']
      }
    });
    const second = service.createProfile({
      name: '运营环境 B',
      tags: ['华南']
    });

    expect(first.userDataDir).not.toBe(second.userDataDir);
    expect(first.userDataDir).toContain(first.id);
    expect(second.userDataDir).toContain(second.id);
    expect(first.status).toBe('closed');
    expect(first.runtimeChannel).toBe('official');

    const storedProxy = db
      .prepare('select encrypted_password from proxies where id = ?')
      .get(first.proxyId) as { encrypted_password: string };
    expect(storedProxy.encrypted_password).not.toContain('plain-proxy-password');
    expect(storedProxy.encrypted_password).toMatch(/^v1:/);

    const audits = service.listAuditEvents();
    expect(audits.map((event) => event.action)).toEqual([
      'PROFILE_CREATED',
      'PROXY_CREATED',
      'PROFILE_CREATED'
    ]);
    expect(JSON.stringify(audits)).not.toContain('plain-proxy-password');
  });

  it('migrates legacy profiles to the official runtime channel and persists custom-kernel updates', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-runtime-migration-test-'));
    tempDirs.push(dataDir);
    const dbPath = path.join(dataDir, 'app.sqlite');
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      create table profiles (
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
      insert into profiles (
        id, name, tags_json, status, user_data_dir, chromium_version, fingerprint_policy_json, proxy_id, created_at, updated_at
      ) values (
        'legacy-profile', '旧环境', '[]', 'closed', '${path.join(dataDir, 'profiles', 'legacy-profile')}',
        'stable', '{"locale":"zh-CN","timezone":"Asia/Shanghai","windowSize":{"width":1360,"height":900},"permissionDefaults":"deny","webrtcIpPolicy":"disable_non_proxied_udp"}',
        null, '2026-04-29T00:00:00.000Z', '2026-04-29T00:00:00.000Z'
      );
    `);
    legacyDb.close();

    const db = openApplicationDatabase(dbPath);
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });
    const migrated = service.getProfile('legacy-profile');

    expect(migrated.runtimeChannel).toBe('official');

    const updated = service.updateProfile({
      id: migrated.id,
      name: migrated.name,
      tags: migrated.tags,
      fingerprintPolicy: migrated.fingerprintPolicy,
      runtimeChannel: 'custom-kernel',
      proxy: null
    });

    expect(updated.runtimeChannel).toBe('custom-kernel');
    expect(service.getProfile('legacy-profile').runtimeChannel).toBe('custom-kernel');
  });
});
