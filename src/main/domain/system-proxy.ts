import { execFileSync } from 'node:child_process';
import type { ProxyScheme, SystemProxyCandidate, SystemProxyDetectionResult, SystemProxySource } from '../../shared/types';

type ScutilValueMap = Map<string, string>;

export function detectMacSystemProxy(): SystemProxyDetectionResult {
  if (process.platform !== 'darwin') {
    return {
      available: false,
      candidates: [],
      message: '当前系统不是 macOS，无法读取系统代理'
    };
  }
  try {
    const output = execFileSync('/usr/sbin/scutil', ['--proxy'], {
      encoding: 'utf8',
      timeout: 3000
    });
    return parseMacSystemProxy(output);
  } catch (error) {
    return {
      available: false,
      candidates: [],
      message: `读取 macOS 系统代理失败：${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

export function parseMacSystemProxy(output: string): SystemProxyDetectionResult {
  const values = parseScutilValues(output);
  const bypassList = parseExceptionsList(output);
  const candidates = [
    createCandidate(values, 'HTTP', 'http', 'http', bypassList),
    createCandidate(values, 'HTTPS', 'https', 'http', bypassList),
    createCandidate(values, 'SOCKS', 'socks5', 'socks5', bypassList)
  ].filter((candidate): candidate is SystemProxyCandidate => Boolean(candidate));
  const selected = candidates[0];
  return {
    available: Boolean(selected),
    candidates,
    ...(selected ? { selected } : {}),
    message: selected ? `已识别系统 ${selected.source.toUpperCase()} 代理 ${selected.host}:${selected.port}` : '未检测到已启用的 macOS 系统代理'
  };
}

export function explainProxyFailure(message: string): string | undefined {
  const endpoint = extractEndpoint(message);
  if (/EHOSTUNREACH|ENETUNREACH/i.test(message)) {
    return endpoint
      ? `本机无法路由到代理地址 ${endpoint}。如果你开的是 macOS 全局代理，优先导入 macOS 系统代理，通常应使用 127.0.0.1 的本地监听端口。`
      : '本机无法路由到代理地址。请确认代理主机在当前网络可达，或导入 macOS 系统代理。';
  }
  if (/ECONNREFUSED/i.test(message)) {
    return endpoint
      ? `本机代理端口 ${endpoint} 没有服务在监听。请确认代理客户端已启动，或重新导入 macOS 系统代理。`
      : '代理端口拒绝连接。请确认代理客户端已启动并监听对应端口。';
  }
  if (/SOCKS5.*认证失败|407|authentication|auth/i.test(message)) {
    return '代理认证失败。请确认代理账号密码正确；本机 Clash/Surge 这类本地代理通常不需要填写账号密码。';
  }
  if (/CONNECT|tunnel/i.test(message)) {
    return '代理 CONNECT 隧道建立失败。请确认上游代理支持 HTTPS 访问，或改用本机 HTTP/SOCKS5 代理端口。';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return '代理主机 DNS 解析失败。请检查代理主机名，或改用 127.0.0.1 本地代理端口。';
  }
  return undefined;
}

function createCandidate(
  values: ScutilValueMap,
  prefix: 'HTTP' | 'HTTPS' | 'SOCKS',
  source: SystemProxySource,
  scheme: ProxyScheme,
  bypassList: string[]
): SystemProxyCandidate | null {
  if (values.get(`${prefix}Enable`) !== '1') {
    return null;
  }
  const host = values.get(`${prefix}Proxy`)?.trim();
  const port = Number(values.get(`${prefix}Port`));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return {
    scheme,
    host,
    port,
    source,
    bypassList
  };
}

function parseScutilValues(output: string): ScutilValueMap {
  const values: ScutilValueMap = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z]+(?:Enable|Port|Proxy))\s*:\s*(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    values.set(match[1], match[2]);
  }
  return values;
}

function parseExceptionsList(output: string): string[] {
  const lines = output.split(/\r?\n/);
  const values: string[] = [];
  let inExceptions = false;
  for (const line of lines) {
    if (/^\s*ExceptionsList\s*:\s*<array>/.test(line)) {
      inExceptions = true;
      continue;
    }
    if (!inExceptions) {
      continue;
    }
    if (/^\s*}\s*$/.test(line)) {
      break;
    }
    const match = /^\s*\d+\s*:\s*(.+?)\s*$/.exec(line);
    if (match) {
      values.push(match[1]);
    }
  }
  return values;
}

function extractEndpoint(message: string): string | undefined {
  const match = /((?:\d{1,3}\.){3}\d{1,3}|localhost|[\w.-]+):(\d{1,5})/.exec(message);
  return match ? `${match[1]}:${match[2]}` : undefined;
}
