import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import type { ProxyRuntimeStatus, ProxyScheme } from '../../shared/types';

export interface LocalProxyUpstream {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

interface LocalProxyRuntime {
  server: http.Server;
  sockets: Set<net.Socket>;
  status: ProxyRuntimeStatus;
  upstream: LocalProxyUpstream;
}

const LISTEN_HOST = '127.0.0.1';

export class LocalProxyManager {
  private readonly runtimes = new Map<string, LocalProxyRuntime>();

  async start(profileId: string, upstream: LocalProxyUpstream): Promise<ProxyRuntimeStatus> {
    await this.stop(profileId);

    const sockets = new Set<net.Socket>();
    const status: ProxyRuntimeStatus = {
      profileId,
      state: 'running',
      listenHost: LISTEN_HOST,
      listenPort: 0,
      upstreamScheme: upstream.scheme,
      upstreamHost: upstream.host,
      startedAt: new Date().toISOString(),
      connectionCount: 0,
      failureCount: 0
    };
    const server = http.createServer();
    const runtime: LocalProxyRuntime = { server, sockets, status, upstream };

    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    server.on('request', (request, response) => {
      void this.handleHttpRequest(runtime, request, response);
    });
    server.on('connect', (request, clientSocket, head) => {
      void this.handleConnectRequest(runtime, request, clientSocket as net.Socket, head);
    });
    server.on('error', (error) => {
      this.recordFailure(runtime, error);
    });

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        server.off('listening', resolve);
        reject(error);
      };
      server.once('error', fail);
      server.once('listening', () => {
        server.off('error', fail);
        resolve();
      });
      server.listen(0, LISTEN_HOST);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      await this.stop(profileId);
      throw new Error('本地代理监听失败');
    }
    status.listenPort = address.port;
    this.runtimes.set(profileId, runtime);
    return { ...status };
  }

  async stop(profileId: string): Promise<ProxyRuntimeStatus> {
    const runtime = this.runtimes.get(profileId);
    if (!runtime) {
      return this.stoppedStatus(profileId);
    }
    this.runtimes.delete(profileId);
    for (const socket of runtime.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      runtime.server.close(() => resolve());
    });
    runtime.status.state = 'stopped';
    runtime.status.startedAt = null;
    return { ...runtime.status };
  }

  status(profileId: string): ProxyRuntimeStatus | undefined {
    const runtime = this.runtimes.get(profileId);
    if (!runtime) {
      return undefined;
    }
    return { ...runtime.status };
  }

  statusOrStopped(profileId: string): ProxyRuntimeStatus {
    return this.status(profileId) ?? this.stoppedStatus(profileId);
  }

  listStatuses(): ProxyRuntimeStatus[] {
    return [...this.runtimes.values()].map((runtime) => ({ ...runtime.status }));
  }

  updateExitMetadata(
    profileId: string,
    metadata: { ip?: string; ipTimezone?: string; timezoneMatch?: boolean; error?: string }
  ): void {
    const runtime = this.runtimes.get(profileId);
    if (!runtime) {
      return;
    }
    if (metadata.ip) {
      runtime.status.lastExitIp = metadata.ip;
    }
    if (metadata.ipTimezone) {
      runtime.status.lastExitTimezone = metadata.ipTimezone;
    }
    if (metadata.timezoneMatch !== undefined) {
      runtime.status.timezoneMatch = metadata.timezoneMatch;
    }
    if (metadata.error) {
      runtime.status.lastError = metadata.error;
    }
  }

  private stoppedStatus(profileId: string): ProxyRuntimeStatus {
    return {
      profileId,
      state: 'stopped',
      listenHost: LISTEN_HOST,
      listenPort: 0,
      startedAt: null,
      connectionCount: 0,
      failureCount: 0
    };
  }

  private async handleHttpRequest(
    runtime: LocalProxyRuntime,
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    runtime.status.connectionCount += 1;
    try {
      const target = resolveHttpTarget(request);
      if (runtime.upstream.scheme === 'socks5') {
        await this.forwardHttpThroughSocks(runtime, request, response, target);
        return;
      }
      await this.forwardHttpThroughHttpProxy(runtime, request, response, target);
    } catch (error) {
      this.recordFailure(runtime, error);
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      response.end('本地代理转发失败');
    }
  }

  private async handleConnectRequest(
    runtime: LocalProxyRuntime,
    request: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ): Promise<void> {
    runtime.status.connectionCount += 1;
    try {
      const { host, port } = parseHostPort(request.url ?? '');
      const upstreamSocket =
        runtime.upstream.scheme === 'socks5'
          ? await connectSocks5(runtime.upstream, host, port)
          : await connectHttpTunnel(runtime.upstream, host, port);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
      const cleanup = (): void => {
        upstreamSocket.destroy();
      };
      clientSocket.once('error', cleanup);
      clientSocket.once('close', cleanup);
    } catch (error) {
      this.recordFailure(runtime, error);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  }

  private forwardHttpThroughHttpProxy(
    runtime: LocalProxyRuntime,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    target: URL
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestModule = runtime.upstream.scheme === 'https' ? https : http;
      const requestOptions: http.RequestOptions & { rejectUnauthorized?: boolean } = {
        host: runtime.upstream.host,
        port: runtime.upstream.port,
        method: request.method,
        path: target.toString(),
        headers: buildProxyHeaders(request.headers, runtime.upstream, target),
        rejectUnauthorized: false
      };
      const proxyRequest = requestModule.request(
        requestOptions,
        (proxyResponse) => {
          response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
          proxyResponse.pipe(response);
          proxyResponse.once('end', resolve);
        }
      );
      proxyRequest.once('error', reject);
      request.pipe(proxyRequest);
    });
  }

  private async forwardHttpThroughSocks(
    runtime: LocalProxyRuntime,
    request: http.IncomingMessage,
    response: http.ServerResponse,
    target: URL
  ): Promise<void> {
    const targetPort = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    const socksSocket = await connectSocks5(runtime.upstream, target.hostname, targetPort);
    await new Promise<void>((resolve, reject) => {
      const proxyRequest = http.request(
        {
          host: target.hostname,
          port: targetPort,
          method: request.method,
          path: `${target.pathname}${target.search}`,
          headers: buildDirectHeaders(request.headers, target),
          createConnection: () => socksSocket
        },
        (proxyResponse) => {
          response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
          proxyResponse.pipe(response);
          proxyResponse.once('end', resolve);
        }
      );
      proxyRequest.once('error', reject);
      request.pipe(proxyRequest);
    });
  }

  private recordFailure(runtime: LocalProxyRuntime, error: unknown): void {
    runtime.status.failureCount += 1;
    runtime.status.state = 'error';
    runtime.status.lastError = error instanceof Error ? error.message : '本地代理错误';
  }
}

export async function requestThroughLocalProxy(options: {
  upstream: LocalProxyUpstream;
  targetUrl: string;
  timeoutMs?: number;
}): Promise<string> {
  const manager = new LocalProxyManager();
  const profileId = 'proxy-test';
  const status = await manager.start(profileId, options.upstream);
  try {
    return await requestHttpViaProxy(status.listenPort, options.targetUrl, options.timeoutMs ?? 5000);
  } catch (error) {
    const lastError = manager.status(profileId)?.lastError;
    if (lastError) {
      throw new Error(lastError);
    }
    throw error;
  } finally {
    await manager.stop(profileId);
  }
}

function resolveHttpTarget(request: http.IncomingMessage): URL {
  const requestUrl = request.url ?? '';
  if (/^https?:\/\//i.test(requestUrl)) {
    return new URL(requestUrl);
  }
  const host = request.headers.host;
  if (!host) {
    throw new Error('代理请求缺少 Host');
  }
  return new URL(`http://${host}${requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`}`);
}

function parseHostPort(value: string): { host: string; port: number } {
  const separator = value.lastIndexOf(':');
  if (separator < 1) {
    throw new Error('CONNECT 目标无效');
  }
  const host = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONNECT 目标无效');
  }
  return { host, port };
}

function buildProxyHeaders(
  headers: http.IncomingHttpHeaders,
  upstream: LocalProxyUpstream,
  target: URL
): http.OutgoingHttpHeaders {
  const nextHeaders = buildDirectHeaders(headers, target);
  const authorization = proxyAuthorization(upstream);
  if (authorization) {
    nextHeaders['proxy-authorization'] = authorization;
  }
  return nextHeaders;
}

function buildDirectHeaders(headers: http.IncomingHttpHeaders, target: URL): http.OutgoingHttpHeaders {
  const nextHeaders: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (['proxy-authorization', 'proxy-connection', 'connection'].includes(key.toLowerCase())) {
      continue;
    }
    nextHeaders[key] = value;
  }
  nextHeaders.host = target.host;
  return nextHeaders;
}

function proxyAuthorization(upstream: LocalProxyUpstream): string | undefined {
  if (!upstream.username || !upstream.password) {
    return undefined;
  }
  return `Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}`;
}

function connectToUpstream(upstream: LocalProxyUpstream): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      upstream.scheme === 'https'
        ? tls.connect({
            host: upstream.host,
            port: upstream.port,
            servername: upstream.host,
            rejectUnauthorized: false
          })
        : net.createConnection({ host: upstream.host, port: upstream.port });
    socket.setTimeout(5000);
    socket.once(upstream.scheme === 'https' ? 'secureConnect' : 'connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('上游代理连接超时'));
    });
    socket.once('error', reject);
  });
}

async function connectHttpTunnel(upstream: LocalProxyUpstream, host: string, port: number): Promise<net.Socket> {
  const socket = await connectToUpstream(upstream);
  const headers = [`CONNECT ${host}:${port} HTTP/1.1`, `Host: ${host}:${port}`, 'Proxy-Connection: Keep-Alive'];
  const authorization = proxyAuthorization(upstream);
  if (authorization) {
    headers.push(`Proxy-Authorization: ${authorization}`);
  }
  socket.write(`${headers.join('\r\n')}\r\n\r\n`);
  const { header, rest } = await readHttpHeader(socket);
  if (!/^HTTP\/1\.[01] 2\d\d/i.test(header)) {
    socket.destroy();
    throw new Error('上游代理 CONNECT 失败');
  }
  if (rest.length > 0) {
    socket.unshift(rest);
  }
  return socket;
}

function connectSocks5(upstream: LocalProxyUpstream, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: upstream.host, port: upstream.port });
    let buffer = Buffer.alloc(0);
    let stage: 'method' | 'auth' | 'request' = 'method';
    const fail = (error: Error): void => {
      socket.removeAllListeners();
      socket.destroy();
      reject(error);
    };
    const processBuffer = (): void => {
      if (stage === 'method') {
        if (buffer.length < 2) {
          return;
        }
        const selectedMethod = buffer[1];
        buffer = buffer.slice(2);
        if (selectedMethod === 0x02) {
          if (!upstream.username || !upstream.password) {
            fail(new Error('SOCKS5 代理需要用户名密码'));
            return;
          }
          socket.write(encodeSocksAuth(upstream.username, upstream.password));
          stage = 'auth';
          processBuffer();
          return;
        }
        if (selectedMethod !== 0x00) {
          fail(new Error('SOCKS5 代理不支持可用认证方式'));
          return;
        }
        socket.write(encodeSocksConnect(host, port));
        stage = 'request';
      }
      if (stage === 'auth') {
        if (buffer.length < 2) {
          return;
        }
        const status = buffer[1];
        buffer = buffer.slice(2);
        if (status !== 0x00) {
          fail(new Error('SOCKS5 用户名或密码认证失败'));
          return;
        }
        socket.write(encodeSocksConnect(host, port));
        stage = 'request';
      }
      if (stage === 'request') {
        if (buffer.length < 5) {
          return;
        }
        const reply = buffer[1];
        const atyp = buffer[3];
        let length = 0;
        if (atyp === 0x01) {
          length = 10;
        } else if (atyp === 0x03) {
          length = 7 + (buffer[4] ?? 0);
        } else if (atyp === 0x04) {
          length = 22;
        } else {
          fail(new Error('SOCKS5 响应地址类型无效'));
          return;
        }
        if (buffer.length < length) {
          return;
        }
        const rest = buffer.slice(length);
        if (reply !== 0x00) {
          fail(new Error(`SOCKS5 连接失败：${reply}`));
          return;
        }
        socket.removeAllListeners('data');
        socket.removeAllListeners('timeout');
        socket.removeAllListeners('error');
        socket.setTimeout(0);
        if (rest.length > 0) {
          socket.unshift(rest);
        }
        resolve(socket);
      }
    };

    socket.setTimeout(5000);
    socket.once('connect', () => {
      socket.write(upstream.username ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      processBuffer();
    });
    socket.once('timeout', () => fail(new Error('SOCKS5 连接超时')));
    socket.once('error', fail);
  });
}

function encodeSocksAuth(username: string, password: string): Buffer {
  const usernameBuffer = Buffer.from(username);
  const passwordBuffer = Buffer.from(password);
  if (usernameBuffer.length > 255 || passwordBuffer.length > 255) {
    throw new Error('SOCKS5 用户名或密码过长');
  }
  return Buffer.concat([
    Buffer.from([0x01, usernameBuffer.length]),
    usernameBuffer,
    Buffer.from([passwordBuffer.length]),
    passwordBuffer
  ]);
}

function encodeSocksConnect(host: string, port: number): Buffer {
  const hostBuffer = Buffer.from(host);
  if (hostBuffer.length > 255) {
    throw new Error('SOCKS5 目标主机过长');
  }
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(port);
  return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]), hostBuffer, portBuffer]);
}

function readHttpHeader(socket: net.Socket): Promise<{ header: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const cleanup = (): void => {
      socket.off('data', onData);
      socket.off('timeout', onTimeout);
      socket.off('error', reject);
    };
    const onTimeout = (): void => {
      cleanup();
      reject(new Error('上游代理响应超时'));
    };
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      const separator = buffer.indexOf('\r\n\r\n');
      if (separator < 0) {
        return;
      }
      cleanup();
      resolve({
        header: buffer.slice(0, separator).toString('utf8'),
        rest: buffer.slice(separator + 4)
      });
    };
    socket.setTimeout(5000);
    socket.on('data', onData);
    socket.once('timeout', onTimeout);
    socket.once('error', reject);
  });
}

function requestHttpViaProxy(localPort: number, targetUrl: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const request = http.request(
      {
        host: LISTEN_HOST,
        port: localPort,
        method: 'GET',
        path: targetUrl,
        headers: {
          Host: new URL(targetUrl).host,
          Accept: 'application/json',
          Connection: 'close'
        },
        timeout: timeoutMs
      },
      (response) => {
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.once('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(body || `HTTP ${response.statusCode}`));
            return;
          }
          resolve(body);
        });
      }
    );
    request.once('timeout', () => {
      request.destroy(new Error('代理出口 IP 时区检测超时'));
    });
    request.once('error', reject);
    request.end();
  });
}
