import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = `v${version}`;
const releaseDir = path.join(repoRoot, 'release', 'linux-x64');
const notesPath = path.join(releaseDir, 'release-notes-linux.md');
const checksumsPath = path.join(releaseDir, 'checksums-linux.txt');

mkdirSync(releaseDir, { recursive: true });
run('npm', ['run', 'package:linux']);

const assets = readdirSync(releaseDir)
  .filter((name) => name.endsWith('.AppImage') || name.endsWith('.tar.gz'))
  .sort();

if (assets.length === 0) {
  throw new Error(`未找到 Linux 试用包产物：${releaseDir}`);
}

const checksumLines = assets.map((assetName) => {
  const assetPath = path.join(releaseDir, assetName);
  if (!existsSync(assetPath)) {
    throw new Error(`Linux 试用包不存在：${assetPath}`);
  }
  return `${sha256(assetPath)}  ${assetName}`;
});

writeFileSync(checksumsPath, `${checksumLines.join('\n')}\n`, 'utf8');
writeFileSync(
  notesPath,
  [
    `# FingerBrowser ${tag} Linux x64 试用包`,
    '',
    '## 交付内容',
    '',
    '- Ubuntu 22.04/24.04 x86_64 GUI 客户端：AppImage 与 tar.gz',
    '- Linux 服务器模式：通过 --server 或 FINGERBROWSER_SERVER_MODE=1 启动',
    '- 自研 Chromium 内核通道、云账号登录、Local API/MCP 运行已有环境',
    '',
    '## 服务器模式示例',
    '',
    '```bash',
    "FINGERBROWSER_SERVER_EMAIL=admin@example.test \\",
    "FINGERBROWSER_SERVER_PASSWORD='AdminPass123!' \\",
    'FINGERBROWSER_KERNEL_MANIFEST=/opt/fingerbrowser/kernel-linux-x64.manifest.json \\',
    "FINGERBROWSER_LOCAL_API_TOKEN='change-me' \\",
    './FingerBrowser.AppImage --server',
    '```',
    '',
    'Local API 默认绑定 127.0.0.1。显式绑定非本机地址时必须设置 FINGERBROWSER_LOCAL_API_TOKEN。',
    'Linux 版仅支持自研内核；历史 official 环境会在启动时给出明确错误。'
  ].join('\n'),
  'utf8'
);

console.log(`Prepared Linux trial assets in ${releaseDir}`);
console.log(`Checksums ${checksumsPath}`);
console.log(`Notes ${notesPath}`);

function run(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit'
  });
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}
