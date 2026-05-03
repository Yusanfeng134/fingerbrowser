import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  AppVersionInfo,
  AuditEvent,
  AuthStatus,
  LaunchResult,
  ProfileDetails,
  ProxyRuntimeStatus,
  StopResult
} from '../../shared/types';

export interface LocalApiProfileSummary {
  id: string;
  name: string;
  owner: string;
  groupName: string;
  tags: string[];
  status: ProfileDetails['status'];
  runtimeChannel: ProfileDetails['runtimeChannel'];
  fingerprintPolicy: ProfileDetails['fingerprintPolicy'];
  proxy: {
    configured: boolean;
    lastTestStatus: ProfileDetails['proxy'] extends null ? null : NonNullable<ProfileDetails['proxy']>['lastTestStatus'] | null;
  };
  lastLaunchedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalApiServerStatus {
  enabled: boolean;
  host: string;
  port: number;
  baseUrl: string;
  startedAt: string | null;
}

interface LocalApiServerOptions {
  host: string;
  port: number;
  token: string;
  version: () => AppVersionInfo;
  authStatus: () => AuthStatus;
  listProfiles: () => ProfileDetails[];
  getProfile: (profileId: string) => ProfileDetails;
  launchProfile: (profileId: string) => Promise<LaunchResult>;
  stopProfile: (profileId: string) => Promise<StopResult>;
  listAuditEvents: (profileId?: string) => AuditEvent[];
  localProxyStatus: (profileId?: string) => ProxyRuntimeStatus[];
}

export interface LocalApiServer {
  start(): Promise<LocalApiServerStatus>;
  stop(): Promise<void>;
  updateToken(token: string): void;
  status(): LocalApiServerStatus;
}

const sensitiveKeyPattern = /(password|token|secret|encrypted|cookie)/i;

export function createLocalApiToken(): string {
  return `fb_local_${randomBytes(32).toString('base64url')}`;
}

export function sanitizeLocalApiProfile(profile: ProfileDetails): LocalApiProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    owner: profile.owner,
    groupName: profile.groupName,
    tags: profile.tags,
    status: profile.status,
    runtimeChannel: profile.runtimeChannel,
    fingerprintPolicy: profile.fingerprintPolicy,
    proxy: {
      configured: Boolean(profile.proxy),
      lastTestStatus: profile.proxy?.lastTestStatus ?? null
    },
    lastLaunchedAt: profile.lastLaunchedAt,
    archivedAt: profile.archivedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

export function createLocalApiServer(options: LocalApiServerOptions): LocalApiServer {
  let server: http.Server | null = null;
  let token = options.token;
  let status: LocalApiServerStatus = {
    enabled: false,
    host: options.host,
    port: options.port,
    baseUrl: `http://${options.host}:${options.port}`,
    startedAt: null
  };

  function setRuntimePort(runtimePort: number): void {
    status = {
      enabled: true,
      host: options.host,
      port: runtimePort,
      baseUrl: `http://${options.host}:${runtimePort}`,
      startedAt: new Date().toISOString()
    };
  }

  async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('x-content-type-options', 'nosniff');

    try {
      const requestUrl = new URL(request.url ?? '/', status.baseUrl);
      if (requestUrl.pathname === '/health' && request.method === 'GET') {
        sendJson(response, 200, { ok: true, service: 'fingerbrowser-local-api' });
        return;
      }

      if (!isAuthorized(request.headers.authorization, token)) {
        sendJson(response, 401, { error: { message: '缺少或无效的 Local API Token' } });
        return;
      }

      await routeRequest(request, response, requestUrl);
    } catch (error) {
      sendJson(response, 500, { error: { message: error instanceof Error ? error.message : 'Local API 请求失败' } });
    }
  }

  async function routeRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestUrl: URL
  ): Promise<void> {
    const method = request.method ?? 'GET';
    const profileActionMatch = requestUrl.pathname.match(/^\/v1\/profiles\/([^/]+)\/(launch|stop)$/);
    const profileMatch = requestUrl.pathname.match(/^\/v1\/profiles\/([^/]+)$/);

    if (requestUrl.pathname === '/v1/status' && method === 'GET') {
      sendJson(response, 200, {
        data: {
          ok: true,
          version: options.version(),
          auth: options.authStatus(),
          localApi: status
        }
      });
      return;
    }

    if (requestUrl.pathname === '/v1/profiles' && method === 'GET') {
      sendJson(response, 200, { data: options.listProfiles().map(sanitizeLocalApiProfile) });
      return;
    }

    if (profileMatch && method === 'GET') {
      sendJson(response, 200, { data: sanitizeLocalApiProfile(options.getProfile(decodeURIComponent(profileMatch[1]))) });
      return;
    }

    if (profileActionMatch && method === 'POST') {
      const profileId = decodeURIComponent(profileActionMatch[1]);
      const action = profileActionMatch[2];
      const data = action === 'launch' ? await options.launchProfile(profileId) : await options.stopProfile(profileId);
      sendJson(response, 200, { data });
      return;
    }

    if (requestUrl.pathname === '/v1/proxy/local-status' && method === 'GET') {
      const profileId = requestUrl.searchParams.get('profileId') ?? undefined;
      sendJson(response, 200, { data: options.localProxyStatus(profileId) });
      return;
    }

    if (requestUrl.pathname === '/v1/audit' && method === 'GET') {
      const profileId = requestUrl.searchParams.get('profileId') ?? undefined;
      sendJson(response, 200, { data: options.listAuditEvents(profileId).map(sanitizeAuditEvent) });
      return;
    }

    if (!['GET', 'POST'].includes(method)) {
      sendJson(response, 405, { error: { message: 'Local API 方法不支持' } });
      return;
    }

    sendJson(response, 404, { error: { message: 'Local API 路由不存在' } });
  }

  return {
    async start(): Promise<LocalApiServerStatus> {
      if (server) {
        return status;
      }

      server = http.createServer((request, response) => {
        void handleRequest(request, response);
      });

      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(options.port, options.host, () => {
          const address = server?.address() as AddressInfo | null;
          setRuntimePort(address?.port ?? options.port);
          server?.off('error', reject);
          resolve();
        });
      });

      return status;
    },
    async stop(): Promise<void> {
      if (!server) {
        return;
      }
      const currentServer = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => (error ? reject(error) : resolve()));
      });
      status = {
        enabled: false,
        host: options.host,
        port: status.port,
        baseUrl: `http://${options.host}:${status.port}`,
        startedAt: null
      };
    },
    updateToken(nextToken: string): void {
      token = nextToken;
    },
    status(): LocalApiServerStatus {
      return status;
    }
  };
}

function sanitizeAuditEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    metadata: sanitizeMetadata(event.metadata) as Record<string, unknown>
  };
}

function sanitizeMetadata(value: unknown, key = ''): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeMetadata(entryValue, entryKey)
      ])
    );
  }
  return value;
}

function isAuthorized(header: string | undefined, token: string): boolean {
  const prefix = 'Bearer ';
  if (!header?.startsWith(prefix)) {
    return false;
  }
  const candidate = header.slice(prefix.length);
  const expectedBuffer = Buffer.from(token);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}
