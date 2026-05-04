# FingerBrowser MCP 对接文档

版本日期：2026-05-04
适用范围：FingerBrowser macOS 桌面端、外部 MCP 客户端、内部诊断工具、销售演示工具。

## 1. 对接概览

FingerBrowser 提供一个本地 MCP stdio 服务，供外部 MCP 客户端调用浏览器环境管理能力。MCP 服务本身不直接读取数据库、密码库或浏览器 profile 目录，而是作为现有 Local API 的安全适配层。

对接链路：

```text
外部 MCP 客户端
  -> stdio 启动 out/main/mcp.js
  -> MCP 工具调用
  -> 127.0.0.1 Local API
  -> FingerBrowser 主进程服务
```

推荐对接方式：

- MCP 客户端：使用 `out/main/mcp.js`。
- 普通脚本或 curl：直接调用 Local API。

## 2. 前置条件

1. 已安装依赖并完成构建：

```bash
npm install
npm run build
```

2. FingerBrowser 桌面端正在运行，且 Local API 已启动。

3. 对接方持有 Local API Token。Token 来源优先级：

- `FINGERBROWSER_LOCAL_API_TOKEN`
- `FINGERBROWSER_LOCAL_API_TOKEN_FILE`
- `FINGERBROWSER_DATA_DIR/local-api.key`

Local API 默认地址：

```text
http://127.0.0.1:17345
```

## 3. MCP 启动配置

推荐直接用 Node 启动构建产物：

```bash
FINGERBROWSER_LOCAL_API_BASE_URL="http://127.0.0.1:17345" \
FINGERBROWSER_LOCAL_API_TOKEN_FILE="/absolute/path/to/local-api.key" \
node /Users/test/Desktop/fingerbrowser/out/main/mcp.js
```

如果对接环境已经设置了 `FINGERBROWSER_DATA_DIR`，也可以省略 token 文件变量：

```bash
FINGERBROWSER_DATA_DIR="/absolute/path/to/fingerbrowser-data" \
node /Users/test/Desktop/fingerbrowser/out/main/mcp.js
```

不要用普通 `npm run mcp` 作为 MCP 客户端命令，因为 npm 输出的脚本 banner 可能污染 stdio。必须使用 npm 时，请使用：

```bash
npm --silent run mcp
```

## 4. MCP 客户端示例

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

## 5. 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `FINGERBROWSER_LOCAL_API_BASE_URL` | 否 | `http://127.0.0.1:17345` | Local API 地址 |
| `FINGERBROWSER_LOCAL_API_TOKEN` | 三选一 | 无 | 直接传入 bearer token |
| `FINGERBROWSER_LOCAL_API_TOKEN_FILE` | 三选一 | 无 | 读取 token 的文件路径 |
| `FINGERBROWSER_DATA_DIR` | 三选一 | 无 | 自动读取该目录下的 `local-api.key` |

## 6. MCP 工具清单

| 工具名 | 入参 | 行为 | 只读 |
| --- | --- | --- | --- |
| `fingerbrowser_status` | 无 | 获取应用版本、登录状态、Local API 状态 | 是 |
| `fingerbrowser_list_profiles` | 无 | 获取脱敏后的环境列表 | 是 |
| `fingerbrowser_get_profile` | `profileId` | 获取单个脱敏环境摘要 | 是 |
| `fingerbrowser_launch_profile` | `profileId` | 启动一个浏览器环境 | 否 |
| `fingerbrowser_stop_profile` | `profileId` | 停止一个浏览器环境 | 否 |
| `fingerbrowser_local_proxy_status` | `profileId?` | 查询本地代理运行状态 | 是 |
| `fingerbrowser_list_audit` | `profileId?` | 查询脱敏审计日志 | 是 |

入参 JSON 示例：

```json
{
  "profileId": "profile-1"
}
```

## 7. 返回格式

MCP 工具会返回文本内容和结构化内容。结构化内容保持 Local API 的响应外壳：

```json
{
  "data": {
    "profileId": "profile-1",
    "status": "running"
  }
}
```

错误响应不会让 MCP 进程退出，而是返回 MCP error content：

```json
{
  "error": {
    "message": "缺少或无效的 Local API Token"
  }
}
```

## 8. Local API 直连

如果对接方不使用 MCP，可以直接调用 Local API：

```bash
TOKEN="$(cat /absolute/path/to/local-api.key)"

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

Local API 端点：

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

## 9. 安全边界

当前 MCP 与 Local API 均不开放以下能力：

- 密码库密码读取、复制、展示
- 代理密码、加密密码字段、Cookie、cache、profile 数据目录
- profile 创建、批量创建、批量自动化、更新配置
- 网页注入、验证码处理、账号农场、平台风控绕过
- 绕过、规避、凭证滥用或平台规避相关能力

所有 profile 响应只返回脱敏摘要。审计 metadata 会递归脱敏以下字段名：

```text
password, token, secret, encrypted, cookie
```

## 10. 排障

### MCP 客户端无法启动

检查 `out/main/mcp.js` 是否存在：

```bash
npm run build
ls out/main/mcp.js
```

### 返回 Local API Token 错误

确认 token 来源至少设置一个：

```bash
test -n "$FINGERBROWSER_LOCAL_API_TOKEN" && echo "token env set"
test -n "$FINGERBROWSER_LOCAL_API_TOKEN_FILE" && echo "token file env set"
test -n "$FINGERBROWSER_DATA_DIR" && echo "data dir env set"
```

并确认 token 文件内容非空：

```bash
test -s "$FINGERBROWSER_LOCAL_API_TOKEN_FILE" && echo "token file exists and is not empty"
```

### Local API 连接失败

确认 FingerBrowser 桌面端正在运行，并检查健康接口：

```bash
curl http://127.0.0.1:17345/health
```

如果端口被覆盖，MCP 客户端也要同步设置：

```bash
FINGERBROWSER_LOCAL_API_BASE_URL="http://127.0.0.1:<port>"
```

### npm 启动导致 MCP 协议异常

MCP stdio 只能在 stdout 输出 JSON-RPC 消息。优先使用：

```bash
node /Users/test/Desktop/fingerbrowser/out/main/mcp.js
```

必须走 npm 时使用：

```bash
npm --silent run mcp
```

## 11. 验收清单

对接方完成以下检查后，可认为本地 MCP 对接可用：

- FingerBrowser 桌面端已启动。
- Local API `/health` 返回 `ok: true`。
- MCP 客户端能看到 `fingerbrowser_*` 工具列表。
- `fingerbrowser_status` 能返回应用和 Local API 状态。
- `fingerbrowser_list_profiles` 返回 profile 摘要，且不包含密码、Cookie、profile 目录或代理密码。
- `fingerbrowser_launch_profile` 和 `fingerbrowser_stop_profile` 可按授权 profile id 执行。
