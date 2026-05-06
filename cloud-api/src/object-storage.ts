import type { CloudEncryptedPayload } from './types';

export interface CloudObjectStorage {
  putObject(key: string, value: CloudEncryptedPayload): void;
  getObject(key: string): CloudEncryptedPayload;
  dumpForTesting(): Record<string, CloudEncryptedPayload>;
}

export function createMemoryObjectStorage(): CloudObjectStorage {
  const objects = new Map<string, CloudEncryptedPayload>();
  return {
    putObject(key: string, value: CloudEncryptedPayload): void {
      objects.set(key, value);
    },
    getObject(key: string): CloudEncryptedPayload {
      const value = objects.get(key);
      if (!value) {
        throw new Error('profile snapshot object not found');
      }
      return value;
    },
    dumpForTesting(): Record<string, CloudEncryptedPayload> {
      return Object.fromEntries(objects.entries());
    }
  };
}
