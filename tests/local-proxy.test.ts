import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalProxyManager } from '../src/main/domain/local-proxy';

const servers: Array<http.Server | net.Server> = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
});

function trackServer<T extends http.Server | net.Server>(server: T): T {
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.once('close', () => {
      const index = sockets.indexOf(socket);
      if (index >= 0) {
        sockets.splice(index, 1);
      }
    });
  });
  servers.push(server);
  return server;
}

async function listen(server: http.Server | net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function requestThroughLocalProxy(localPort: number, targetUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const request = http.request(
      {
        host: '127.0.0.1',
        port: localPort,
        method: 'GET',
        path: targetUrl,
        headers: {
          Host: new URL(targetUrl).host,
          Connection: 'close'
        },
        timeout: 1000
      },
      (response) => {
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    request.once('timeout', () => {
      request.destroy(new Error('request timed out'));
    });
    request.once('error', reject);
    request.end();
  });
}

async function connectTunnel(localPort: number, targetHost: string, targetPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: localPort });
    let stage: 'headers' | 'body' = 'headers';
    let buffer = Buffer.alloc(0);
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (stage === 'headers') {
        const separator = buffer.indexOf('\r\n\r\n');
        if (separator < 0) {
          return;
        }
        const headers = buffer.slice(0, separator).toString('utf8');
        if (!headers.startsWith('HTTP/1.1 200')) {
          reject(new Error(headers));
          socket.destroy();
          return;
        }
        stage = 'body';
        buffer = buffer.slice(separator + 4);
        socket.write('ping');
      }
      if (stage === 'body' && buffer.length > 0) {
        resolve(buffer.toString('utf8'));
        socket.destroy();
      }
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('tunnel timed out'));
    });
    socket.once('error', reject);
  });
}

function createHttpUpstreamProxy(expectedAuth?: string): http.Server {
  const proxy = http.createServer((clientRequest, clientResponse) => {
    if (expectedAuth) {
      expect(clientRequest.headers['proxy-authorization']).toBe(expectedAuth);
    }
    const target = new URL(clientRequest.url ?? '');
    const upstreamRequest = http.request(
      {
        host: target.hostname,
        port: Number(target.port || 80),
        method: clientRequest.method,
        path: `${target.pathname}${target.search}`,
        headers: {
          ...clientRequest.headers,
          host: target.host
        }
      },
      (upstreamResponse) => {
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(clientResponse);
      }
    );
    upstreamRequest.once('error', (error) => {
      clientResponse.writeHead(502);
      clientResponse.end(error.message);
    });
    clientRequest.pipe(upstreamRequest);
  });
  proxy.on('connect', (request, clientSocket, head) => {
    if (expectedAuth) {
      expect(request.headers['proxy-authorization']).toBe(expectedAuth);
    }
    const [host, port] = (request.url ?? '').split(':');
    const upstreamSocket = net.createConnection({ host, port: Number(port) });
    upstreamSocket.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.once('error', () => {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
  });
  return proxy;
}

function createSocks5Proxy(expectedUsername: string, expectedPassword: string): net.Server {
  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let stage: 'method' | 'auth' | 'request' | 'stream' = 'method';

    const processBuffer = (): void => {
      if (stage === 'method') {
        if (buffer.length < 2) {
          return;
        }
        const methodCount = buffer[1] ?? 0;
        if (buffer.length < 2 + methodCount) {
          return;
        }
        buffer = buffer.slice(2 + methodCount);
        socket.write(Buffer.from([0x05, 0x02]));
        stage = 'auth';
      }
      if (stage === 'auth') {
        if (buffer.length < 2) {
          return;
        }
        const usernameLength = buffer[1] ?? 0;
        if (buffer.length < 2 + usernameLength + 1) {
          return;
        }
        const passwordLength = buffer[2 + usernameLength] ?? 0;
        if (buffer.length < 3 + usernameLength + passwordLength) {
          return;
        }
        const username = buffer.slice(2, 2 + usernameLength).toString('utf8');
        const password = buffer.slice(3 + usernameLength, 3 + usernameLength + passwordLength).toString('utf8');
        buffer = buffer.slice(3 + usernameLength + passwordLength);
        const authenticated = username === expectedUsername && password === expectedPassword;
        socket.write(Buffer.from([0x01, authenticated ? 0x00 : 0x01]));
        if (!authenticated) {
          socket.destroy();
          return;
        }
        stage = 'request';
      }
      if (stage === 'request') {
        if (buffer.length < 5) {
          return;
        }
        const atyp = buffer[3];
        let host = '';
        let offset = 4;
        if (atyp === 0x03) {
          const hostLength = buffer[offset] ?? 0;
          if (buffer.length < offset + 1 + hostLength + 2) {
            return;
          }
          host = buffer.slice(offset + 1, offset + 1 + hostLength).toString('utf8');
          offset += 1 + hostLength;
        } else if (atyp === 0x01) {
          if (buffer.length < offset + 4 + 2) {
            return;
          }
          host = [...buffer.slice(offset, offset + 4)].join('.');
          offset += 4;
        } else {
          socket.destroy();
          return;
        }
        const port = buffer.readUInt16BE(offset);
        buffer = buffer.slice(offset + 2);
        const targetSocket = net.createConnection({ host, port });
        targetSocket.once('connect', () => {
          stage = 'stream';
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (buffer.length > 0) {
            targetSocket.write(buffer);
            buffer = Buffer.alloc(0);
          }
          targetSocket.pipe(socket);
          socket.pipe(targetSocket);
        });
        targetSocket.once('error', () => {
          socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.destroy();
        });
      }
    };

    socket.on('data', (chunk) => {
      if (stage === 'stream') {
        return;
      }
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      processBuffer();
    });
  });
}

describe('local proxy gateway', () => {
  it('forwards HTTP requests through an authenticated HTTP upstream proxy', async () => {
    const target = trackServer(
      http.createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('target-ok');
      })
    );
    const targetPort = await listen(target);
    const auth = `Basic ${Buffer.from('operator:secret').toString('base64')}`;
    const upstream = trackServer(createHttpUpstreamProxy(auth));
    const upstreamPort = await listen(upstream);
    const manager = new LocalProxyManager();

    const status = await manager.start('profile-1', {
      scheme: 'http',
      host: '127.0.0.1',
      port: upstreamPort,
      username: 'operator',
      password: 'secret'
    });

    await expect(requestThroughLocalProxy(status.listenPort, `http://127.0.0.1:${targetPort}/hello`)).resolves.toBe(
      'target-ok'
    );
    expect(manager.status('profile-1')?.connectionCount).toBe(1);
    await manager.stop('profile-1');
    expect(manager.statusOrStopped('profile-1').state).toBe('stopped');
  });

  it('forwards CONNECT tunnels through an HTTP upstream proxy', async () => {
    const target = trackServer(net.createServer((socket) => socket.once('data', () => socket.end('pong'))));
    const targetPort = await listen(target);
    const upstream = trackServer(createHttpUpstreamProxy());
    const upstreamPort = await listen(upstream);
    const manager = new LocalProxyManager();

    const status = await manager.start('profile-1', {
      scheme: 'http',
      host: '127.0.0.1',
      port: upstreamPort
    });

    await expect(connectTunnel(status.listenPort, '127.0.0.1', targetPort)).resolves.toBe('pong');
    expect(manager.status('profile-1')?.connectionCount).toBe(1);
    await manager.stop('profile-1');
  });

  it('uses SOCKS5 domain-name connect with username/password authentication', async () => {
    const target = trackServer(
      http.createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('socks-ok');
      })
    );
    const targetPort = await listen(target);
    const upstream = trackServer(createSocks5Proxy('operator', 'secret'));
    const upstreamPort = await listen(upstream);
    const manager = new LocalProxyManager();

    const status = await manager.start('profile-1', {
      scheme: 'socks5',
      host: '127.0.0.1',
      port: upstreamPort,
      username: 'operator',
      password: 'secret'
    });

    await expect(requestThroughLocalProxy(status.listenPort, `http://localhost:${targetPort}/hello`)).resolves.toBe('socks-ok');
    expect(manager.status('profile-1')?.connectionCount).toBe(1);
    expect(manager.status('profile-1')?.failureCount).toBe(0);
    await manager.stop('profile-1');
  });

  it('records a redacted failure when SOCKS5 authentication fails', async () => {
    const target = trackServer(
      http.createServer((_request, response) => {
        response.end('unreachable');
      })
    );
    const targetPort = await listen(target);
    const upstream = trackServer(createSocks5Proxy('operator', 'secret'));
    const upstreamPort = await listen(upstream);
    const manager = new LocalProxyManager();
    const status = await manager.start('profile-1', {
      scheme: 'socks5',
      host: '127.0.0.1',
      port: upstreamPort,
      username: 'operator',
      password: 'wrong-password'
    });

    await expect(requestThroughLocalProxy(status.listenPort, `http://localhost:${targetPort}/hello`)).resolves.toBe(
      '本地代理转发失败'
    );
    const runtimeStatus = manager.status('profile-1');
    expect(runtimeStatus?.failureCount).toBe(1);
    expect(runtimeStatus?.lastError).toMatch(/SOCKS5/);
    expect(JSON.stringify(runtimeStatus)).not.toContain('wrong-password');
    await manager.stop('profile-1');
  });
});
