import type { FingerprintPolicy } from './types';

export const CHROMIUM_VERSION = 'stable';

export const DEFAULT_FINGERPRINT_POLICY: FingerprintPolicy = {
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  windowSize: {
    width: 1360,
    height: 900
  },
  permissionDefaults: 'deny',
  webrtcIpPolicy: 'disable_non_proxied_udp'
};
