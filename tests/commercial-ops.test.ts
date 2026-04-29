import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAuditEvents, exportProfiles } from '../src/main/domain/commercial-ops';
import { createNodeSecretBox } from '../src/main/domain/encryption';
import { createProfileService } from '../src/main/domain/profile-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('commercial operations', () => {
  it('exports audit and profile configuration without plaintext proxy secrets', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-commercial-test-'));
    tempDirs.push(dataDir);
    const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
    const service = createProfileService({
      db,
      dataDir,
      secretBox: createNodeSecretBox('test-master-key')
    });
    service.createProfile({
      name: '商业试卖环境',
      proxy: {
        scheme: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'operator',
        password: 'plain-proxy-password'
      }
    });
    const exportDir = path.join(dataDir, 'exports');

    const auditPath = exportAuditEvents(service.listAuditEvents(), exportDir);
    const profilePath = exportProfiles(service.listProfiles(), exportDir);

    expect(readFileSync(auditPath, 'utf8')).not.toContain('plain-proxy-password');
    expect(readFileSync(profilePath, 'utf8')).not.toContain('plain-proxy-password');
    expect(readFileSync(profilePath, 'utf8')).not.toContain('encryptedPassword');
  });
});
