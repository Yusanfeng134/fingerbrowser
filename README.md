# 指纹浏览器 MVP

企业本地桌面端，用于管理隔离的 Chromium 浏览器环境、基础代理配置、隐私归一化策略和本地审计日志。

## 开发命令

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
```

如果 Electron 二进制下载阶段网络失败，可临时使用镜像重试：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## MVP 边界

- 支持 macOS 优先的本地单用户桌面工作流。
- 每个环境使用独立 `userDataDir`，保留 Cookie、缓存和登录态。
- 敏感字段通过 Electron `safeStorage` 加密，macOS 使用系统 Keychain。
- 指纹能力只做稳定、可解释的隐私归一化，不做随机伪装或绕过第三方风控。
