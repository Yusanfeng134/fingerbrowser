import { describe, expect, it } from 'vitest';
import {
  createManualActivationCode,
  evaluateLicenseState,
  getDefaultLicensePlan,
  getDeviceFingerprint,
  parseActivationCode,
  redactLicenseState
} from '../src/main/domain/license';

const signingSecret = 'unit-test-license-secret';
const now = new Date('2026-04-29T08:00:00.000Z');

describe('license domain', () => {
  it('creates signed activation codes and verifies the payload', () => {
    const code = createManualActivationCode({
      signingSecret,
      planId: 'trial',
      teamName: '试卖团队',
      issuedAt: now,
      expiresAt: new Date('2026-05-06T08:00:00.000Z')
    });

    const parsed = parseActivationCode(code, signingSecret);

    expect(parsed.teamName).toBe('试卖团队');
    expect(parsed.plan.id).toBe('trial');
    expect(parsed.plan.seatLimit).toBe(1);
    expect(parsed.plan.profileLimit).toBe(5);
    expect(parsed.expiresAt).toBe('2026-05-06T08:00:00.000Z');
  });

  it('accepts activation codes pasted with surrounding Markdown text', () => {
    const code = createManualActivationCode({
      signingSecret,
      planId: 'trial',
      teamName: '本地调试',
      issuedAt: now,
      expiresAt: new Date('2026-05-06T08:00:00.000Z')
    });
    const pasted = `本地调试许可证：\n\n\`\`\`text\n${code}\n\`\`\``;

    const parsed = parseActivationCode(pasted, signingSecret);

    expect(parsed.teamName).toBe('本地调试');
    expect(parsed.plan.profileLimit).toBe(5);
  });

  it('rejects tampered activation codes', () => {
    const code = createManualActivationCode({
      signingSecret,
      planId: 'team',
      teamName: '试卖团队',
      issuedAt: now,
      expiresAt: new Date('2026-05-29T08:00:00.000Z')
    });
    const [prefix, payload, signature] = code.split('.');
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    const tampered = `${prefix}.${tamperedPayload}.${signature}`;

    expect(() => parseActivationCode(tampered, signingSecret)).toThrow('激活码签名无效');
  });

  it('evaluates active, grace, and expired states', () => {
    const plan = getDefaultLicensePlan('trial');
    const active = evaluateLicenseState({
      plan,
      teamName: '试卖团队',
      deviceId: 'device-a',
      activatedAt: '2026-04-29T08:00:00.000Z',
      expiresAt: '2026-05-06T08:00:00.000Z',
      checkedAt: '2026-05-05T08:00:00.000Z'
    });
    const grace = evaluateLicenseState({
      plan,
      teamName: '试卖团队',
      deviceId: 'device-a',
      activatedAt: '2026-04-29T08:00:00.000Z',
      expiresAt: '2026-05-06T08:00:00.000Z',
      checkedAt: '2026-05-07T08:00:00.000Z'
    });
    const expired = evaluateLicenseState({
      plan,
      teamName: '试卖团队',
      deviceId: 'device-a',
      activatedAt: '2026-04-29T08:00:00.000Z',
      expiresAt: '2026-05-06T08:00:00.000Z',
      checkedAt: '2026-05-10T08:00:00.000Z'
    });

    expect(active.status).toBe('active');
    expect(grace.status).toBe('grace');
    expect(expired.status).toBe('expired');
  });

  it('creates stable hashed device fingerprints', () => {
    expect(getDeviceFingerprint('mac:alice:/Users/alice')).toBe(getDeviceFingerprint('mac:alice:/Users/alice'));
    expect(getDeviceFingerprint('mac:alice:/Users/alice')).not.toBe(getDeviceFingerprint('mac:bob:/Users/bob'));
  });

  it('redacts activation tokens before logging or exporting', () => {
    const code = createManualActivationCode({
      signingSecret,
      planId: 'pro',
      teamName: '试卖团队',
      issuedAt: now,
      expiresAt: new Date('2026-05-29T08:00:00.000Z')
    });
    const state = {
      status: 'active' as const,
      teamName: '试卖团队',
      deviceId: 'device-a',
      activationToken: code,
      plan: getDefaultLicensePlan('pro'),
      activatedAt: '2026-04-29T08:00:00.000Z',
      expiresAt: '2026-05-29T08:00:00.000Z',
      checkedAt: '2026-04-29T08:00:00.000Z',
      daysRemaining: 30
    };

    expect(JSON.stringify(redactLicenseState(state))).not.toContain(code);
    expect(redactLicenseState(state).activationToken).toBe('[redacted]');
  });
});
