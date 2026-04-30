import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifestPath = path.resolve(
  repoRoot,
  '..',
  'fingerbrowser-kernel',
  'dist',
  'fingerbrowser-kernel-v0.1.1-mac-arm64.manifest.json'
);

function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`自研内核 manifest 不存在：${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const artifactUrl = String(manifest.artifactUrl ?? '');
  if (!artifactUrl.startsWith('file://')) {
    throw new Error(`本地调试需要 file:// 内核产物：${artifactUrl || '未配置'}`);
  }
  const artifactPath = fileURLToPath(artifactUrl);
  if (!existsSync(artifactPath)) {
    throw new Error(`自研内核 zip 不存在：${artifactPath}`);
  }
  return manifest;
}

function main() {
  const printEnvOnly = process.argv.includes('--print-env');
  const manifestPath = path.resolve(process.env.FINGERBROWSER_KERNEL_MANIFEST ?? defaultManifestPath);
  const manifest = loadManifest(manifestPath);
  const env = {
    ...process.env,
    FINGERBROWSER_KERNEL_MANIFEST: manifestPath
  };

  console.log(`Using custom kernel manifest: ${manifestPath}`);
  console.log(`Kernel ${manifest.version} / patchset ${manifest.patchsetVersion}`);

  if (printEnvOnly) {
    console.log(`FINGERBROWSER_KERNEL_MANIFEST=${manifestPath}`);
    return;
  }

  const child = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit'
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
