import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createProxyPoolService } from '../src/main/domain/proxy-pool-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-proxy-pool-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const secretBox = createNodeSecretBox('proxy-pool-test-master-key');
  const proxyPoolService = createProxyPoolService({ db, secretBox });
  return { db, proxyPoolService };
}

describe('proxy pool service', () => {
  it('stores proxy pool credentials encrypted and returns redacted list entries', () => {
    const { db, proxyPoolService } = createHarness();

    const entry = proxyPoolService.createEntry({
      name: '洛杉矶住宅代理',
      scheme: 'socks5',
      host: 'proxy.example.test',
      port: 1080,
      username: 'operator',
      password: 'proxy-secret',
      tags: ['US', '住宅'],
      region: 'US-CA',
      timezone: 'America/Los_Angeles',
      bypassList: ['localhost']
    });
    const stored = db.prepare('select encrypted_password from proxy_pool_entries where id = ?').get(entry.id) as {
      encrypted_password: string;
    };

    expect(entry).toMatchObject({
      name: '洛杉矶住宅代理',
      scheme: 'socks5',
      host: 'proxy.example.test',
      port: 1080,
      username: 'operator',
      tags: ['US', '住宅'],
      region: 'US-CA',
      timezone: 'America/Los_Angeles',
      bypassList: ['localhost'],
      lastTestStatus: 'untested'
    });
    expect(stored.encrypted_password).toMatch(/^v1:/);
    expect(stored.encrypted_password).not.toContain('proxy-secret');
    expect(JSON.stringify(proxyPoolService.listEntries())).not.toContain('proxy-secret');
    expect(JSON.stringify(proxyPoolService.listEntries())).not.toContain('encryptedPassword');
  });

  it('preserves the stored password when updating with a blank password', () => {
    const { db, proxyPoolService } = createHarness();
    const entry = proxyPoolService.createEntry({
      name: '东京代理',
      scheme: 'http',
      host: 'tokyo.example.test',
      port: 8080,
      username: 'tokyo-user',
      password: 'original-secret',
      tags: ['JP'],
      timezone: 'Asia/Tokyo'
    });
    const before = db.prepare('select encrypted_password from proxy_pool_entries where id = ?').get(entry.id) as {
      encrypted_password: string;
    };

    const updated = proxyPoolService.updateEntry({
      id: entry.id,
      name: '东京代理更新',
      scheme: 'https',
      host: 'tokyo-new.example.test',
      port: 8443,
      username: 'tokyo-user-new',
      password: '',
      tags: ['JP', '静态'],
      region: 'JP-13',
      timezone: 'Asia/Tokyo',
      bypassList: ['localhost', '127.0.0.1']
    });
    const after = db.prepare('select encrypted_password from proxy_pool_entries where id = ?').get(entry.id) as {
      encrypted_password: string;
    };

    expect(after.encrypted_password).toBe(before.encrypted_password);
    expect(updated).toMatchObject({
      name: '东京代理更新',
      scheme: 'https',
      host: 'tokyo-new.example.test',
      port: 8443,
      username: 'tokyo-user-new',
      tags: ['JP', '静态'],
      region: 'JP-13',
      bypassList: ['localhost', '127.0.0.1']
    });
  });

  it('builds a profile proxy input with decrypted credentials and records test metadata', () => {
    const { proxyPoolService } = createHarness();
    const entry = proxyPoolService.createEntry({
      name: '芝加哥代理',
      scheme: 'http',
      host: 'chicago.example.test',
      port: 8080,
      username: 'chicago-user',
      password: 'chicago-secret',
      tags: ['US'],
      timezone: 'America/Chicago'
    });

    proxyPoolService.updateTestResult(entry.id, {
      status: 'passed',
      message: '代理连通',
      testedAt: '2026-05-03T00:00:00.000Z',
      ip: '203.0.113.8',
      ipTimezone: 'America/Chicago',
      timezoneMatch: true
    });

    expect(proxyPoolService.toProfileProxyInput(entry.id)).toEqual({
      scheme: 'http',
      host: 'chicago.example.test',
      port: 8080,
      username: 'chicago-user',
      password: 'chicago-secret',
      bypassList: []
    });
    expect(proxyPoolService.getEntry(entry.id)).toMatchObject({
      lastTestStatus: 'passed',
      lastExitIp: '203.0.113.8',
      lastExitTimezone: 'America/Chicago',
      timezoneMatch: true
    });
  });
});
