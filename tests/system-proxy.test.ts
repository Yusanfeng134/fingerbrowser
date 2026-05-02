import { describe, expect, it } from 'vitest';
import { explainProxyFailure, parseMacSystemProxy } from '../src/main/domain/system-proxy';

const scutilWithHttpAndSocks = `<dictionary> {
  ExceptionsList : <array> {
    0 : localhost
    1 : 127.0.0.1
    2 : *.local
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7891
  SOCKSProxy : 127.0.0.1
}`;

const scutilWithHttpsOnly = `<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 1
  HTTPSPort : 15106
  HTTPSProxy : 10.0.0.68
}`;

describe('macOS system proxy detection', () => {
  it('prefers enabled HTTP proxy and carries bypass entries', () => {
    const result = parseMacSystemProxy(scutilWithHttpAndSocks);

    expect(result.selected).toMatchObject({
      scheme: 'http',
      host: '127.0.0.1',
      port: 7890,
      source: 'http'
    });
    expect(result.candidates).toContainEqual(
      expect.objectContaining({ scheme: 'socks5', host: '127.0.0.1', port: 7891, source: 'socks5' })
    );
    expect(result.selected?.bypassList).toEqual(['localhost', '127.0.0.1', '*.local']);
    expect(result.message).toContain('已识别系统 HTTP 代理');
  });

  it('treats macOS HTTPS proxy as an HTTP CONNECT proxy for Chromium', () => {
    const result = parseMacSystemProxy(scutilWithHttpsOnly);

    expect(result.selected).toMatchObject({
      scheme: 'http',
      host: '10.0.0.68',
      port: 15106,
      source: 'https'
    });
  });

  it('returns a readable empty result when no system proxy is enabled', () => {
    const result = parseMacSystemProxy(`<dictionary> {
      HTTPEnable : 0
      HTTPSEnable : 0
      SOCKSEnable : 0
    }`);

    expect(result.available).toBe(false);
    expect(result.selected).toBeUndefined();
    expect(result.message).toBe('未检测到已启用的 macOS 系统代理');
  });
});

describe('proxy failure explanations', () => {
  it('explains unreachable private network proxy addresses', () => {
    const explanation = explainProxyFailure(
      '代理出口检测失败：connect EHOSTUNREACH 10.0.0.68:15106 - Local (10.100.1.39:62359)'
    );

    expect(explanation).toContain('本机无法路由到代理地址 10.0.0.68:15106');
    expect(explanation).toContain('优先导入 macOS 系统代理');
  });

  it('explains refused local proxy ports', () => {
    const explanation = explainProxyFailure('connect ECONNREFUSED 127.0.0.1:7890');

    expect(explanation).toContain('本机代理端口 127.0.0.1:7890 没有服务在监听');
  });
});
