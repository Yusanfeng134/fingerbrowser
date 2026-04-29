import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = `v${version}`;
const releaseDir = path.join(repoRoot, 'release');
const appPath = path.join(releaseDir, 'mac-arm64', '指纹浏览器.app');
const assetName = `fingerbrowser-v${version}-mac-arm64-trial.zip`;
const assetPath = path.join(releaseDir, assetName);
const notesPath = path.join(releaseDir, 'release-notes.md');
const checksumsPath = path.join(releaseDir, 'checksums.txt');
const shouldPublish = process.argv.includes('--publish');

mkdirSync(releaseDir, { recursive: true });
run('npm', ['run', 'package:mac']);
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, assetPath]);

const checksum = sha256(assetPath);
writeFileSync(checksumsPath, `${checksum}  ${assetName}\n`, 'utf8');
writeFileSync(
  notesPath,
  [
    `# 指纹浏览器 ${tag} 试卖版`,
    '',
    '## 交付内容',
    '',
    '- macOS arm64 试卖调试包',
    '- 本地授权、环境管理、代理检测、审计导出、密码管理器',
    '- 试卖清单、版本检查、本地反馈包、本地指标导出',
    '',
    '## 安装说明',
    '',
    '1. 下载并解压 macOS 试卖包。',
    '2. 如果 macOS 拦截未签名应用，执行：',
    '',
    '```bash',
    'xattr -dr com.apple.quarantine "/Applications/指纹浏览器.app"',
    '```',
    '',
    '3. 打开应用后输入销售发放的激活码。',
    ''
  ].join('\n'),
  'utf8'
);

if (shouldPublish) {
  run('gh', [
    'release',
    'create',
    tag,
    assetPath,
    checksumsPath,
    '--repo',
    'Yusanfeng134/fingerbrowser',
    '--title',
    `指纹浏览器 ${tag} 试卖版`,
    '--notes-file',
    notesPath,
    '--prerelease'
  ]);
}

console.log(`Prepared ${assetPath}`);
console.log(`Checksum ${checksum}`);
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
