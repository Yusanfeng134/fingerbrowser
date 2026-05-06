import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { CloudEncryptedPayload } from '../../../cloud-api/src/types';

const CLOUD_CIPHER_ALGORITHM = 'aes-256-gcm';
const CLOUD_SYNC_KEY_LENGTH = 32;
const CLOUD_NONCE_LENGTH = 12;

export function createTeamSyncKey(): string {
  return randomBytes(CLOUD_SYNC_KEY_LENGTH).toString('base64url');
}

export function encryptCloudPayload(plaintext: Buffer, teamKey: string): CloudEncryptedPayload {
  const key = decodeTeamSyncKey(teamKey);
  const nonce = randomBytes(CLOUD_NONCE_LENGTH);
  const cipher = createCipheriv(CLOUD_CIPHER_ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
    authTag: authTag.toString('base64url'),
    algorithm: CLOUD_CIPHER_ALGORITHM
  };
}

export function decryptCloudPayload(payload: CloudEncryptedPayload, teamKey: string): Buffer {
  if (payload.algorithm !== CLOUD_CIPHER_ALGORITHM) {
    throw new Error('不支持的云端加密算法');
  }
  const decipher = createDecipheriv(
    CLOUD_CIPHER_ALGORITHM,
    decodeTeamSyncKey(teamKey),
    Buffer.from(payload.nonce, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64url')), decipher.final()]);
}

function decodeTeamSyncKey(teamKey: string): Buffer {
  const key = Buffer.from(teamKey, 'base64url');
  if (key.length !== CLOUD_SYNC_KEY_LENGTH) {
    throw new Error('团队同步密钥无效');
  }
  return key;
}
