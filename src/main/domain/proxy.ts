import net from 'node:net';
import type { ProxyConfig, ProxyConnectionInput, ProxyTestResult } from '../../shared/types';

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
    socket.once('connect', () => {
      finish({
        status: 'passed',
        message: `代理连通：${input.host}:${input.port}`,
        testedAt
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
