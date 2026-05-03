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
      groupName: '项目一',
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
    expect(first.groupName).toBe('项目一');

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

  it('uses the configured current user as the audit actor', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-audit-actor-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key'),
      getAuditActor: () => 'admin@example.test'
    });

    service.createProfile({
      name: '审计用户环境'
    });

    expect(service.listAuditEvents()[0]?.actor).toBe('admin@example.test');
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
      groupName: '迁移组',
      fingerprintPolicy: migrated.fingerprintPolicy,
      runtimeChannel: 'custom-kernel',
      proxy: null
    });

    expect(updated.runtimeChannel).toBe('custom-kernel');
    expect(updated.groupName).toBe('迁移组');
    expect(service.getProfile('legacy-profile').runtimeChannel).toBe('custom-kernel');
  });

  it('normalizes supported timezones and rejects invalid timezone values', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-timezone-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });

    const profile = service.createProfile({
      name: '纽约时区环境',
      fingerprintPolicy: {
        locale: 'en-US',
        timezone: 'US/Eastern',
        windowSize: { width: 1360, height: 900 },
        permissionDefaults: 'deny',
        webrtcIpPolicy: 'disable_non_proxied_udp'
      }
    });

    expect(profile.fingerprintPolicy.timezone).toBe('America/New_York');
    expect(() =>
      service.updateProfile({
        id: profile.id,
        name: profile.name,
        groupName: profile.groupName,
        tags: profile.tags,
        fingerprintPolicy: {
          ...profile.fingerprintPolicy,
          timezone: 'Mars/Colony'
        },
        runtimeChannel: profile.runtimeChannel,
        proxy: null
      })
    ).toThrow('时区无效');
  });

  it('duplicates an environment as a clean profile with copied policy and redacted proxy credentials', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-duplicate-profile-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const secretBox = createNodeSecretBox('test-master-key');
    const service = createProfileService({
      db,
      dataDir,
      secretBox
    });

    const source = service.createProfile({
      name: '洛杉矶运营环境',
      groupName: '广告项目',
      tags: ['US', '投放'],
      runtimeChannel: 'custom-kernel',
      fingerprintPolicy: {
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        windowSize: { width: 1440, height: 900 }
      },
      proxy: {
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080,
        username: 'operator',
        password: 'copied-proxy-password',
        bypassList: ['localhost']
      }
    });

    const duplicated = service.duplicateProfile({ profileId: source.id });

    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated.name).toBe('洛杉矶运营环境 副本');
    expect(duplicated.groupName).toBe(source.groupName);
    expect(duplicated.tags).toEqual(source.tags);
    expect(duplicated.runtimeChannel).toBe(source.runtimeChannel);
    expect(duplicated.fingerprintPolicy).toEqual(source.fingerprintPolicy);
    expect(duplicated.status).toBe('closed');
    expect(duplicated.userDataDir).not.toBe(source.userDataDir);
    expect(duplicated.userDataDir).toContain(duplicated.id);
    expect(duplicated.proxyId).not.toBe(source.proxyId);
    expect(duplicated.proxy).toMatchObject({
      scheme: 'socks5',
      host: 'proxy.example.test',
      port: 1080,
      username: 'operator',
      bypassList: ['localhost'],
      lastTestStatus: 'untested'
    });
    expect(secretBox.decrypt(duplicated.proxy?.encryptedPassword ?? '')).toBe('copied-proxy-password');

    const audits = service.listAuditEvents();
    expect(audits.map((event) => event.action)).toContain('PROFILE_DUPLICATED');
    expect(JSON.stringify(audits)).toContain(source.id);
    expect(JSON.stringify(audits)).not.toContain('copied-proxy-password');
  });

  it('saves reusable profile templates and creates clean profiles from templates', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-profile-template-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const secretBox = createNodeSecretBox('test-master-key');
    const service = createProfileService({
      db,
      dataDir,
      secretBox
    });

    const source = service.createProfile({
      name: '芝加哥客服环境',
      groupName: '客服项目',
      tags: ['US', '客服'],
      runtimeChannel: 'custom-kernel',
      fingerprintPolicy: {
        locale: 'en-US',
        timezone: 'America/Chicago',
        windowSize: { width: 1360, height: 900 }
      },
      proxy: {
        scheme: 'http',
        host: 'chicago-proxy.example.test',
        port: 8080,
        username: 'agent',
        password: 'template-proxy-password',
        bypassList: ['localhost']
      }
    });

    const template = service.createTemplateFromProfile({
      profileId: source.id,
      name: '芝加哥客服模板'
    });
    const created = service.createProfileFromTemplate({
      templateId: template.id,
      name: '芝加哥客服环境 02'
    });

    expect(service.listProfileTemplates()).toHaveLength(1);
    expect(template).toMatchObject({
      name: '芝加哥客服模板',
      sourceProfileId: source.id,
      groupName: source.groupName,
      tags: source.tags,
      runtimeChannel: source.runtimeChannel,
      fingerprintPolicy: source.fingerprintPolicy,
      hasProxy: true
    });
    expect(created.id).not.toBe(source.id);
    expect(created.name).toBe('芝加哥客服环境 02');
    expect(created.groupName).toBe(source.groupName);
    expect(created.tags).toEqual(source.tags);
    expect(created.runtimeChannel).toBe(source.runtimeChannel);
    expect(created.fingerprintPolicy).toEqual(source.fingerprintPolicy);
    expect(created.status).toBe('closed');
    expect(created.userDataDir).toContain(created.id);
    expect(created.userDataDir).not.toBe(source.userDataDir);
    expect(created.proxyId).not.toBe(source.proxyId);
    expect(created.proxy).toMatchObject({
      scheme: 'http',
      host: 'chicago-proxy.example.test',
      port: 8080,
      username: 'agent',
      lastTestStatus: 'untested'
    });
    expect(secretBox.decrypt(created.proxy?.encryptedPassword ?? '')).toBe('template-proxy-password');

    const audits = service.listAuditEvents();
    expect(audits.map((event) => event.action)).toEqual(
      expect.arrayContaining(['PROFILE_TEMPLATE_CREATED', 'PROFILE_CREATED_FROM_TEMPLATE'])
    );
    expect(JSON.stringify(audits)).not.toContain('template-proxy-password');

    service.deleteProfileTemplate(template.id);
    expect(service.listProfileTemplates()).toHaveLength(0);
  });

  it('archives and restores closed profiles without deleting profile data', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-profile-archive-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });

    const profile = service.createProfile({
      name: '待归档环境',
      groupName: '清理项目',
      tags: ['archive']
    });

    const archived = service.archiveProfile(profile.id);

    expect(archived.id).toBe(profile.id);
    expect(archived.archivedAt).toMatch(/T/);
    expect(archived.userDataDir).toBe(profile.userDataDir);
    expect(service.getProfile(profile.id).archivedAt).toBe(archived.archivedAt);
    expect(service.listProfiles().find((item) => item.id === profile.id)?.archivedAt).toBe(archived.archivedAt);

    const restored = service.restoreProfile(profile.id);

    expect(restored.archivedAt).toBeNull();
    expect(restored.userDataDir).toBe(profile.userDataDir);
    expect(service.listAuditEvents().map((event) => event.action)).toEqual(
      expect.arrayContaining(['PROFILE_ARCHIVED', 'PROFILE_RESTORED'])
    );
  });

  it('blocks archiving running profiles', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-profile-archive-running-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });

    const profile = service.createProfile({
      name: '运行中环境'
    });
    service.setProfileStatus(profile.id, 'running');

    expect(() => service.archiveProfile(profile.id)).toThrow('请先关闭环境');
  });
});
