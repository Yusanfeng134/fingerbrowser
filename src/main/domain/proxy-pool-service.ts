import { randomUUID } from 'node:crypto';
import type {
  CreateProxyInput,
  CreateProxyPoolEntryInput,
  ProxyPoolEntry,
  ProxyTestResult,
  UpdateProxyPoolEntryInput
} from '../../shared/types';
import { normalizeTimezone } from '../../shared/timezones';
import type { ApplicationDatabase } from '../infrastructure/database';
import type { SecretBox } from './encryption';
import { assertValidProxyEndpoint } from './proxy';

interface ProxyPoolServiceOptions {
  db: ApplicationDatabase;
  secretBox: SecretBox;
}

interface ProxyPoolRow {
  id: string;
  name: string;
  scheme: ProxyPoolEntry['scheme'];
  host: string;
  port: number;
  username: string;
  encrypted_password: string;
  tags_json: string;
  region: string;
  timezone: string;
  bypass_list_json: string;
  last_test_status: ProxyPoolEntry['lastTestStatus'];
  last_tested_at: string | null;
  last_exit_ip: string | null;
  last_exit_timezone: string | null;
  timezone_match: 0 | 1 | null;
  created_at: string;
  updated_at: string;
}

export interface ProxyPoolService {
  listEntries(): ProxyPoolEntry[];
  getEntry(id: string): ProxyPoolEntry;
  createEntry(input: CreateProxyPoolEntryInput): ProxyPoolEntry;
  updateEntry(input: UpdateProxyPoolEntryInput): ProxyPoolEntry;
  deleteEntry(id: string): ProxyPoolEntry;
  toProfileProxyInput(id: string): CreateProxyInput;
  updateTestResult(id: string, result: ProxyTestResult): ProxyPoolEntry;
}

export function createProxyPoolService(options: ProxyPoolServiceOptions): ProxyPoolService {
  const { db, secretBox } = options;

  function normalizeTags(tags?: string[]): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  function normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new Error('代理名称不能为空');
    }
    return normalized;
  }

  function normalizeOptionalTimezone(value?: string): string {
    const trimmed = value?.trim() ?? '';
    return trimmed ? normalizeTimezone(trimmed) : '';
  }

  function countAssignedProfiles(row: Pick<ProxyPoolRow, 'scheme' | 'host' | 'port'>): number {
    const result = db
      .prepare(
        `select count(*) as count
         from profiles
         join proxies on proxies.id = profiles.proxy_id
         where proxies.scheme = ? and proxies.host = ? and proxies.port = ?`
      )
      .get(row.scheme, row.host, row.port) as { count: number };
    return result.count;
  }

  function mapEntry(row: ProxyPoolRow): ProxyPoolEntry {
    return {
      id: row.id,
      name: row.name,
      scheme: row.scheme,
      host: row.host,
      port: row.port,
      username: row.username,
      tags: JSON.parse(row.tags_json) as string[],
      region: row.region,
      timezone: row.timezone,
      bypassList: JSON.parse(row.bypass_list_json) as string[],
      lastTestStatus: row.last_test_status,
      lastTestedAt: row.last_tested_at,
      lastExitIp: row.last_exit_ip,
      lastExitTimezone: row.last_exit_timezone,
      timezoneMatch: row.timezone_match === null ? null : Boolean(row.timezone_match),
      assignedProfileCount: countAssignedProfiles(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function getRow(id: string): ProxyPoolRow {
    const row = db.prepare('select * from proxy_pool_entries where id = ?').get(id) as ProxyPoolRow | undefined;
    if (!row) {
      throw new Error('代理池条目不存在');
    }
    return row;
  }

  function normalizeInput(input: CreateProxyPoolEntryInput): Required<CreateProxyPoolEntryInput> {
    assertValidProxyEndpoint({
      scheme: input.scheme,
      host: input.host,
      port: input.port
    });
    return {
      name: normalizeName(input.name),
      scheme: input.scheme,
      host: input.host.trim(),
      port: input.port,
      username: input.username?.trim() ?? '',
      password: input.password ?? '',
      tags: normalizeTags(input.tags),
      region: input.region?.trim() ?? '',
      timezone: normalizeOptionalTimezone(input.timezone),
      bypassList: normalizeTags(input.bypassList)
    };
  }

  return {
    listEntries(): ProxyPoolEntry[] {
      const rows = db.prepare('select * from proxy_pool_entries order by updated_at desc').all() as ProxyPoolRow[];
      return rows.map(mapEntry);
    },
    getEntry(id: string): ProxyPoolEntry {
      return mapEntry(getRow(id));
    },
    createEntry(input: CreateProxyPoolEntryInput): ProxyPoolEntry {
      const normalized = normalizeInput(input);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `insert into proxy_pool_entries (
          id, name, scheme, host, port, username, encrypted_password, tags_json, region, timezone, bypass_list_json,
          last_test_status, last_tested_at, last_exit_ip, last_exit_timezone, timezone_match, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        normalized.name,
        normalized.scheme,
        normalized.host,
        normalized.port,
        normalized.username,
        secretBox.encrypt(normalized.password),
        JSON.stringify(normalized.tags),
        normalized.region,
        normalized.timezone,
        JSON.stringify(normalized.bypassList),
        'untested',
        null,
        null,
        null,
        null,
        now,
        now
      );
      return mapEntry(getRow(id));
    },
    updateEntry(input: UpdateProxyPoolEntryInput): ProxyPoolEntry {
      const existing = getRow(input.id);
      const normalized = normalizeInput(input);
      const now = new Date().toISOString();
      const encryptedPassword = normalized.password ? secretBox.encrypt(normalized.password) : existing.encrypted_password;
      db.prepare(
        `update proxy_pool_entries
         set name = ?, scheme = ?, host = ?, port = ?, username = ?, encrypted_password = ?, tags_json = ?,
             region = ?, timezone = ?, bypass_list_json = ?, updated_at = ?
         where id = ?`
      ).run(
        normalized.name,
        normalized.scheme,
        normalized.host,
        normalized.port,
        normalized.username,
        encryptedPassword,
        JSON.stringify(normalized.tags),
        normalized.region,
        normalized.timezone,
        JSON.stringify(normalized.bypassList),
        now,
        input.id
      );
      return mapEntry(getRow(input.id));
    },
    deleteEntry(id: string): ProxyPoolEntry {
      const existing = mapEntry(getRow(id));
      db.prepare('delete from proxy_pool_entries where id = ?').run(id);
      return existing;
    },
    toProfileProxyInput(id: string): CreateProxyInput {
      const row = getRow(id);
      return {
        scheme: row.scheme,
        host: row.host,
        port: row.port,
        username: row.username,
        password: secretBox.decrypt(row.encrypted_password),
        bypassList: JSON.parse(row.bypass_list_json) as string[]
      };
    },
    updateTestResult(id: string, result: ProxyTestResult): ProxyPoolEntry {
      const timezoneMatch =
        result.timezoneMatch === undefined || result.timezoneMatch === null ? null : result.timezoneMatch ? 1 : 0;
      db.prepare(
        `update proxy_pool_entries
         set last_test_status = ?, last_tested_at = ?, last_exit_ip = ?, last_exit_timezone = ?, timezone_match = ?, updated_at = ?
         where id = ?`
      ).run(
        result.status,
        result.testedAt,
        result.ip ?? null,
        result.ipTimezone ?? null,
        timezoneMatch,
        new Date().toISOString(),
        id
      );
      return mapEntry(getRow(id));
    }
  };
}
