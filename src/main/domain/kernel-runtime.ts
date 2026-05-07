import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  BrowserProfile,
  FingerprintPolicy,
  KernelInstallResult,
  KernelManifestSource,
  KernelRuntimeArch,
  KernelRuntimeManifest,
  KernelRuntimePlatform,
  KernelRuntimeStatus,
  RuntimeChannel
} from '../../shared/types';
import type { AppSettingsService } from './app-settings-service';

export const KERNEL_POLICY_SCHEMA_VERSION = 1;
export const KERNEL_POLICY_FILE_NAME = 'fingerbrowser_policy.json';

export interface KernelPolicyDocument {
  schemaVersion: typeof KERNEL_POLICY_SCHEMA_VERSION;
  profileId: string;
  runtimeChannel: Extract<RuntimeChannel, 'custom-kernel'>;
  fingerprintPolicy: FingerprintPolicy;
}

export interface KernelRuntimeManager {
  manifest(): KernelRuntimeManifest;
  status(): KernelRuntimeStatus;
  ensureInstalled(): Promise<KernelInstallResult>;
  importManifest(manifestPath: string): KernelRuntimeStatus;
  clearManifest(): KernelRuntimeStatus;
}

export interface KernelRuntimeTarget {
  platform: KernelRuntimePlatform;
  arch: KernelRuntimeArch;
}

export const DEFAULT_DARWIN_KERNEL_RUNTIME_MANIFEST: KernelRuntimeManifest = {
  version: '0.1.1',
  baseChromiumRevision: 'refs/tags/124.0.6367.207',
  patchsetVersion: '2026.04.30.1',
  platform: 'darwin',
  arch: 'arm64',
  artifactUrl: 'manual://fingerbrowser-kernel-v0.1.1-mac-arm64.zip',
  sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/Chromium',
  policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
};

export const DEFAULT_LINUX_KERNEL_RUNTIME_MANIFEST: KernelRuntimeManifest = {
  version: '0.1.1',
  baseChromiumRevision: 'refs/tags/124.0.6367.207',
  patchsetVersion: '2026.05.07.1',
  platform: 'linux',
  arch: 'x64',
  artifactUrl: 'manual://fingerbrowser-kernel-v0.1.1-linux-x64.tar.gz',
  sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  executableRelativePath: 'fingerbrowser-kernel/chrome',
  policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
};

export const DEFAULT_KERNEL_RUNTIME_MANIFEST = DEFAULT_DARWIN_KERNEL_RUNTIME_MANIFEST;

export function buildKernelPolicyDocument(profile: BrowserProfile): KernelPolicyDocument {
  return {
    schemaVersion: KERNEL_POLICY_SCHEMA_VERSION,
    profileId: profile.id,
    runtimeChannel: 'custom-kernel',
    fingerprintPolicy: profile.fingerprintPolicy
  };
}

export function writeKernelPolicyFile(profile: BrowserProfile): string {
  mkdirSync(profile.userDataDir, { recursive: true });
  const policyPath = path.join(profile.userDataDir, KERNEL_POLICY_FILE_NAME);
  writeFileSync(policyPath, `${JSON.stringify(buildKernelPolicyDocument(profile), null, 2)}\n`, { mode: 0o600 });
  return policyPath;
}

export function getCurrentKernelRuntimeTarget(): KernelRuntimeTarget {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(`当前平台暂不支持自研内核：${process.platform}`);
  }
  if (process.platform === 'darwin' && process.arch !== 'arm64') {
    throw new Error(`macOS 自研内核仅支持 arm64，当前架构为 ${process.arch}`);
  }
  if (process.platform === 'linux' && process.arch !== 'x64') {
    throw new Error(`Linux 服务器版自研内核仅支持 x64，当前架构为 ${process.arch}`);
  }
  return {
    platform: process.platform,
    arch: process.arch as KernelRuntimeArch
  };
}

export function defaultKernelRuntimeManifestForTarget(target: KernelRuntimeTarget): KernelRuntimeManifest {
  return target.platform === 'linux' ? DEFAULT_LINUX_KERNEL_RUNTIME_MANIFEST : DEFAULT_DARWIN_KERNEL_RUNTIME_MANIFEST;
}

export function validateKernelRuntimeManifest(
  input: unknown,
  target: KernelRuntimeTarget = getCurrentKernelRuntimeTarget()
): KernelRuntimeManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('自研内核 manifest 格式无效');
  }
  const manifest = input as KernelRuntimeManifest;
  const requiredStringFields: Array<keyof KernelRuntimeManifest> = [
    'version',
    'baseChromiumRevision',
    'patchsetVersion',
    'artifactUrl',
    'sha256',
    'executableRelativePath'
  ];
  for (const field of requiredStringFields) {
    if (typeof manifest[field] !== 'string' || !manifest[field]) {
      throw new Error(`自研内核 manifest 缺少字段：${field}`);
    }
  }
  if (manifest.platform !== 'darwin' && manifest.platform !== 'linux') {
    throw new Error(`自研内核 manifest 平台不支持：${String(manifest.platform)}`);
  }
  if (manifest.arch !== 'arm64' && manifest.arch !== 'x64') {
    throw new Error(`自研内核 manifest 架构不支持：${String(manifest.arch)}`);
  }
  if (manifest.platform !== target.platform || manifest.arch !== target.arch) {
    throw new Error(
      `自研内核 manifest 平台不匹配：需要 ${target.platform}/${target.arch}，收到 ${manifest.platform}/${manifest.arch}`
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('自研内核 sha256 格式无效');
  }
  if (manifest.policySchemaVersion !== KERNEL_POLICY_SCHEMA_VERSION) {
    throw new Error('自研内核策略 schema 版本不兼容');
  }
  return manifest;
}

export function loadKernelRuntimeManifestFile(
  manifestPath: string,
  target: KernelRuntimeTarget = getCurrentKernelRuntimeTarget()
): KernelRuntimeManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`自研内核 manifest 不存在：${manifestPath}`);
  }
  return validateKernelRuntimeManifest(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown, target);
}

export function verifyKernelArtifact(
  manifest: KernelRuntimeManifest,
  artifactPath: string
): { sha256: string; verified: true } {
  const sha256 = createHash('sha256').update(readFileSync(artifactPath)).digest('hex');
  if (sha256 !== manifest.sha256) {
    throw new Error('自研内核校验失败');
  }
  return { sha256, verified: true };
}

export function resolveKernelRuntimeRoot(dataDir: string, manifest: KernelRuntimeManifest): string {
  return path.join(dataDir, 'kernel-runtime', manifest.version);
}

export function resolveKernelExecutablePath(dataDir: string, manifest: KernelRuntimeManifest): string {
  return path.join(resolveKernelRuntimeRoot(dataDir, manifest), manifest.executableRelativePath);
}

function assertKernelExecutable(executablePath: string, manifest: KernelRuntimeManifest): void {
  if (!existsSync(executablePath)) {
    throw new Error('自研内核安装包缺少可执行文件');
  }
  if (manifest.platform === 'linux' && (statSync(executablePath).mode & 0o111) === 0) {
    throw new Error('Linux 自研内核可执行文件缺少执行权限');
  }
}

export function createKernelRuntimeManager(options: {
  dataDir: string;
  manifest?: KernelRuntimeManifest;
  environmentManifestPath?: string;
  settings?: AppSettingsService;
  target?: KernelRuntimeTarget;
}): KernelRuntimeManager {
  interface KernelRuntimeState {
    manifest: KernelRuntimeManifest;
    source: KernelManifestSource;
    manifestPath: string | null;
    importedAt: string | null;
    lastError?: string;
  }

  const target = options.target ?? getCurrentKernelRuntimeTarget();
  const defaultManifest = validateKernelRuntimeManifest(
    options.manifest ?? defaultKernelRuntimeManifestForTarget(target),
    target
  );

  function defaultState(lastError?: string): KernelRuntimeState {
    return {
      manifest: defaultManifest,
      source: 'default',
      manifestPath: null,
      importedAt: null,
      ...(lastError ? { lastError } : {})
    };
  }

  function environmentState(): KernelRuntimeState | null {
    if (!options.environmentManifestPath) {
      return null;
    }
    try {
      return {
        manifest: loadKernelRuntimeManifestFile(options.environmentManifestPath, target),
        source: 'environment',
        manifestPath: options.environmentManifestPath,
        importedAt: null
      };
    } catch (error) {
      return defaultState(error instanceof Error ? error.message : '自研内核环境变量 manifest 加载失败');
    }
  }

  function importedState(): KernelRuntimeState | null {
    const manifestPath = options.settings?.get('kernelManifestPath') ?? null;
    if (!manifestPath) {
      return null;
    }
    const importedAt = options.settings?.get('kernelManifestImportedAt') ?? null;
    try {
      return {
        manifest: loadKernelRuntimeManifestFile(manifestPath, target),
        source: 'imported',
        manifestPath,
        importedAt
      };
    } catch (error) {
      return {
        ...defaultState(error instanceof Error ? error.message : '自研内核 manifest 加载失败'),
        manifestPath,
        importedAt
      };
    }
  }

  function loadState(): KernelRuntimeState {
    return importedState() ?? environmentState() ?? defaultState();
  }

  let state = loadState();

  function status(): KernelRuntimeStatus {
    const executablePath = resolveKernelExecutablePath(options.dataDir, state.manifest);
    return {
      manifest: state.manifest,
      installed: existsSync(executablePath),
      executablePath,
      runtimeRoot: resolveKernelRuntimeRoot(options.dataDir, state.manifest),
      source: state.source,
      manifestPath: state.manifestPath,
      importedAt: state.importedAt,
      ...(state.lastError ? { lastError: state.lastError } : {})
    };
  }

  return {
    manifest: () => state.manifest,
    status,
    async ensureInstalled(): Promise<KernelInstallResult> {
      const current = status();
      if (current.installed) {
        assertKernelExecutable(current.executablePath, current.manifest);
        return {
          ...current,
          installed: true,
          alreadyInstalled: true
        };
      }
      if (current.manifest.artifactUrl.startsWith('file://')) {
        const artifactPath = fileURLToPath(current.manifest.artifactUrl);
        verifyKernelArtifact(current.manifest, artifactPath);
        mkdirSync(current.runtimeRoot, { recursive: true });
        if (current.manifest.platform === 'linux') {
          if (!artifactPath.endsWith('.tar.gz')) {
            throw new Error('Linux 自研内核安装包必须为 .tar.gz');
          }
          execFileSync('tar', ['-xzf', artifactPath, '-C', current.runtimeRoot]);
        } else {
          execFileSync('ditto', ['-x', '-k', artifactPath, current.runtimeRoot]);
        }
        const installed = status();
        if (!installed.installed) {
          throw new Error('自研内核安装包缺少可执行文件');
        }
        assertKernelExecutable(installed.executablePath, current.manifest);
        return {
          ...installed,
          installed: true,
          alreadyInstalled: false
        };
      } else {
        throw new Error(`自研内核未安装：请将 ${current.manifest.artifactUrl} 解压到 ${path.dirname(current.executablePath)} 后重试`);
      }
    },
    importManifest(manifestPath: string): KernelRuntimeStatus {
      const manifest = loadKernelRuntimeManifestFile(manifestPath, target);
      const importedAt = new Date().toISOString();
      options.settings?.set('kernelManifestPath', manifestPath);
      options.settings?.set('kernelManifestImportedAt', importedAt);
      state = {
        manifest,
        source: 'imported',
        manifestPath,
        importedAt
      };
      return status();
    },
    clearManifest(): KernelRuntimeStatus {
      options.settings?.delete('kernelManifestPath');
      options.settings?.delete('kernelManifestImportedAt');
      state = defaultState();
      return status();
    }
  };
}

export function createMockKernelRuntimeManager(executablePath: string): KernelRuntimeManager {
  const target = getCurrentKernelRuntimeTarget();
  const defaultManifest = validateKernelRuntimeManifest({
    ...defaultKernelRuntimeManifestForTarget(target),
    version: 'e2e-kernel',
    baseChromiumRevision: 'e2e-mock',
    patchsetVersion: 'e2e-mock',
    artifactUrl: 'mock://fingerbrowser-kernel',
    sha256: '1111111111111111111111111111111111111111111111111111111111111111'
  }, target);
  let manifest = defaultManifest;
  let source: KernelManifestSource = 'default';
  let manifestPath: string | null = null;
  let importedAt: string | null = null;
  const status = (): KernelRuntimeStatus => ({
    manifest,
    installed: true,
    executablePath,
    runtimeRoot: path.dirname(executablePath),
    source,
    manifestPath,
    importedAt
  });
  return {
    manifest: () => manifest,
    status,
    async ensureInstalled(): Promise<KernelInstallResult> {
      return {
        ...status(),
        installed: true,
        alreadyInstalled: true
      };
    },
    importManifest(nextManifestPath: string): KernelRuntimeStatus {
      manifest = loadKernelRuntimeManifestFile(nextManifestPath, target);
      source = 'imported';
      manifestPath = nextManifestPath;
      importedAt = new Date().toISOString();
      return status();
    },
    clearManifest(): KernelRuntimeStatus {
      manifest = defaultManifest;
      source = 'default';
      manifestPath = null;
      importedAt = null;
      return status();
    }
  };
}
