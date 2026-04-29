import { randomUUID } from 'node:crypto';
import type {
  CreateCredentialInput,
  CredentialCopyResult,
  CredentialEntry,
  UpdateCredentialInput
} from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';
import type { SecretBox } from './encryption';

interface CredentialServiceOptions {
  db: ApplicationDatabase;
  secretBox: SecretBox;
  writeClipboard: (value: string) => void;
}

interface CredentialRow {
  id: string;
  profile_id: string;
  title: string;
  website_url: string;
  username: string;
  encrypted_password: string;
  created_at: string;
  updated_at: string;
  last_copied_at: string | null;
}

export interface CredentialService {
  listCredentials(profileId: string): CredentialEntry[];
  countCredentials(): number;
  createCredential(input: CreateCredentialInput): CredentialEntry;
  updateCredential(input: UpdateCredentialInput): CredentialEntry;
  deleteCredential(id: string): CredentialEntry;
  copyUsername(id: string): CredentialCopyResult;
  copyPassword(id: string): CredentialCopyResult;
}

export function createCredentialService(options: CredentialServiceOptions): CredentialService {
  const { db, secretBox, writeClipboard } = options;

  function assertProfileExists(profileId: string): void {
    const profile = db.prepare('select id from profiles where id = ?').get(profileId) as { id: string } | undefined;
    if (!profile) {
      throw new Error('浏览器环境不存在');
    }
  }

  function assertValidCredential(input: Pick<CreateCredentialInput, 'title' | 'password'>, isCreate: boolean): void {
    if (!input.title.trim()) {
      throw new Error('密码名称不能为空');
    }
    if (isCreate && !input.password.trim()) {
      throw new Error('密码不能为空');
    }
  }

  function mapCredential(row: CredentialRow): CredentialEntry {
    return {
      id: row.id,
      profileId: row.profile_id,
      title: row.title,
      websiteUrl: row.website_url,
      username: row.username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCopiedAt: row.last_copied_at
    };
  }

  function getRow(id: string): CredentialRow {
    const row = db.prepare('select * from profile_credentials where id = ?').get(id) as CredentialRow | undefined;
    if (!row) {
      throw new Error('密码项不存在');
    }
    return row;
  }

  function copyCredentialValue(row: CredentialRow, value: string): CredentialCopyResult {
    const copiedAt = new Date().toISOString();
    writeClipboard(value);
    db.prepare('update profile_credentials set last_copied_at = ?, updated_at = ? where id = ?').run(copiedAt, copiedAt, row.id);
    return {
      id: row.id,
      profileId: row.profile_id,
      copiedAt
    };
  }

  return {
    listCredentials(profileId: string): CredentialEntry[] {
      assertProfileExists(profileId);
      const rows = db
        .prepare('select * from profile_credentials where profile_id = ? order by updated_at desc')
        .all(profileId) as CredentialRow[];
      return rows.map(mapCredential);
    },
    countCredentials(): number {
      const row = db.prepare('select count(*) as count from profile_credentials').get() as { count: number };
      return row.count;
    },
    createCredential(input: CreateCredentialInput): CredentialEntry {
      assertProfileExists(input.profileId);
      assertValidCredential(input, true);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into profile_credentials (
          id, profile_id, title, website_url, username, encrypted_password, created_at, updated_at, last_copied_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.profileId,
        input.title.trim(),
        input.websiteUrl.trim(),
        input.username.trim(),
        secretBox.encrypt(input.password),
        now,
        now,
        null
      );
      return mapCredential(getRow(id));
    },
    updateCredential(input: UpdateCredentialInput): CredentialEntry {
      const existing = getRow(input.id);
      assertValidCredential({ title: input.title, password: input.password ?? '' }, false);
      const now = new Date().toISOString();
      const encryptedPassword = input.password?.trim() ? secretBox.encrypt(input.password) : existing.encrypted_password;
      db.prepare(
        `update profile_credentials
         set title = ?, website_url = ?, username = ?, encrypted_password = ?, updated_at = ?
         where id = ?`
      ).run(input.title.trim(), input.websiteUrl.trim(), input.username.trim(), encryptedPassword, now, input.id);
      return mapCredential(getRow(input.id));
    },
    deleteCredential(id: string): CredentialEntry {
      const existing = getRow(id);
      db.prepare('delete from profile_credentials where id = ?').run(id);
      return mapCredential(existing);
    },
    copyUsername(id: string): CredentialCopyResult {
      const existing = getRow(id);
      return copyCredentialValue(existing, existing.username);
    },
    copyPassword(id: string): CredentialCopyResult {
      const existing = getRow(id);
      return copyCredentialValue(existing, secretBox.decrypt(existing.encrypted_password));
    }
  };
}
