import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEvent, AuthStatus, LaunchResult, ProfileDetails, StopResult } from '../src/shared/types';
import { createLocalApiServer } from '../src/main/domain/local-api';
import {
  createFingerBrowserMcpLocalApiClient,
  FINGERBROWSER_MCP_TOOL_NAMES,
  registerFingerBrowserMcpTools,
  resolveFingerBrowserMcpConfig
} from '../src/main/domain/mcp-local-api';

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

describe('MCP Local API bridge', () => {
  it('registers only the compliant external tools', () => {
    const registered = new Map<string, unknown>();

    registerFingerBrowserMcpTools(
      {
        registerTool(name, config, handler) {
          registered.set(name, { config, handler });
          return {};
        }
      },
      createFingerBrowserMcpLocalApiClient({
        baseUrl: 'http://127.0.0.1:17345',
        token: 'local-api-token'
      })
    );

    expect([...registered.keys()]).toEqual(FINGERBROWSER_MCP_TOOL_NAMES);
    expect([...registered.keys()].join(',')).not.toMatch(/credential|password|cookie|profile_dir|create|bulk/i);
  });

  it('calls the authenticated Local API and keeps profile results redacted', async () => {
    const launched: string[] = [];
    const stopped: string[] = [];
    const audits: AuditEvent[] = [
      {
        id: 'audit-1',
        profileId: 'profile-1',
        action: 'PROFILE_LAUNCHED',
        actor: 'local-user',
        metadata: {
          status: 'ok',
          token: 'secret-token'
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
      listAuditEvents: () => audits,
      localProxyStatus: () => []
    });
    servers.push(server);
    await server.start();
    const registered = new Map<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>();

    registerFingerBrowserMcpTools(
      {
        registerTool(name, _config, handler) {
          registered.set(name, { handler });
          return {};
        }
      },
      createFingerBrowserMcpLocalApiClient({
        baseUrl: server.status().baseUrl,
        token: 'local-api-token'
      })
    );

    const listProfiles = await registered.get('fingerbrowser_list_profiles')?.handler({});
    const launch = await registered.get('fingerbrowser_launch_profile')?.handler({ profileId: 'profile-1' });
    const audit = await registered.get('fingerbrowser_list_audit')?.handler({ profileId: 'profile-1' });

    expect(listProfiles).toMatchObject({
      structuredContent: {
        data: [
          {
            id: 'profile-1',
            name: '客户演示环境',
            proxy: {
              configured: true,
              lastTestStatus: 'passed'
            }
          }
        ]
      }
    });
    expect(JSON.stringify(listProfiles)).not.toContain('encrypted-secret');
    expect(JSON.stringify(listProfiles)).not.toContain('/tmp/private-profile-dir');
    expect(JSON.stringify(listProfiles)).not.toContain('proxy.example.test');
    expect(launch).toMatchObject({ structuredContent: { data: { profileId: 'profile-1', status: 'running' } } });
    expect(audit).toMatchObject({ structuredContent: { data: [{ metadata: { token: '[redacted]' } }] } });
    expect(launched).toEqual(['profile-1']);
    expect(stopped).toEqual([]);
  });

  it('returns MCP error content when the Local API rejects a tool call', async () => {
    const server = createLocalApiServer({
      host: '127.0.0.1',
      port: 0,
      token: 'local-api-token',
      version: () => ({ version: '0.1.0', channel: 'trial', releaseUrl: 'https://example.test/releases' }),
      authStatus,
      listProfiles: () => [],
      getProfile: () => profile(),
      launchProfile: async (profileId): Promise<LaunchResult> => ({
        profileId,
        pid: 456,
        runtimeChannel: 'official',
        status: 'running'
      }),
      stopProfile: async (profileId): Promise<StopResult> => ({ profileId, status: 'closed' }),
      listAuditEvents: () => [],
      localProxyStatus: () => []
    });
    servers.push(server);
    await server.start();
    const registered = new Map<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>();

    registerFingerBrowserMcpTools(
      {
        registerTool(name, _config, handler) {
          registered.set(name, { handler });
          return {};
        }
      },
      createFingerBrowserMcpLocalApiClient({
        baseUrl: server.status().baseUrl,
        token: 'wrong-token'
      })
    );

    await expect(registered.get('fingerbrowser_list_profiles')?.handler({})).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          message: '缺少或无效的 Local API Token'
        }
      }
    });
  });

  it('resolves external MCP configuration from token env or token file', () => {
    expect(
      resolveFingerBrowserMcpConfig({
        env: {
          FINGERBROWSER_LOCAL_API_BASE_URL: ' http://127.0.0.1:17345/ ',
          FINGERBROWSER_LOCAL_API_TOKEN: ' env-token '
        }
      })
    ).toEqual({
      baseUrl: 'http://127.0.0.1:17345',
      token: 'env-token'
    });

    expect(
      resolveFingerBrowserMcpConfig({
        env: {
          FINGERBROWSER_LOCAL_API_TOKEN_FILE: '/tmp/local-api.key'
        },
        readFile: (filePath) => {
          expect(filePath).toBe('/tmp/local-api.key');
          return ' file-token\n';
        }
      })
    ).toEqual({
      baseUrl: 'http://127.0.0.1:17345',
      token: 'file-token'
    });

    expect(
      resolveFingerBrowserMcpConfig({
        env: {
          FINGERBROWSER_DATA_DIR: '/tmp/fingerbrowser-data'
        },
        readFile: (filePath) => {
          expect(filePath).toBe('/tmp/fingerbrowser-data/local-api.key');
          return ' data-dir-token\n';
        }
      })
    ).toEqual({
      baseUrl: 'http://127.0.0.1:17345',
      token: 'data-dir-token'
    });

    expect(() => resolveFingerBrowserMcpConfig({ env: {} })).toThrow('缺少 Local API Token');
  });
});
