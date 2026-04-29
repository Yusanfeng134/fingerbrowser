import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository security guardrails', () => {
  it('ignores generated dependencies, runtime data, profiles, Chromium cache, and local secrets', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('dist/');
    expect(gitignore).toContain('.superpowers/');
    expect(gitignore).toContain('profiles/');
    expect(gitignore).toContain('chromium/');
    expect(gitignore).toContain('*.key');
    expect(gitignore).toContain('*.sqlite');
  });
});
