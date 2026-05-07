import { describe, expect, it } from 'vitest';
import { assertLocalApiExternalBindingToken, isLoopbackLocalApiHost, resolveLocalApiHost } from '../src/main/domain/local-api-binding';
import { assertRuntimeChannelSupported } from '../src/main/domain/runtime-channel-policy';
import { isServerMode, resolveServerLoginInput, startServerMode } from '../src/main/server-mode';

describe('Linux server mode policy', () => {
  it('detects server mode from argv or environment', () => {
    expect(isServerMode(['/opt/FingerBrowser.AppImage', '--server'], {})).toBe(true);
    expect(isServerMode(['/opt/FingerBrowser.AppImage'], { FINGERBROWSER_SERVER_MODE: '1' })).toBe(true);
    expect(isServerMode(['/opt/FingerBrowser.AppImage'], {})).toBe(false);
  });

  it('requires cloud account credentials from safe server environment variables', () => {
    expect(
      resolveServerLoginInput({
        FINGERBROWSER_SERVER_EMAIL: ' Admin@Example.Test ',
        FINGERBROWSER_SERVER_PASSWORD: 'AdminPass123!'
      })
    ).toEqual({
      email: 'admin@example.test',
      password: 'AdminPass123!'
    });

    expect(() => resolveServerLoginInput({ FINGERBROWSER_SERVER_EMAIL: 'admin@example.test' })).toThrow(
      'FINGERBROWSER_SERVER_EMAIL 和 FINGERBROWSER_SERVER_PASSWORD'
    );
  });

  it('logs in, pulls cloud workspace, and starts Local API without a BrowserWindow dependency', async () => {
    const calls: string[] = [];
    const result = await startServerMode(
      {
        userService: {
          login: async () => {
            calls.push('login');
            return {
              bootstrapped: true,
              authenticated: true,
              currentUser: null
            };
          }
        },
        syncService: {
          pullWorkspace: async () => {
            calls.push('pull');
            return { profiles: 1, credentials: 2, auditEvents: 3 };
          }
        },
        localApiServer: {
          start: async () => {
            calls.push('local-api');
            return {
              enabled: true,
              host: '127.0.0.1',
              port: 17345,
              baseUrl: 'http://127.0.0.1:17345',
              startedAt: '2026-05-07T00:00:00.000Z'
            };
          }
        }
      },
      {
        FINGERBROWSER_SERVER_EMAIL: 'admin@example.test',
        FINGERBROWSER_SERVER_PASSWORD: 'AdminPass123!'
      },
      { info: () => undefined }
    );

    expect(calls).toEqual(['login', 'pull', 'local-api']);
    expect(result.localApi.baseUrl).toBe('http://127.0.0.1:17345');
  });

  it('keeps Local API loopback by default and requires an explicit token for external binding', () => {
    expect(resolveLocalApiHost(undefined)).toBe('127.0.0.1');
    expect(isLoopbackLocalApiHost('127.0.0.1')).toBe(true);
    expect(isLoopbackLocalApiHost('127.12.0.1')).toBe(true);
    expect(isLoopbackLocalApiHost('0.0.0.0')).toBe(false);

    expect(() => assertLocalApiExternalBindingToken('0.0.0.0', undefined)).toThrow('FINGERBROWSER_LOCAL_API_TOKEN');
    expect(() => assertLocalApiExternalBindingToken('0.0.0.0', 'server-token')).not.toThrow();
  });

  it('rejects official Chromium channel on Linux with a readable message', () => {
    expect(() => assertRuntimeChannelSupported('official', 'linux')).toThrow('Linux 服务器版仅支持自研内核');
    expect(() => assertRuntimeChannelSupported('custom-kernel', 'linux')).not.toThrow();
    expect(() => assertRuntimeChannelSupported('official', 'darwin')).not.toThrow();
  });
});
