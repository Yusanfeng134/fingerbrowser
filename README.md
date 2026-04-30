# 指纹浏览器 MVP

企业本地桌面端，用于管理隔离的 Chromium 浏览器环境、基础代理配置、隐私归一化策略和本地审计日志。

## 开发命令

```bash
npm install
npm run dev
npm run dev:kernel
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
npm run package:mac
npm run release:trial
npm run license:issue -- --plan trial --team "试卖团队" --days 7
```

`npm run dev:kernel` 会自动读取同级目录
`../fingerbrowser-kernel/dist/fingerbrowser-kernel-v0.1.1-mac-arm64.manifest.json`，
以自研内核 manifest 启动客户端。也可以手动指定：

```bash
FINGERBROWSER_KERNEL_MANIFEST=/path/to/fingerbrowser-kernel.manifest.json npm run dev
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

## 30 天试卖能力

- 在线/签名激活码：授权中心支持激活、刷新、解绑和设备码展示。
- 套餐限制：试用版 1 席/5 环境，专业版 1 席/50 环境，团队版 3 席/200 环境；销售签发时可覆盖。
- 运营闭环：试卖清单、版本检查、反馈包、审计导出、配置导出、批量代理检测和支持日志打包。
- macOS 试卖包：`npm run package:mac` 生成未签名的本地试卖目录包。
- GitHub Release 试卖交付：`npm run release:trial` 生成固定命名 zip、`checksums.txt` 和 `release-notes.md`；`npm run release:trial:publish` 调用 `gh release create --prerelease` 上传。

试卖默认使用开发签名密钥。正式销售前必须设置：

```bash
FINGERBROWSER_LICENSE_SIGNING_SECRET=<shared-secret>
```
