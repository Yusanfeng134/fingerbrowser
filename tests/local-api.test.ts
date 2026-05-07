import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEvent, AuthStatus, LaunchResult, ProfileDetails, StopResult } from '../src/shared/types';
import { createLocalApiServer, createLocalApiToken } from '../src/main/domain/local-api';

const servers: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.stop();
  }
});

function profile(input: Partial<ProfileDetails> = {}): ProfileDetails {
  return {
    id: 'profile-1',
    name: '客户演示环境',
    owner: '运营',
    notes: '试卖',
    groupName: '客户 A',
    tags: ['demo'],
    status: 'closed',
    userDataDir: '/tmp/private-profile-dir',
    chromiumVersion: 'stable',
    runtimeChannel: 'official',
    fingerprintPolicy: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      windowSize: { width: 1280, height: 860 },
      permissionDefaults: 'deny',
      webrtcIpPolicy: 'disable_non_proxied_udp'
    },
    proxyId: 'proxy-1',
    proxy: {
      id: 'proxy-1',
      scheme: 'http',
      host: 'proxy.example.test',
      port: 8080,
      username: 'operator',
      encryptedPassword: 'encrypted-secret',
      bypassList: [],
      lastTestStatus: 'passed'
    },
    lastLaunchedAt: null,
    archivedAt: null,
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...input
  };
}

function authStatus(): AuthStatus {
  return {
    bootstrapped: true,
    authenticated: true,
    currentUser: {
      id: 'user-1',
      email: 'admin@example.test',
      displayName: '管理员',
      role: 'admin',
      status: 'active',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      lastLoginAt: '2026-05-03T00:00:00.000Z'
    }
  };
}

async function jsonRequest<T>(url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

describe('local API server', () => {
  it('requires a bearer token and exposes only redacted profile fields', async () => {
    const server = createLocalApiServer({
      host: '127.0.0.1',
      port: 0,
      token: 'local-api-token',
      version: () => ({ version: '0.1.0', channel: 'trial', releaseUrl: 'https://example.test/releases' }),
      authStatus,
      listProfiles: () => [profile()],
      getProfile: () => profile(),
      launchProfile: async (profileId): Promise<LaunchResult> => ({
        profileId,
        pid: 123,
        runtimeChannel: 'official',
        status: 'running'
      }),
      stopProfile: async (profileId): Promise<StopResult> => ({ profileId, status: 'closed' }),
      listAuditEvents: () => [],
      localProxyStatus: () => [],
      pullWorkspace: async () => ({ profiles: 0, credentials: 0, auditEvents: 0 })
    });
    servers.push(server);
    await server.start();
    const baseUrl = server.status().baseUrl;

    const unauthorized = await jsonRequest<{ error: { message: string } }>(`${baseUrl}/v1/profiles`);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.message).toBe('缺少或无效的 Local API Token');

    const authorized = await jsonRequest<{ data: unknown }>(`${baseUrl}/v1/profiles`, {
      headers: { authorization: 'Bearer local-api-token' }
    });

    expect(authorized.status).toBe(200);
    expect(authorized.body).toMatchObject({
      data: [
        {
          id: 'profile-1',
          name: '客户演示环境',
          status: 'closed',
          proxy: {
            configured: true,
            lastTestStatus: 'passed'
          }
        }
      ]
    });
    expect(JSON.stringify(authorized.body)).not.toContain('encrypted-secret');
    expect(JSON.stringify(authorized.body)).not.toContain('/tmp/private-profile-dir');
    expect(JSON.stringify(authorized.body)).not.toContain('proxy.example.test');
  });

  it('launches and stops a profile through the authenticated local API', async () => {
    const launched: string[] = [];
    const stopped: string[] = [];
    const server = createLocalApiServer({
      host: '127.0.0.1',
      port: 0,
      token: 'local-api-token',
      version: () => ({ version: '0.1.0', channel: 'trial', releaseUrl: 'https://example.test/releases' }),
      authStatus,
      listProfiles: () => [profile()],
      getProfile: () => profile(),
      launchProfile: async (profileId): Promise<LaunchResult> => {
        launched.push(profileId);
        return { profileId, pid: 456, runtimeChannel: 'official', status: 'running' };
      },
      stopProfile: async (profileId): Promise<StopResult> => {
        stopped.push(profileId);
        return { profileId, status: 'closed' };
      },
      listAuditEvents: () => [],
      localProxyStatus: () => [],
      pullWorkspace: async () => ({ profiles: 0, credentials: 0, auditEvents: 0 })
    });
    servers.push(server);
    await server.start();
    const headers = { authorization: 'Bearer local-api-token' };

    const launch = await jsonRequest<{ data: LaunchResult }>(`${server.status().baseUrl}/v1/profiles/profile-1/launch`, {
      method: 'POST',
      headers
    });
    const stop = await jsonRequest<{ data: StopResult }>(`${server.status().baseUrl}/v1/profiles/profile-1/stop`, {
      method: 'POST',
      headers
    });

    expect(launch.status).toBe(200);
    expect(launch.body.data).toMatchObject({ profileId: 'profile-1', status: 'running', pid: 456 });
    expect(stop.status).toBe(200);
    expect(stop.body.data).toEqual({ profileId: 'profile-1', status: 'closed' });
    expect(launched).toEqual(['profile-1']);
    expect(stopped).toEqual(['profile-1']);
  });

  it('redacts sensitive audit metadata and creates high entropy tokens', async () => {
    const audits: AuditEvent[] = [
      {
        id: 'audit-1',
        profileId: 'profile-1',
        action: 'PROFILE_LAUNCHED',
        actor: 'local-user',
        metadata: {
          status: 'ok',
          password: 'plain-password',
          encryptedPassword: 'encrypted-value',
          nested: {
            token: 'secret-token',
            keep: 'visible'
          }
        },
        createdAt: '2026-05-03T00:00:00.000Z'
      }
    ];
    const server = createLocalApiServer({
      host: '127.0.0.1',
      port: 0,
      token: 'local-api-token',
      version: () => ({ version: '0.1.0', channel: 'trial', releaseUrl: 'https://example.test/releases' }),
      authStatus,
      listProfiles: () => [],
      getProfile: () => {
        throw new Error('环境不存在');
      },
      launchProfile: async (profileId): Promise<LaunchResult> => ({
        profileId,
        pid: 1,
        runtimeChannel: 'official',
        status: 'running'
      }),
      stopProfile: async (profileId): Promise<StopResult> => ({ profileId, status: 'closed' }),
      listAuditEvents: () => audits,
      localProxyStatus: () => [],
      pullWorkspace: async () => ({ profiles: 0, credentials: 0, auditEvents: 0 })
    });
    servers.push(server);
    await server.start();

    const response = await jsonRequest<{ data: AuditEvent[] }>(`${server.status().baseUrl}/v1/audit?profileId=profile-1`, {
      headers: { authorization: 'Bearer local-api-token' }
    });

    expect(response.status).toBe(200);
    expect(response.body.data[0].metadata).toEqual({
      status: 'ok',
      password: '[redacted]',
      encryptedPassword: '[redacted]',
      nested: {
        token: '[redacted]',
        keep: 'visible'
      }
    });
    expect(createLocalApiToken()).toMatch(/^fb_local_[A-Za-z0-9_-]{32,}$/);
  });

  it('pulls the authenticated cloud workspace without exposing create or edit routes', async () => {
    const server = createLocalApiServer({
      host: '127.0.0.1',
      port: 0,
      token: 'local-api-token',
      version: () => ({ version: '0.1.0', channel: 'trial', releaseUrl: 'https://example.test/releases' }),
      authStatus,
      listProfiles: () => [],
      getProfile: () => {
        throw new Error('环境不存在');
      },
      launchProfile: async (profileId): Promise<LaunchResult> => ({
        profileId,
        pid: 1,
        runtimeChannel: 'custom-kernel',
        status: 'running'
      }),
      stopProfile: async (profileId): Promise<StopResult> => ({ profileId, status: 'closed' }),
      listAuditEvents: () => [],
      localProxyStatus: () => [],
      pullWorkspace: async () => ({ profiles: 3, credentials: 2, auditEvents: 5 })
    });
    servers.push(server);
    await server.start();

    const pull = await jsonRequest<{ data: { profiles: number; credentials: number; auditEvents: number } }>(
      `${server.status().baseUrl}/v1/sync/pull`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer local-api-token' }
      }
    );
    const create = await jsonRequest<{ error: { message: string } }>(`${server.status().baseUrl}/v1/profiles`, {
      method: 'POST',
      headers: { authorization: 'Bearer local-api-token' }
    });

    expect(pull.status).toBe(200);
    expect(pull.body.data).toEqual({ profiles: 3, credentials: 2, auditEvents: 5 });
    expect(create.status).toBe(404);
  });
});
