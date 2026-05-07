export function resolveLocalApiHost(value: string | undefined): string {
  return value?.trim() || '127.0.0.1';
}

export function isLoopbackLocalApiHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function assertLocalApiExternalBindingToken(host: string, environmentToken: string | undefined): void {
  if (!isLoopbackLocalApiHost(host) && !environmentToken?.trim()) {
    throw new Error('Local API 绑定非本机地址时必须设置 FINGERBROWSER_LOCAL_API_TOKEN');
  }
}
