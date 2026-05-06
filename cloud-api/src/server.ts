import http from 'node:http';
import type { CloudApiService } from './service';
import type { CloudEncryptedPayload, CloudUserRole } from './types';

type JsonObject = Record<string, unknown>;

export function createCloudHttpServer(service: CloudApiService): http.Server {
  return http.createServer((request, response) => {
    void handleRequest(service, request, response);
  });
}

async function handleRequest(service: CloudApiService, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const token = bearerToken(request);

    if (method === 'POST' && url.pathname === '/auth/login') {
      const body = await readJson(request);
      sendJson(response, service.login({
        email: readString(body, 'email'),
        password: readString(body, 'password'),
        deviceName: readString(body, 'deviceName')
      }));
      return;
    }

    if (method === 'POST' && url.pathname === '/auth/refresh') {
      const body = await readJson(request);
      sendJson(response, service.refresh(readString(body, 'refreshToken')));
      return;
    }

    if (method === 'POST' && url.pathname === '/auth/logout') {
      service.logout(requireToken(token));
      sendJson(response, { ok: true });
      return;
    }

    if (method === 'GET' && url.pathname === '/me') {
      sendJson(response, service.me(requireToken(token)));
      return;
    }

    if (method === 'GET' && url.pathname === '/teams/current') {
      sendJson(response, service.me(requireToken(token)).team);
      return;
    }

    if (method === 'POST' && url.pathname === '/invites') {
      const body = await readJson(request);
      sendJson(response, service.createInvite(requireToken(token), {
        email: readString(body, 'email'),
        role: readRole(body, 'role')
      }));
      return;
    }

    if (method === 'POST' && url.pathname === '/invites/accept') {
      const body = await readJson(request);
      sendJson(response, service.acceptInvite({
        inviteCode: readString(body, 'inviteCode'),
        email: readString(body, 'email'),
        displayName: readString(body, 'displayName'),
        password: readString(body, 'password'),
        deviceName: readString(body, 'deviceName')
      }));
      return;
    }

    if (url.pathname === '/sync/environments') {
      if (method === 'GET') {
        sendJson(response, service.listEnvironments(requireToken(token)));
        return;
      }
      if (method === 'POST' || method === 'PATCH') {
        const body = await readJson(request);
        sendJson(response, service.upsertEnvironment(requireToken(token), {
          remoteId: readString(body, 'remoteId'),
          encryptedPayload: readEncryptedPayload(body)
        }));
        return;
      }
    }

    if (url.pathname === '/sync/credentials') {
      if (method === 'GET') {
        sendJson(response, service.listCredentials(requireToken(token)));
        return;
      }
      if (method === 'POST' || method === 'PATCH') {
        const body = await readJson(request);
        sendJson(response, service.upsertCredential(requireToken(token), {
          remoteId: readString(body, 'remoteId'),
          encryptedPayload: readEncryptedPayload(body)
        }));
        return;
      }
    }

    if (url.pathname === '/sync/audit-events') {
      if (method === 'GET') {
        sendJson(response, service.listAuditEvents(requireToken(token)));
        return;
      }
      if (method === 'POST') {
        const body = await readJson(request);
        sendJson(response, service.appendAuditEvent(requireToken(token), {
          remoteId: readString(body, 'remoteId'),
          profileRemoteId: readOptionalString(body, 'profileRemoteId'),
          encryptedPayload: readEncryptedPayload(body),
          createdAt: readOptionalString(body, 'createdAt') ?? undefined
        }));
        return;
      }
    }

    const lockMatch = url.pathname.match(/^\/sync\/profiles\/([^/]+)\/lock$/);
    if (lockMatch && method === 'POST') {
      const body = await readJson(request);
      sendJson(response, service.lockProfile(requireToken(token), {
        profileRemoteId: decodeURIComponent(lockMatch[1]),
        force: body.force === true
      }));
      return;
    }
    if (lockMatch && method === 'DELETE') {
      const body = await readJson(request);
      service.unlockProfile(requireToken(token), {
        profileRemoteId: decodeURIComponent(lockMatch[1]),
        lockId: readString(body, 'lockId')
      });
      sendJson(response, { ok: true });
      return;
    }

    const snapshotMatch = url.pathname.match(/^\/sync\/profiles\/([^/]+)\/snapshots(?:\/latest)?$/);
    if (snapshotMatch && method === 'POST') {
      const body = await readJson(request);
      sendJson(response, service.uploadProfileSnapshot(requireToken(token), {
        profileRemoteId: decodeURIComponent(snapshotMatch[1]),
        lockId: readString(body, 'lockId'),
        encryptedArchive: readString(body, 'encryptedArchive'),
        nonce: readString(body, 'nonce'),
        authTag: readString(body, 'authTag'),
        algorithm: 'aes-256-gcm'
      }));
      return;
    }
    if (snapshotMatch && method === 'GET') {
      sendJson(response, service.downloadLatestProfileSnapshot(requireToken(token), {
        profileRemoteId: decodeURIComponent(snapshotMatch[1])
      }));
      return;
    }

    sendJson(response, { error: 'Not found' }, 404);
  } catch (error) {
    sendJson(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
}

function bearerToken(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
}

function requireToken(token: string | null): string {
  if (!token) {
    throw new Error('缺少云账号访问令牌');
  }
  return token;
}

function readJson(request: http.IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonObject);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('JSON 解析失败'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: http.ServerResponse, value: unknown, statusCode = 200): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

function readString(body: JsonObject, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少字段 ${key}`);
  }
  return value;
}

function readOptionalString(body: JsonObject, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function readRole(body: JsonObject, key: string): CloudUserRole {
  return body[key] === 'admin' ? 'admin' : 'member';
}

function readEncryptedPayload(body: JsonObject): CloudEncryptedPayload {
  const payload = body.encryptedPayload;
  if (!payload || typeof payload !== 'object') {
    throw new Error('缺少 encryptedPayload');
  }
  const record = payload as JsonObject;
  return {
    ciphertext: readString(record, 'ciphertext'),
    nonce: readString(record, 'nonce'),
    authTag: readString(record, 'authTag'),
    algorithm: 'aes-256-gcm'
  };
}
