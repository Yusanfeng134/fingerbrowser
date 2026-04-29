import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeEnvironmentCheckPage } from '../src/main/domain/environment-check-page';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-check-page-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('environment check page', () => {
  it('writes a local diagnostic page and returns a file URL', () => {
    const dataDir = createTempDir();

    const result = writeEnvironmentCheckPage({ dataDir });
    const html = readFileSync(result.filePath, 'utf8');

    expect(existsSync(result.filePath)).toBe(true);
    expect(fileURLToPath(result.url)).toBe(result.filePath);
    expect(result.filePath).toBe(path.join(dataDir, 'environment-check', 'environment-check.html'));
    expect(html).toContain('合规环境自检');
    expect(html).toContain('网络');
    expect(html).toContain('WebRTC');
    expect(html).toContain('navigator.userAgent');
    expect(html).toContain('api.ipify.org');
  });

  it('does not embed local paths or sensitive values in the generated page', () => {
    const dataDir = path.join(createTempDir(), 'profile-secret-token-cache');

    const result = writeEnvironmentCheckPage({ dataDir });
    const html = readFileSync(result.filePath, 'utf8');

    expect(html).not.toContain(dataDir);
    expect(html).not.toMatch(/password|token|secret|encrypted|profile-secret-token-cache/i);
  });
});
