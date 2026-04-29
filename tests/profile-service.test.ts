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
});
