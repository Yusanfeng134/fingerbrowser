import type { AuthStatus, LoginInput, SyncPullResult } from '../shared/types';
import type { LocalApiServerStatus } from './domain/local-api';

export interface ServerModeServices {
  userService: {
    login(input: LoginInput): AuthStatus | Promise<AuthStatus>;
  };
  syncService: {
    pullWorkspace(): SyncPullResult | Promise<SyncPullResult>;
  };
  localApiServer: {
    start(): Promise<LocalApiServerStatus>;
  };
}

export interface ServerModeStartResult {
  auth: AuthStatus;
  sync: SyncPullResult;
  localApi: LocalApiServerStatus;
}

export function isServerMode(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return argv.includes('--server') || env.FINGERBROWSER_SERVER_MODE === '1';
}

export function resolveServerLoginInput(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): LoginInput {
  const email = env.FINGERBROWSER_SERVER_EMAIL?.trim().toLowerCase();
  const password = env.FINGERBROWSER_SERVER_PASSWORD;
  if (!email || !password) {
    throw new Error('Linux 服务器模式需要设置 FINGERBROWSER_SERVER_EMAIL 和 FINGERBROWSER_SERVER_PASSWORD');
  }
  return {
    email,
    password
  };
}

export async function startServerMode(
  services: ServerModeServices,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  logger: Pick<Console, 'info'> = console
): Promise<ServerModeStartResult> {
  const auth = await services.userService.login(resolveServerLoginInput(env));
  const sync = await services.syncService.pullWorkspace();
  const localApi = await services.localApiServer.start();
  logger.info(`FingerBrowser Linux 服务器模式已启动：${localApi.baseUrl}`);
  return {
    auth,
    sync,
    localApi
  };
}
