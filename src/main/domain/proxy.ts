import net from 'node:net';
import tls from 'node:tls';
import type { ProxyConfig, ProxyConnectionInput, ProxyTestResult } from '../../shared/types';
import { normalizeTimezone } from '../../shared/timezones';

export type LogSafeProxyConfig = Omit<ProxyConfig, 'encryptedPassword'> & {
  encryptedPassword: '[encrypted]' | '';
};

export function formatProxyServer(proxy: Pick<ProxyConfig, 'scheme' | 'host' | 'port'>): string {
  return `${proxy.scheme}://${proxy.host}:${proxy.port}`;
}

export function redactProxyConfig(proxy: ProxyConfig): LogSafeProxyConfig {
  return {
    ...proxy,
    encryptedPassword: proxy.encryptedPassword ? '[encrypted]' : ''
  };
}

export function assertValidProxyEndpoint(input: ProxyConnectionInput): void {
  if (!['http', 'https', 'socks5'].includes(input.scheme)) {
    throw new Error('不支持的代理协议');
  }
  if (!input.host.trim()) {
    throw new Error('代理主机不能为空');
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('代理端口必须在 1 到 65535 之间');
  }
}

export async function testProxyConnection(input: ProxyConnectionInput): Promise<ProxyTestResult> {
  assertValidProxyEndpoint(input);
  const timeoutMs = input.timeoutMs ?? 5000;
  const testedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    const finish = (result: ProxyTestResult): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', async () => {
      socket.destroy();
      const geo = await lookupProxyGeo(input).catch(() => null);
      const expectedTimezone = input.expectedTimezone ? normalizeTimezone(input.expectedTimezone) : undefined;
      const ipTimezone = geo?.timezone ? normalizeTimezone(geo.timezone) : undefined;
      const timezoneMatch = expectedTimezone && ipTimezone ? expectedTimezone === ipTimezone : undefined;
      const consistencyMessage =
        timezoneMatch === undefined
          ? ''
          : timezoneMatch
            ? `；IP 时区 ${ipTimezone} 与环境时区一致`
            : `；IP 时区 ${ipTimezone} 与环境时区 ${expectedTimezone} 不一致`;
      finish({
        status: 'passed',
        message: `代理连通：${input.host}:${input.port}${consistencyMessage}`,
        testedAt,
        ...(geo?.ip ? { ip: geo.ip } : {}),
        ...(ipTimezone ? { ipTimezone } : {}),
        ...(timezoneMatch !== undefined ? { timezoneMatch } : {}),
        ...(geo
          ? {
              geo: {
                ...(geo.country ? { country: geo.country } : {}),
                ...(geo.region ? { region: geo.region } : {}),
                ...(geo.city ? { city: geo.city } : {})
              }
            }
          : {})
      });
    });
    socket.once('timeout', () => {
      finish({
        status: 'failed',
        message: `代理连接超时：${input.host}:${input.port}`,
        testedAt
      });
    });
    socket.once('error', (error) => {
      finish({
        status: 'failed',
        message: `代理连接失败：${error.message}`,
        testedAt
      });
    });
  });
}

interface ProxyGeoLookupResult {
  ip?: string;
  timezone?: string;
  country?: string;
  region?: string;
  city?: string;
}

async function lookupProxyGeo(input: ProxyConnectionInput): Promise<ProxyGeoLookupResult | null> {
  if (!['http', 'https'].includes(input.scheme)) {
    return null;
  }
  const response = await requestGeoThroughHttpProxy(input);
  const body = extractHttpBody(response);
  const data = JSON.parse(body) as {
    status?: string;
    query?: string;
    timezone?: string;
    country?: string;
    regionName?: string;
    city?: string;
  };
  if (data.status && data.status !== 'success') {
    return null;
  }
  if (!data.query || !data.timezone) {
    return null;
  }
  return {
    ip: data.query,
    timezone: data.timezone,
    country: data.country,
    region: data.regionName,
    city: data.city
  };
}

function requestGeoThroughHttpProxy(input: ProxyConnectionInput): Promise<string> {
  const timeoutMs = input.timeoutMs ?? 5000;
  const target = 'http://ip-api.com/json/?fields=status,message,query,country,regionName,city,timezone';
  const headers = [
    `GET ${target} HTTP/1.1`,
    'Host: ip-api.com',
    'Accept: application/json',
    'Connection: close'
  ];
  if (input.username && input.password) {
    headers.push(`Proxy-Authorization: Basic ${Buffer.from(`${input.username}:${input.password}`).toString('base64')}`);
  }
  const request = `${headers.join('\r\n')}\r\n\r\n`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket =
      input.scheme === 'https'
        ? tls.connect({ host: input.host, port: input.port, servername: input.host })
        : net.createConnection({ host: input.host, port: input.port });

    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.destroy();
    };
    const fail = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once(input.scheme === 'https' ? 'secureConnect' : 'connect', () => {
      socket.write(request);
    });
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    socket.once('end', () => {
      const response = Buffer.concat(chunks).toString('utf8');
      cleanup();
      resolve(response);
    });
    socket.once('timeout', () => fail(new Error('代理出口 IP 时区检测超时')));
    socket.once('error', fail);
  });
}

function extractHttpBody(response: string): string {
  const separator = response.indexOf('\r\n\r\n');
  if (separator < 0) {
    throw new Error('代理出口 IP 时区响应无效');
  }
  const headers = response.slice(0, separator).toLowerCase();
  const body = response.slice(separator + 4);
  if (!headers.includes('transfer-encoding: chunked')) {
    return body;
  }
  return body
    .split('\r\n')
    .filter((line, index) => index % 2 === 1 && line.length > 0)
    .join('');
}
