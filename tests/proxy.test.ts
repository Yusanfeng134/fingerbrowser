import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { formatProxyServer, redactProxyConfig, testProxyConnection } from '../src/main/domain/proxy';
import type { ProxyConfig } from '../src/shared/types';

const servers: net.Server[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }
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

function trackServer(server: net.Server): net.Server {
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.once('close', () => {
      const index = sockets.indexOf(socket);
      if (index >= 0) {
        sockets.splice(index, 1);
      }
    });
  });
  return server;
}

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
    const server = trackServer(net.createServer((socket) => socket.end()));
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

  it('reports IP timezone consistency when the proxy exposes geo metadata', async () => {
    const server = trackServer(net.createServer((socket) => {
      socket.once('data', () => {
        const body = JSON.stringify({
          status: 'success',
          query: '203.0.113.8',
          timezone: 'America/Los_Angeles',
          country: 'United States',
          regionName: 'California',
          city: 'Los Angeles'
        });
        socket.end(`HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      });
    }));
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
      expectedTimezone: 'Asia/Tokyo',
      timeoutMs: 1000
    });

    expect(result.status).toBe('passed');
    expect(result.ip).toBe('203.0.113.8');
    expect(result.ipTimezone).toBe('America/Los_Angeles');
    expect(result.timezoneMatch).toBe(false);
    expect(result.message).toContain('IP 时区 America/Los_Angeles 与环境时区 Asia/Tokyo 不一致');
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret|encrypted/i);
  });
});
