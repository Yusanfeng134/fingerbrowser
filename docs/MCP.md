# FingerBrowser MCP Server

FingerBrowser exports a local MCP stdio server for external MCP clients. The MCP server is a thin adapter over the existing authenticated Local API, so it keeps the same compliance boundary and redaction rules.

## Runtime

1. Start the FingerBrowser desktop app so the Local API is running.
2. Build the app once:

```bash
npm run build
```

3. Start the MCP server with either a token value or token file:

```bash
FINGERBROWSER_DATA_DIR="/absolute/path/to/fingerbrowser-data" \
  node /Users/test/Desktop/fingerbrowser/out/main/mcp.js
```

Or:

```bash
FINGERBROWSER_LOCAL_API_TOKEN="<local-api-token>" \
  node /Users/test/Desktop/fingerbrowser/out/main/mcp.js
```

Optional environment variables:

- `FINGERBROWSER_LOCAL_API_BASE_URL`: defaults to `http://127.0.0.1:17345`.
- `FINGERBROWSER_LOCAL_API_TOKEN`: bearer token value.
- `FINGERBROWSER_LOCAL_API_TOKEN_FILE`: file containing the bearer token, usually `local-api.key`.
- `FINGERBROWSER_DATA_DIR`: directory containing `local-api.key`; used only when the token and token file variables are not set.

MCP clients should prefer the direct `node .../out/main/mcp.js` command. If you use npm as a launcher, use `npm --silent run mcp` because normal npm script banners can corrupt MCP stdio.

## Client Config Example

```json
{
  "mcpServers": {
    "fingerbrowser": {
      "command": "node",
      "args": ["/Users/test/Desktop/fingerbrowser/out/main/mcp.js"],
      "env": {
        "FINGERBROWSER_LOCAL_API_BASE_URL": "http://127.0.0.1:17345",
        "FINGERBROWSER_LOCAL_API_TOKEN_FILE": "/absolute/path/to/local-api.key"
      }
    }
  }
}
```

## Tools

The MCP server exposes:

- `fingerbrowser_status`
- `fingerbrowser_list_profiles`
- `fingerbrowser_get_profile`
- `fingerbrowser_launch_profile`
- `fingerbrowser_stop_profile`
- `fingerbrowser_local_proxy_status`
- `fingerbrowser_list_audit`

Profile and audit responses stay redacted by the Local API. The MCP server does not expose credential passwords, proxy passwords, encrypted blobs, cookies, cache, profile data directories, profile creation, bulk automation, webpage injection, CAPTCHA handling, or platform-circumvention features.
