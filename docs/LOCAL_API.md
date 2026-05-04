# FingerBrowser Local API

Local API is a localhost-only integration surface for compliant desktop workflows. It is intended for local tooling, demos, support diagnostics, and controlled internal integrations.

## Runtime

- Bind address: `127.0.0.1`
- Default port: `17345`
- E2E mode uses a dynamic port.
- Override port with `FINGERBROWSER_LOCAL_API_PORT`.
- Override token with `FINGERBROWSER_LOCAL_API_TOKEN`.
- When no token is provided, the app creates `local-api.key` under the app data directory.
- In development or tests, `FINGERBROWSER_DATA_DIR` controls that data directory.

The API requires:

```http
Authorization: Bearer <local-api-token>
```

## Security Boundary

The first version deliberately does not expose:

- credential passwords or password reveal/copy APIs
- proxy passwords, encrypted password blobs, cookies, cache, or profile data directories
- profile creation, bulk creation, profile updates, or batch automation APIs
- webpage injection, captcha handling, account farming, or platform risk bypass features

All profile responses are redacted summaries. Audit metadata is recursively redacted for keys such as `password`, `token`, `secret`, `encrypted`, and `cookie`.

## Endpoints

```http
GET /health
GET /v1/status
GET /v1/profiles
GET /v1/profiles/:profileId
POST /v1/profiles/:profileId/launch
POST /v1/profiles/:profileId/stop
GET /v1/proxy/local-status?profileId=:profileId
GET /v1/audit?profileId=:profileId
```

## MCP Bridge

External MCP clients can call the compliant Local API through the stdio server built at `out/main/mcp.js`. See [MCP.md](MCP.md) for client configuration, environment variables, and exposed tool names.

## Examples

```bash
TOKEN="$(cat "$FINGERBROWSER_DATA_DIR/local-api.key")"

curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:17345/v1/status

curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:17345/v1/profiles

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:17345/v1/profiles/<profileId>/launch

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:17345/v1/profiles/<profileId>/stop
```
