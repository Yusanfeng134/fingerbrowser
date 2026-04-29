import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  LOWERCASE_CHARS,
  NUMBER_CHARS,
  SYMBOL_CHARS,
  UPPERCASE_CHARS,
  generatePassword,
  normalizePasswordGeneratorOptions
} from '../src/renderer/src/password-generator';

function sequentialBytes(): (length: number) => Uint8Array {
  let value = 0;
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = value % 256;
      value += 1;
    }
    return bytes;
  };
}

function includesAny(value: string, chars: string): boolean {
  return [...value].some((char) => chars.includes(char));
}

describe('password generator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default strong random-password policy', () => {
    const password = generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS, sequentialBytes());

    expect(password).toHaveLength(20);
    expect(includesAny(password, LOWERCASE_CHARS)).toBe(true);
    expect(includesAny(password, UPPERCASE_CHARS)).toBe(true);
    expect(includesAny(password, NUMBER_CHARS)).toBe(true);
    expect(includesAny(password, SYMBOL_CHARS)).toBe(true);
  });

  it('clamps requested length to the supported range', () => {
    expect(normalizePasswordGeneratorOptions({ length: 4 }).length).toBe(12);
    expect(normalizePasswordGeneratorOptions({ length: 99 }).length).toBe(64);
  });

  it('respects disabled character sets while keeping lowercase enabled', () => {
    const password = generatePassword(
      {
        length: 24,
        includeUppercase: false,
        includeNumbers: false,
        includeSymbols: false
      },
      sequentialBytes()
    );

    expect(password).toHaveLength(24);
    expect([...password].every((char) => LOWERCASE_CHARS.includes(char))).toBe(true);
    expect(includesAny(password, UPPERCASE_CHARS + NUMBER_CHARS + SYMBOL_CHARS)).toBe(false);
  });

  it('does not rely on Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    expect(() => generatePassword({ length: 12 }, sequentialBytes())).not.toThrow();
  });
});
