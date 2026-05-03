import type { LaunchResult, ProfileDetails, ProxyTestResult, StopResult } from '../../shared/types';
import type { ApplicationServices } from '../services';
import { testProxyConnection } from './proxy';

export async function launchProfileRuntime(
  services: ApplicationServices,
  profileId: string
): Promise<LaunchResult> {
  const profile = services.profileService.getProfile(profileId);
  if (profile.archivedAt) {
    throw new Error('请先恢复环境再启动');
  }
  const credentialStartUrls = services.credentialService.listLaunchUrlsForProfile(profileId);
  const proxyDiagnostic = await createLaunchProxyDiagnostic(services, profile);
  const result = await services.browserController.launch(profile, profile.proxy, {
    startUrls: credentialStartUrls,
    proxyDiagnostic,
    googleApiEnvironment: services.googleAccountService.runtimeEnvironment(profile.runtimeChannel)
  });
  services.profileService.setProfileStatus(profileId, 'running');
  if (result.runtimeChannel === 'custom-kernel') {
    services.profileService.recordAudit(profileId, 'KERNEL_POLICY_APPLIED', {
      runtimeChannel: result.runtimeChannel,
      kernelVersion: result.kernelVersion
    });
    services.profileService.recordAudit(profileId, 'KERNEL_LAUNCHED', {
      runtimeChannel: result.runtimeChannel,
      kernelVersion: result.kernelVersion
    });
  }
  if (result.localProxy) {
    services.profileService.recordAudit(profileId, 'LOCAL_PROXY_STARTED', {
      listenHost: result.localProxy.listenHost,
      listenPort: result.localProxy.listenPort,
      upstreamScheme: result.localProxy.upstreamScheme
    });
  }
  services.profileService.recordAudit(profileId, 'PROFILE_LAUNCHED', {
    pid: result.pid,
    runtimeChannel: result.runtimeChannel,
    credentialUrlCount: credentialStartUrls.length,
    localProxyEnabled: Boolean(result.localProxy),
    upstreamScheme: result.localProxy?.upstreamScheme,
    proxyDiagnosticStatus: proxyDiagnostic?.status,
    proxyDiagnosticIpTimezone: proxyDiagnostic?.ipTimezone,
    proxyDiagnosticTimezoneMatch: proxyDiagnostic?.timezoneMatch
  });
  services.trialService.incrementMetric('browserLaunchCount');
  return {
    profileId,
    pid: result.pid,
    runtimeChannel: result.runtimeChannel,
    status: 'running',
    ...(result.localProxy ? { localProxy: result.localProxy } : {})
  };
}

export async function stopProfileRuntime(services: ApplicationServices, profileId: string): Promise<StopResult> {
  const proxyStatus = services.localProxyManager.status(profileId);
  await services.browserController.stop(profileId);
  services.profileService.setProfileStatus(profileId, 'closed');
  if (proxyStatus?.state === 'running') {
    services.profileService.recordAudit(profileId, 'LOCAL_PROXY_STOPPED', {
      listenPort: proxyStatus.listenPort,
      upstreamScheme: proxyStatus.upstreamScheme,
      connectionCount: proxyStatus.connectionCount,
      failureCount: proxyStatus.failureCount
    });
  }
  services.profileService.recordAudit(profileId, 'PROFILE_STOPPED');
  return {
    profileId,
    status: 'closed'
  };
}

async function createLaunchProxyDiagnostic(
  services: ApplicationServices,
  profile: ProfileDetails
): Promise<ProxyTestResult | null> {
  if (!profile.proxy) {
    return null;
  }

  const result = await safeTestProfileProxy(services, profile);
  services.profileService.setProxyTestStatus(profile.proxy.id, result);
  services.localProxyManager.updateExitMetadata(profile.id, {
    ip: result.ip,
    ipTimezone: result.ipTimezone,
    timezoneMatch: result.timezoneMatch,
    ...(result.status === 'failed' ? { error: result.message } : {})
  });
  return result;
}

async function safeTestProfileProxy(services: ApplicationServices, profile: ProfileDetails): Promise<ProxyTestResult> {
  if (!profile.proxy) {
    return {
      status: 'failed',
      message: '代理配置不存在',
      testedAt: new Date().toISOString()
    };
  }

  try {
    return await testProxyConnection({
      scheme: profile.proxy.scheme,
      host: profile.proxy.host,
      port: profile.proxy.port,
      username: profile.proxy.username,
      password: profile.proxy.encryptedPassword ? services.secretBox.decrypt(profile.proxy.encryptedPassword) : undefined,
      expectedTimezone: profile.fingerprintPolicy.timezone,
      timeoutMs: 3000
    });
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? `代理出口预检测失败：${error.message}` : '代理出口预检测失败：未知错误',
      testedAt: new Date().toISOString()
    };
  }
}
