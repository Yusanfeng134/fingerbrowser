# 云账号与全状态同步

FingerBrowser 第一版云同步把桌面端从“本地账号解锁本机数据”升级为“云账号进入团队工作区”。同一团队成员在不同设备登录后，可以同步环境配置、密码库、审计记录，并在启动/关闭浏览器环境时同步完整 Chromium profile 快照。

## 架构边界

- `cloud-api/` 是自建云端服务内核，提供登录、邀请、团队成员、环境元数据、密码库、审计、profile 锁和 profile 快照接口。
- 云端生产目标为 Postgres + S3 兼容对象存储；当前仓库内置内存 store/object storage 适配，用于单元测试和本地开发验证。
- 桌面端本地 SQLite 作为当前团队的缓存，新增 `team_id`、`remote_id`、`sync_version`、`last_synced_at`、`dirty`、`deleted` 同步字段。
- Local API 和 MCP 仍只暴露本机接口；未登录云账号时不能访问环境、密码库和审计。

## 端到端加密

团队创建时生成团队同步密钥，桌面端用该密钥在上传前加密敏感数据。云端只保存密文 payload 和密文 profile 快照，不应保存明文密码、proxy 密码、Cookie、缓存、profile 文件或团队同步密钥。

管理员邀请成员时生成一次性邀请码，邀请码携带团队同步密钥材料。成员接受邀请后，本机保存团队密钥，用于解密当前团队的环境、密码库和浏览器状态快照。

## Profile 同步与锁

完整浏览器状态不做多设备合并。启动环境前，桌面端先向云端申请 profile 锁并下载最新加密快照；关闭环境后，桌面端打包本机 `userDataDir`、加密上传新快照，然后释放锁。

如果同一环境已经被另一台设备锁定，第二台设备会收到“环境正在其他设备运行”的错误。第一版只允许显式强制接管过期锁，不做最后写入覆盖。

## 本机数据迁移

首次登录云账号后，旧本机数据不会自动上传。用户需要点击“迁移本机数据”，客户端才会把本机环境、密码库、审计和 profile 快照加密上传到当前团队。

## 开发命令

```bash
npm run cloud-api:test
npm run cloud-api:build
npm run test -- tests/cloud-api.test.ts tests/cloud-sync-service.test.ts
```

桌面端内置一个本地开发云工作区，可通过环境变量覆盖默认管理员：

```bash
FINGERBROWSER_CLOUD_BOOTSTRAP_TEAM="试用团队" \
FINGERBROWSER_CLOUD_BOOTSTRAP_EMAIL="admin@example.test" \
FINGERBROWSER_CLOUD_BOOTSTRAP_PASSWORD="AdminPass123!" \
FINGERBROWSER_CLOUD_BOOTSTRAP_NAME="云端管理员" \
npm run dev
```

## 合规边界

云同步仅用于同一团队授权设备之间的数据连续性和审计留存。不提供、不承诺、不暗示验证码绕过、平台规避、账号农场、批量行为同步或风控绕过能力。
