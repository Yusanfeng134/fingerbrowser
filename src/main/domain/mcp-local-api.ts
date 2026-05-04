import path from 'node:path';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

export const DEFAULT_FINGERBROWSER_LOCAL_API_BASE_URL = 'http://127.0.0.1:17345';

export const FINGERBROWSER_MCP_TOOL_NAMES = [
  'fingerbrowser_status',
  'fingerbrowser_list_profiles',
  'fingerbrowser_get_profile',
  'fingerbrowser_launch_profile',
  'fingerbrowser_stop_profile',
  'fingerbrowser_local_proxy_status',
  'fingerbrowser_list_audit'
] as const;

export type FingerBrowserMcpToolName = (typeof FINGERBROWSER_MCP_TOOL_NAMES)[number];

export interface FingerBrowserMcpConfig {
  baseUrl: string;
  token: string;
}

export interface ResolveFingerBrowserMcpConfigOptions {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readFile?: (filePath: string) => string;
}

export interface FingerBrowserMcpLocalApiClient {
  getStatus(): Promise<unknown>;
  listProfiles(): Promise<unknown>;
  getProfile(profileId: string): Promise<unknown>;
  launchProfile(profileId: string): Promise<unknown>;
  stopProfile(profileId: string): Promise<unknown>;
  localProxyStatus(profileId?: string): Promise<unknown>;
  listAudit(profileId?: string): Promise<unknown>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CreateFingerBrowserMcpLocalApiClientOptions extends FingerBrowserMcpConfig {
  fetchImpl?: FetchLike;
}

export interface FingerBrowserMcpToolRegistrar {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, z.ZodType>;
      annotations?: ToolAnnotations;
    },
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>
  ): unknown;
}

const profileIdSchema = {
  profileId: z.string().min(1).describe('FingerBrowser profile id')
};

const optionalProfileIdSchema = {
  profileId: z.string().min(1).optional().describe('Optional FingerBrowser profile id filter')
};

export function resolveFingerBrowserMcpConfig(options: ResolveFingerBrowserMcpConfigOptions): FingerBrowserMcpConfig {
  const baseUrl = normalizeBaseUrl(
    options.env.FINGERBROWSER_LOCAL_API_BASE_URL ?? DEFAULT_FINGERBROWSER_LOCAL_API_BASE_URL
  );
  const environmentToken = options.env.FINGERBROWSER_LOCAL_API_TOKEN?.trim();
  if (environmentToken) {
    return { baseUrl, token: environmentToken };
  }

  const tokenFile = options.env.FINGERBROWSER_LOCAL_API_TOKEN_FILE?.trim();
  if (tokenFile && options.readFile) {
    const token = options.readFile(tokenFile).trim();
    if (token) {
      return { baseUrl, token };
    }
  }

  const dataDir = options.env.FINGERBROWSER_DATA_DIR?.trim();
  if (dataDir && options.readFile) {
    const token = options.readFile(path.join(dataDir, 'local-api.key')).trim();
    if (token) {
      return { baseUrl, token };
    }
  }

  throw new Error(
    '缺少 Local API Token：请设置 FINGERBROWSER_LOCAL_API_TOKEN、FINGERBROWSER_LOCAL_API_TOKEN_FILE 或 FINGERBROWSER_DATA_DIR'
  );
}

export function createFingerBrowserMcpLocalApiClient(
  options: CreateFingerBrowserMcpLocalApiClientOptions
): FingerBrowserMcpLocalApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const token = options.token;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(pathname: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {})
      }
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      const message = extractErrorMessage(body) ?? `Local API 请求失败：HTTP ${response.status}`;
      throw new Error(message);
    }
    return body;
  }

  return {
    getStatus: () => request('/v1/status'),
    listProfiles: () => request('/v1/profiles'),
    getProfile: (profileId) => request(`/v1/profiles/${encodeURIComponent(profileId)}`),
    launchProfile: (profileId) =>
      request(`/v1/profiles/${encodeURIComponent(profileId)}/launch`, {
        method: 'POST'
      }),
    stopProfile: (profileId) =>
      request(`/v1/profiles/${encodeURIComponent(profileId)}/stop`, {
        method: 'POST'
      }),
    localProxyStatus: (profileId) => request(withOptionalProfileId('/v1/proxy/local-status', profileId)),
    listAudit: (profileId) => request(withOptionalProfileId('/v1/audit', profileId))
  };
}

export function registerFingerBrowserMcpTools(
  server: FingerBrowserMcpToolRegistrar,
  client: FingerBrowserMcpLocalApiClient
): void {
  server.registerTool(
    'fingerbrowser_status',
    {
      title: 'FingerBrowser status',
      description: 'Read app version, authentication status, and Local API runtime status.',
      annotations: readOnlyAnnotations()
    },
    async () => runTool(() => client.getStatus())
  );

  server.registerTool(
    'fingerbrowser_list_profiles',
    {
      title: 'List FingerBrowser profiles',
      description: 'List redacted browser environment summaries from the authenticated Local API.',
      annotations: readOnlyAnnotations()
    },
    async () => runTool(() => client.listProfiles())
  );

  server.registerTool(
    'fingerbrowser_get_profile',
    {
      title: 'Get FingerBrowser profile',
      description: 'Get one redacted browser environment summary by profile id.',
      inputSchema: profileIdSchema,
      annotations: readOnlyAnnotations()
    },
    async ({ profileId }) => runTool(() => client.getProfile(String(profileId)))
  );

  server.registerTool(
    'fingerbrowser_launch_profile',
    {
      title: 'Launch FingerBrowser profile',
      description: 'Launch one browser environment through the authenticated Local API.',
      inputSchema: profileIdSchema,
      annotations: {
        title: 'Launch FingerBrowser profile',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ profileId }) => runTool(() => client.launchProfile(String(profileId)))
  );

  server.registerTool(
    'fingerbrowser_stop_profile',
    {
      title: 'Stop FingerBrowser profile',
      description: 'Stop one running browser environment through the authenticated Local API.',
      inputSchema: profileIdSchema,
      annotations: {
        title: 'Stop FingerBrowser profile',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ profileId }) => runTool(() => client.stopProfile(String(profileId)))
  );

  server.registerTool(
    'fingerbrowser_local_proxy_status',
    {
      title: 'FingerBrowser local proxy status',
      description: 'Read local proxy runtime status, optionally filtered by profile id.',
      inputSchema: optionalProfileIdSchema,
      annotations: readOnlyAnnotations()
    },
    async ({ profileId }) => runTool(() => client.localProxyStatus(optionalString(profileId)))
  );

  server.registerTool(
    'fingerbrowser_list_audit',
    {
      title: 'List FingerBrowser audit events',
      description: 'List redacted audit events, optionally filtered by profile id.',
      inputSchema: optionalProfileIdSchema,
      annotations: readOnlyAnnotations()
    },
    async ({ profileId }) => runTool(() => client.listAudit(optionalString(profileId)))
  );
}

async function runTool(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(await operation());
  } catch (error) {
    return errorToolResult(error);
  }
}

function toolResult(body: unknown): CallToolResult {
  const structuredContent = isRecord(body) ? body : { data: body };
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

function errorToolResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : 'MCP 工具调用失败';
  const structuredContent = {
    error: {
      message
    }
  };
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

function readOnlyAnnotations(): ToolAnnotations {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
}

function withOptionalProfileId(pathname: string, profileId: string | undefined): string {
  if (!profileId) {
    return pathname;
  }
  return `${pathname}?profileId=${encodeURIComponent(profileId)}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function extractErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const error = body.error;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
