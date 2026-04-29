import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  BrowserProfile,
  FingerprintPolicy,
  KernelInstallResult,
  KernelRuntimeManifest,
  KernelRuntimeStatus,
  RuntimeChannel
} from '../../shared/types';

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
}

export const DEFAULT_KERNEL_RUNTIME_MANIFEST: KernelRuntimeManifest = {
  version: '0.1.0',
  baseChromiumRevision: 'stable',
  patchsetVersion: '2026.04.29.1',
  platform: 'darwin',
  arch: 'arm64',
  artifactUrl: 'manual://fingerbrowser-kernel-v0.1.0-mac-arm64.zip',
  sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/Chromium',
  policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
};

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

export function validateKernelRuntimeManifest(input: unknown): KernelRuntimeManifest {
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
  if (manifest.platform !== 'darwin' || manifest.arch !== 'arm64') {
    throw new Error('仅支持 macOS arm64 自研内核');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('自研内核 sha256 格式无效');
  }
  if (manifest.policySchemaVersion !== KERNEL_POLICY_SCHEMA_VERSION) {
    throw new Error('自研内核策略 schema 版本不兼容');
  }
  return manifest;
}

export function loadKernelRuntimeManifestFile(manifestPath: string): KernelRuntimeManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`自研内核 manifest 不存在：${manifestPath}`);
  }
  return validateKernelRuntimeManifest(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
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

export function resolveKernelExecutablePath(dataDir: string, manifest: KernelRuntimeManifest): string {
  return path.join(dataDir, 'kernel-runtime', manifest.version, manifest.executableRelativePath);
}

export function createKernelRuntimeManager(options: {
  dataDir: string;
  manifest?: KernelRuntimeManifest;
}): KernelRuntimeManager {
  const manifest = validateKernelRuntimeManifest(options.manifest ?? DEFAULT_KERNEL_RUNTIME_MANIFEST);

  function status(): KernelRuntimeStatus {
    const executablePath = resolveKernelExecutablePath(options.dataDir, manifest);
    return {
      manifest,
      installed: existsSync(executablePath),
      executablePath
    };
  }

  return {
    manifest: () => manifest,
    status,
    async ensureInstalled(): Promise<KernelInstallResult> {
      const current = status();
      if (current.installed) {
        return {
          ...current,
          installed: true,
          alreadyInstalled: true
        };
      }
      if (manifest.artifactUrl.startsWith('file://')) {
        const artifactPath = fileURLToPath(manifest.artifactUrl);
        verifyKernelArtifact(manifest, artifactPath);
        mkdirSync(path.dirname(current.executablePath), { recursive: true });
        execFileSync('ditto', ['-x', '-k', artifactPath, path.join(options.dataDir, 'kernel-runtime', manifest.version)]);
        const installed = status();
        if (!installed.installed) {
          throw new Error('自研内核安装包缺少可执行文件');
        }
        return {
          ...installed,
          installed: true,
          alreadyInstalled: false
        };
      } else {
        throw new Error(`自研内核未安装：请将 ${manifest.artifactUrl} 解压到 ${path.dirname(current.executablePath)} 后重试`);
      }
    }
  };
}

export function createMockKernelRuntimeManager(executablePath: string): KernelRuntimeManager {
  const manifest = validateKernelRuntimeManifest({
    ...DEFAULT_KERNEL_RUNTIME_MANIFEST,
    version: 'e2e-kernel',
    baseChromiumRevision: 'e2e-mock',
    patchsetVersion: 'e2e-mock',
    artifactUrl: 'mock://fingerbrowser-kernel',
    sha256: '1111111111111111111111111111111111111111111111111111111111111111'
  });
  const status = (): KernelRuntimeStatus => ({
    manifest,
    installed: true,
    executablePath
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
    }
  };
}
