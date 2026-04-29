export const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
export const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const NUMBER_CHARS = '0123456789';
export const SYMBOL_CHARS = '!@#$%^&*()-_=+[]{};:,.?';
export const PASSWORD_GENERATOR_MIN_LENGTH = 12;
export const PASSWORD_GENERATOR_MAX_LENGTH = 64;

export interface PasswordGeneratorOptions {
  length: number;
  includeUppercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
}

export type RandomBytesSource = (length: number) => Uint8Array;

export const DEFAULT_PASSWORD_GENERATOR_OPTIONS: PasswordGeneratorOptions = {
  length: 20,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true
};

export function normalizePasswordGeneratorOptions(
  options: Partial<PasswordGeneratorOptions> = {}
): PasswordGeneratorOptions {
  const requestedLength = Number.isFinite(options.length)
    ? Math.round(options.length ?? DEFAULT_PASSWORD_GENERATOR_OPTIONS.length)
    : DEFAULT_PASSWORD_GENERATOR_OPTIONS.length;
  return {
    length: Math.min(PASSWORD_GENERATOR_MAX_LENGTH, Math.max(PASSWORD_GENERATOR_MIN_LENGTH, requestedLength)),
    includeUppercase: options.includeUppercase ?? DEFAULT_PASSWORD_GENERATOR_OPTIONS.includeUppercase,
    includeNumbers: options.includeNumbers ?? DEFAULT_PASSWORD_GENERATOR_OPTIONS.includeNumbers,
    includeSymbols: options.includeSymbols ?? DEFAULT_PASSWORD_GENERATOR_OPTIONS.includeSymbols
  };
}

export function generatePassword(
  input: Partial<PasswordGeneratorOptions> = {},
  randomBytes: RandomBytesSource = secureRandomBytes
): string {
  const options = normalizePasswordGeneratorOptions(input);
  const characterSets = buildCharacterSets(options);
  const fullCharset = characterSets.join('');
  const requiredChars = characterSets.map((characterSet) => pickRandomChar(characterSet, randomBytes));
  const remainingLength = options.length - requiredChars.length;
  const remainingChars = Array.from({ length: remainingLength }, () => pickRandomChar(fullCharset, randomBytes));
  return shuffle([...requiredChars, ...remainingChars], randomBytes).join('');
}

function buildCharacterSets(options: PasswordGeneratorOptions): string[] {
  const characterSets = [LOWERCASE_CHARS];
  if (options.includeUppercase) {
    characterSets.push(UPPERCASE_CHARS);
  }
  if (options.includeNumbers) {
    characterSets.push(NUMBER_CHARS);
  }
  if (options.includeSymbols) {
    characterSets.push(SYMBOL_CHARS);
  }
  return characterSets;
}

function pickRandomChar(charset: string, randomBytes: RandomBytesSource): string {
  return charset[randomInt(charset.length, randomBytes)];
}

function shuffle(chars: string[], randomBytes: RandomBytesSource): string[] {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1, randomBytes);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars;
}

function randomInt(maxExclusive: number, randomBytes: RandomBytesSource): number {
  if (maxExclusive <= 0 || maxExclusive > 256) {
    throw new Error('随机范围无效');
  }
  const maxAccepted = Math.floor(256 / maxExclusive) * maxExclusive - 1;
  let value = randomBytes(1)[0];
  while (value > maxAccepted) {
    value = randomBytes(1)[0];
  }
  return value % maxExclusive;
}

function secureRandomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('当前环境不支持安全随机数');
  }
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
