import type { RuntimeChannel } from '../../shared/types';

export function assertRuntimeChannelSupported(runtimeChannel: RuntimeChannel, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'linux' && runtimeChannel === 'official') {
    throw new Error('Linux 服务器版仅支持自研内核，请将环境运行通道改为自研内核后再启动');
  }
}

export function defaultRuntimeChannelForPlatform(platform: NodeJS.Platform = process.platform): RuntimeChannel {
  return platform === 'linux' ? 'custom-kernel' : 'official';
}
