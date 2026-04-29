import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AuditEvent, ProfileDetails } from '../../shared/types';

export function exportAuditEvents(events: AuditEvent[], exportDir: string): string {
  mkdirSync(exportDir, { recursive: true });
  const filePath = path.join(exportDir, `audit-${timestamp()}.jsonl`);
  writeFileSync(
    filePath,
    events.map((event) => JSON.stringify(redactObject(event))).join('\n') + '\n',
    'utf8'
  );
  return filePath;
}

export function exportProfiles(profiles: ProfileDetails[], exportDir: string): string {
  mkdirSync(exportDir, { recursive: true });
  const filePath = path.join(exportDir, `profiles-${timestamp()}.json`);
  const safeProfiles = profiles.map((profile) => ({
    name: profile.name,
    tags: profile.tags,
    fingerprintPolicy: profile.fingerprintPolicy,
    proxy: profile.proxy
      ? {
          scheme: profile.proxy.scheme,
          host: profile.proxy.host,
          port: profile.proxy.port,
          username: profile.proxy.username,
          bypassList: profile.proxy.bypassList
        }
      : null
  }));
  writeFileSync(filePath, JSON.stringify(safeProfiles, null, 2), 'utf8');
  return filePath;
}

export function packageSupportLogs(options: {
  exportDir: string;
  audits: AuditEvent[];
  profiles: ProfileDetails[];
  license: unknown;
}): string {
  mkdirSync(options.exportDir, { recursive: true });
  const filePath = path.join(options.exportDir, `support-${timestamp()}.json`);
  writeFileSync(
    filePath,
    JSON.stringify(
      redactObject({
        generatedAt: new Date().toISOString(),
        license: options.license,
        profileCount: options.profiles.length,
        profiles: options.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          status: profile.status,
          hasProxy: Boolean(profile.proxy)
        })),
        audits: options.audits
      }),
      null,
      2
    ),
    'utf8'
  );
  return filePath;
}

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/password|token|secret|encrypted/i.test(key)) {
          return [key, '[redacted]'];
        }
        return [key, redactObject(entry)];
      })
    );
  }
  return value;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
