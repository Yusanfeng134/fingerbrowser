# FingerBrowser Linux 服务器版

Linux 第一版目标为 Ubuntu 22.04/24.04 x86_64，同时支持 GUI 客户端和服务器模式。Linux 版仅支持自研 Chromium 内核通道，不使用 official Chrome for Testing。

## 打包

在 Ubuntu x64 构建：

```bash
npm run package:linux
```

输出目录：

```text
release/linux-x64
```

生成 Linux 试用包、checksum 和 release notes：

```bash
npm run release:linux:trial
```

## 服务器模式

服务器模式不会创建 `BrowserWindow`，会初始化服务、使用云账号登录、拉取当前工作区，并启动 Local API。

```bash
FINGERBROWSER_SERVER_EMAIL=admin@example.test \
FINGERBROWSER_SERVER_PASSWORD='AdminPass123!' \
FINGERBROWSER_KERNEL_MANIFEST=/opt/fingerbrowser/kernel-linux-x64.manifest.json \
FINGERBROWSER_LOCAL_API_TOKEN='change-me' \
./FingerBrowser.AppImage --server
```

也可以使用：

```bash
FINGERBROWSER_SERVER_MODE=1 ./FingerBrowser.AppImage
```

## Local API 绑定

默认绑定 `127.0.0.1:17345`。如果显式设置 `FINGERBROWSER_LOCAL_API_HOST=0.0.0.0` 或其他非本机地址，必须同时设置 `FINGERBROWSER_LOCAL_API_TOKEN`。

## 内核 Manifest

Linux manifest 必须匹配当前平台：

```json
{
  "version": "0.1.1",
  "baseChromiumRevision": "refs/tags/124.0.6367.207",
  "patchsetVersion": "2026.05.07.1",
  "platform": "linux",
  "arch": "x64",
  "artifactUrl": "file:///opt/fingerbrowser/fingerbrowser-kernel-v0.1.1-linux-x64.tar.gz",
  "sha256": "<64 hex chars>",
  "executableRelativePath": "fingerbrowser-kernel/chrome",
  "policySchemaVersion": 1
}
```

安装时会先校验 sha256，再用 `tar -xzf` 解压到 `kernel-runtime/<version>`，并验证 `fingerbrowser-kernel/chrome` 存在且可执行。

## Xvfb

服务器模式下没有 `DISPLAY` 时，FingerBrowser 会使用 `xvfb-run -a` 启动 Chromium。缺少 `xvfb-run` 时会给出安装提示：

```bash
sudo apt-get update
sudo apt-get install -y xvfb
```

## 范围边界

Linux 服务器模式第一版只运行已有云端同步环境：状态、拉取云端、列表、详情、启动、停止、Local proxy 状态和审计读取。创建/编辑环境、密码库维护仍通过 GUI 客户端完成。

同步和服务器能力仅用于同一团队授权设备的数据连续性，不提供验证码绕过、平台规避、账号农场、批量行为同步或风控绕过能力。
