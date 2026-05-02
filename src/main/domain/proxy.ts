import type { ProxyConfig, ProxyConnectionInput, ProxyTestResult } from '../../shared/types';
import { normalizeTimezone } from '../../shared/timezones';
import { requestThroughLocalProxy } from './local-proxy';
import { explainProxyFailure } from './system-proxy';

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

export async function testProxyConnection(
  input: ProxyConnectionInput,
  options: { geoLookupUrl?: string } = {}
): Promise<ProxyTestResult> {
  assertValidProxyEndpoint(input);
  const testedAt = new Date().toISOString();

  try {
    const geo = await lookupProxyGeo(input, options.geoLookupUrl);
    const expectedTimezone = input.expectedTimezone ? normalizeTimezone(input.expectedTimezone) : undefined;
    const ipTimezone = geo.timezone ? normalizeTimezone(geo.timezone) : undefined;
    const timezoneMatch = expectedTimezone && ipTimezone ? expectedTimezone === ipTimezone : undefined;
    const consistencyMessage =
      timezoneMatch === undefined
        ? ''
        : timezoneMatch
          ? `；IP 时区 ${ipTimezone} 与环境时区一致`
          : `；IP 时区 ${ipTimezone} 与环境时区 ${expectedTimezone} 不一致`;
    return {
      status: 'passed',
      message: `代理连通：${input.host}:${input.port}${consistencyMessage}`,
      testedAt,
      ...(geo.ip ? { ip: geo.ip } : {}),
      ...(ipTimezone ? { ipTimezone } : {}),
      ...(timezoneMatch !== undefined ? { timezoneMatch } : {}),
      geo: {
        ...(geo.country ? { country: geo.country } : {}),
        ...(geo.region ? { region: geo.region } : {}),
        ...(geo.city ? { city: geo.city } : {})
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误';
    const explanation = explainProxyFailure(detail);
    return {
      status: 'failed',
      message: `代理出口检测失败：${detail}${explanation ? `。${explanation}` : ''}`,
      testedAt
    };
  }
}

interface ProxyGeoLookupResult {
  ip?: string;
  timezone?: string;
  country?: string;
  region?: string;
  city?: string;
}

async function lookupProxyGeo(input: ProxyConnectionInput, geoLookupUrl?: string): Promise<ProxyGeoLookupResult> {
  const body = await requestThroughLocalProxy({
    upstream: {
      scheme: input.scheme,
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password
    },
    targetUrl: geoLookupUrl ?? 'http://ip-api.com/json/?fields=status,message,query,country,regionName,city,timezone',
    timeoutMs: input.timeoutMs ?? 5000
  });
  const data = JSON.parse(body) as {
    status?: string;
    message?: string;
    query?: string;
    timezone?: string;
    country?: string;
    regionName?: string;
    city?: string;
  };
  if (data.status && data.status !== 'success') {
    throw new Error(data.message || '出口 IP 时区服务返回失败');
  }
  if (!data.query || !data.timezone) {
    throw new Error('出口 IP 时区响应缺少 IP 或时区');
  }
  return {
    ip: data.query,
    timezone: data.timezone,
    country: data.country,
    region: data.regionName,
    city: data.city
  };
}
