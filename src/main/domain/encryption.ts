import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface SecretBox {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

const VERSION_PREFIX = 'v1';

export function createNodeSecretBox(masterKey: string): SecretBox {
  const key = createHash('sha256').update(masterKey).digest();

  return {
    encrypt(value: string): string {
      if (!value) {
        return '';
      }
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      return [VERSION_PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
    },
    decrypt(value: string): string {
      if (!value) {
        return '';
      }
      const [version, iv, tag, encrypted] = value.split(':');
      if (version !== VERSION_PREFIX || !iv || !tag || !encrypted) {
        throw new Error('Unsupported encrypted value format');
      }

      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    }
  };
}

export function createSafeStorageSecretBox(safeStorage: {
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}): SecretBox {
  return {
    encrypt(value: string): string {
      if (!value) {
        return '';
      }
      return `${VERSION_PREFIX}:safe:${safeStorage.encryptString(value).toString('base64url')}`;
    },
    decrypt(value: string): string {
      if (!value) {
        return '';
      }
      const [version, mode, encrypted] = value.split(':');
      if (version !== VERSION_PREFIX || mode !== 'safe' || !encrypted) {
        throw new Error('Unsupported safeStorage value format');
      }
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64url'));
    }
  };
}
