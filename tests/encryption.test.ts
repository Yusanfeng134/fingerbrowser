import { describe, expect, it } from 'vitest';
import { createNodeSecretBox } from '../src/main/domain/encryption';

describe('secret encryption', () => {
  it('encrypts sensitive values without storing plaintext', () => {
    const box = createNodeSecretBox('unit-test-master-key');

    const encrypted = box.encrypt('proxy-secret-password');

    expect(encrypted).not.toContain('proxy-secret-password');
    expect(encrypted).toMatch(/^v1:/);
    expect(box.decrypt(encrypted)).toBe('proxy-secret-password');
  });
});
