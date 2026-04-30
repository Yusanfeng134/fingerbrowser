import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeCredentialSafetyLabPage } from '../src/main/domain/security-lab';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('credential safety lab', () => {
  it('writes a local-only mock page with fake credentials and no customer secrets', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-security-lab-'));
    tempDirs.push(dataDir);

    const result = writeCredentialSafetyLabPage({
      dataDir,
      profileId: 'profile-1',
      boundCredentialCount: 2
    });

    const html = readFileSync(result.filePath, 'utf8');
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.url).toMatch(/^file:\/\//);
    expect(html).toContain('本地密码安全实验');
    expect(html).toContain('lab-user@example.test');
    expect(html).toContain('LabOnly-Password-000');
    expect(html).toContain('已绑定密码项：2');
    expect(html).not.toContain('plain-password');
    expect(html).not.toContain('encrypted_password');
    expect(html).not.toContain('token');
    expect(html).not.toContain('cookie');
  });

  it('rejects path-like profile ids before writing files', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-security-lab-'));
    tempDirs.push(dataDir);

    expect(() =>
      writeCredentialSafetyLabPage({
        dataDir,
        profileId: '../profile-1',
        boundCredentialCount: 0
      })
    ).toThrow('环境编号格式无效');
  });
});
