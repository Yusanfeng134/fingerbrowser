import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { formatProxyServer, redactProxyConfig, testProxyConnection } from '../src/main/domain/proxy';
import type { ProxyConfig } from '../src/shared/types';

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
  servers.length = 0;
});

describe('proxy configuration', () => {
  it('formats Chromium proxy server arguments without credentials', () => {
    const proxy: ProxyConfig = {
      id: 'proxy-1',
      scheme: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: 'operator',
      encryptedPassword: 'encrypted-secret',
      bypassList: ['localhost'],
      lastTestStatus: 'untested'
    };

    expect(formatProxyServer(proxy)).toBe('http://127.0.0.1:8080');
  });

  it('redacts encrypted credentials from log-safe objects', () => {
    const proxy: ProxyConfig = {
      id: 'proxy-1',
      scheme: 'socks5',
      host: '10.0.0.8',
      port: 1080,
      username: 'operator',
      encryptedPassword: 'encrypted-secret',
      bypassList: [],
      lastTestStatus: 'passed'
    };

    expect(JSON.stringify(redactProxyConfig(proxy))).not.toContain('encrypted-secret');
    expect(redactProxyConfig(proxy).encryptedPassword).toBe('[encrypted]');
  });

  it('checks basic TCP reachability for a proxy endpoint', async () => {
    const server = net.createServer((socket) => socket.end());
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP address');
    }

    const result = await testProxyConnection({
      scheme: 'http',
      host: '127.0.0.1',
      port: address.port,
      timeoutMs: 1000
    });

    expect(result.status).toBe('passed');
    expect(result.message).toContain('代理连通');
  });
});
