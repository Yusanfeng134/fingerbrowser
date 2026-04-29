import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type {
  LicenseActivationPayload,
  LicensePlan,
  LicensePlanId,
  LicenseState,
  RedactedLicenseState
} from '../../shared/types';

export const LICENSE_CODE_PREFIX = 'FBLC1';
export const DEFAULT_LICENSE_GRACE_DAYS = 2;

const DEFAULT_PLANS: Record<LicensePlanId, LicensePlan> = {
  trial: {
    id: 'trial',
    name: '试用版',
    seatLimit: 1,
    profileLimit: 5,
    supportLevel: 'community'
  },
  pro: {
    id: 'pro',
    name: '专业版',
    seatLimit: 1,
    profileLimit: 50,
    supportLevel: 'standard'
  },
  team: {
    id: 'team',
    name: '团队版',
    seatLimit: 3,
    profileLimit: 200,
    supportLevel: 'priority'
  }
};

export interface CreateManualActivationCodeInput {
  signingSecret: string;
  planId: LicensePlanId;
  teamName: string;
  issuedAt: Date;
  expiresAt: Date;
  overrides?: Partial<Pick<LicensePlan, 'seatLimit' | 'profileLimit' | 'supportLevel'>>;
}

export interface EvaluateLicenseInput {
  plan: LicensePlan;
  teamName: string;
  deviceId: string;
  activationToken?: string;
  activatedAt: string;
  expiresAt: string;
  checkedAt: string;
}

export function getDefaultLicensePlan(planId: LicensePlanId): LicensePlan {
  return { ...DEFAULT_PLANS[planId] };
}

export function getDeviceFingerprint(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

export function createManualActivationCode(input: CreateManualActivationCodeInput): string {
  const basePlan = getDefaultLicensePlan(input.planId);
  const plan = {
    ...basePlan,
    ...input.overrides
  };
  const payload: LicenseActivationPayload = {
    codeId: createHash('sha256')
      .update(`${input.teamName}:${input.planId}:${input.issuedAt.toISOString()}:${input.expiresAt.toISOString()}`)
      .digest('hex')
      .slice(0, 16),
    teamName: input.teamName,
    plan,
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString()
  };
  const encodedPayload = encodeJson(payload);
  const signature = signPayload(encodedPayload, input.signingSecret);
  return `${LICENSE_CODE_PREFIX}.${encodedPayload}.${signature}`;
}

export function parseActivationCode(code: string, signingSecret: string): LicenseActivationPayload {
  const normalizedCode = normalizeActivationCode(code);
  const [prefix, encodedPayload, signature] = normalizedCode.split('.');
  if (prefix !== LICENSE_CODE_PREFIX || !encodedPayload || !signature) {
    throw new Error('激活码格式无效');
  }
  const expected = signPayload(encodedPayload, signingSecret);
  if (!safeEqual(signature, expected)) {
    throw new Error('激活码签名无效');
  }
  const payload = decodeJson<LicenseActivationPayload>(encodedPayload);
  if (!DEFAULT_PLANS[payload.plan.id]) {
    throw new Error('激活码套餐无效');
  }
  return payload;
}

function normalizeActivationCode(code: string): string {
  const compact = code.replace(/\s+/g, '');
  const activationCodePattern = new RegExp(`${LICENSE_CODE_PREFIX}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+`);
  const match = activationCodePattern.exec(compact);
  return match?.[0] ?? compact;
}

export function evaluateLicenseState(input: EvaluateLicenseInput): LicenseState {
  const checkedAt = new Date(input.checkedAt);
  const expiresAt = new Date(input.expiresAt);
  const graceUntil = addDays(expiresAt, DEFAULT_LICENSE_GRACE_DAYS);
  const daysRemaining = Math.ceil((expiresAt.getTime() - checkedAt.getTime()) / 86_400_000);
  const status = checkedAt <= expiresAt ? 'active' : checkedAt <= graceUntil ? 'grace' : 'expired';

  return {
    status,
    teamName: input.teamName,
    deviceId: input.deviceId,
    activationToken: input.activationToken,
    plan: input.plan,
    activatedAt: input.activatedAt,
    expiresAt: input.expiresAt,
    checkedAt: input.checkedAt,
    daysRemaining
  };
}

export function inactiveLicenseState(deviceId: string, checkedAt: string): LicenseState {
  return {
    status: 'inactive',
    teamName: '',
    deviceId,
    plan: getDefaultLicensePlan('trial'),
    activatedAt: '',
    expiresAt: '',
    checkedAt,
    daysRemaining: 0
  };
}

export function redactLicenseState(state: LicenseState): RedactedLicenseState {
  return {
    ...state,
    activationToken: state.activationToken ? '[redacted]' : undefined
  };
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function signPayload(encodedPayload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
