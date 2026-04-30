import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChromiumLaunchPlan } from '../src/main/domain/chromium';
import { createAppSettingsService } from '../src/main/domain/app-settings-service';
import {
  DEFAULT_KERNEL_RUNTIME_MANIFEST,
  KERNEL_POLICY_SCHEMA_VERSION,
  buildKernelPolicyDocument,
  createKernelRuntimeManager,
  loadKernelRuntimeManifestFile,
  validateKernelRuntimeManifest,
  verifyKernelArtifact
} from '../src/main/domain/kernel-runtime';
import { openApplicationDatabase } from '../src/main/infrastructure/database';
import type { BrowserProfile, KernelRuntimeManifest } from '../src/shared/types';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-kernel-test-'));
  tempDirs.push(dir);
  return dir;
}

function createProfile(runtimeChannel: BrowserProfile['runtimeChannel'] = 'custom-kernel'): BrowserProfile {
  return {
    id: 'profile-1',
    name: '内核环境',
    tags: ['合规'],
    status: 'closed',
    userDataDir: '/tmp/fingerbrowser/profile-1',
    chromiumVersion: 'stable',
    runtimeChannel,
    fingerprintPolicy: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      windowSize: { width: 1360, height: 900 },
      permissionDefaults: 'deny',
      webrtcIpPolicy: 'disable_non_proxied_udp'
    },
    proxyId: null,
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z'
  };
}

describe('kernel runtime domain', () => {
  it('advertises the latest local custom kernel patchset in the default manifest', () => {
    expect(DEFAULT_KERNEL_RUNTIME_MANIFEST.patchsetVersion).toBe('2026.04.30.1');
  });

  it('builds a redacted policy document from the existing fingerprint policy', () => {
    const policy = buildKernelPolicyDocument(createProfile());

    expect(policy).toEqual({
      schemaVersion: KERNEL_POLICY_SCHEMA_VERSION,
      profileId: 'profile-1',
      runtimeChannel: 'custom-kernel',
      fingerprintPolicy: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        windowSize: { width: 1360, height: 900 },
        permissionDefaults: 'deny',
        webrtcIpPolicy: 'disable_non_proxied_udp'
      }
    });
    expect(JSON.stringify(policy)).not.toMatch(/password|token|secret|encrypted|cookie/i);
  });

  it('validates custom kernel manifests and artifact checksums', () => {
    const dir = createTempDir();
    const artifactPath = path.join(dir, 'fingerbrowser-kernel-v0.1.0-mac-arm64.zip');
    writeFileSync(artifactPath, 'kernel-runtime-zip');
    const sha256 = createHash('sha256').update('kernel-runtime-zip').digest('hex');
    const manifest: KernelRuntimeManifest = {
      version: '0.1.0',
      baseChromiumRevision: '1234567',
      patchsetVersion: '2026.04.29.1',
      platform: 'darwin',
      arch: 'arm64',
      artifactUrl: `file://${artifactPath}`,
      sha256,
      executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/FingerBrowser Kernel',
      policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
    };

    expect(validateKernelRuntimeManifest(manifest)).toEqual(manifest);
    expect(verifyKernelArtifact(manifest, artifactPath)).toEqual({ sha256, verified: true });
    expect(() => validateKernelRuntimeManifest({ ...manifest, platform: 'linux' })).toThrow('仅支持 macOS arm64 自研内核');
    expect(() => verifyKernelArtifact({ ...manifest, sha256: 'bad' }, artifactPath)).toThrow('自研内核校验失败');
  });

  it('adds kernel policy launch args only for the custom runtime channel', () => {
    const customPlan = buildChromiumLaunchPlan({
      executablePath: '/Applications/FingerBrowser Kernel.app/Contents/MacOS/FingerBrowser Kernel',
      profile: createProfile('custom-kernel'),
      proxy: null,
      kernelPolicyPath: '/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json'
    });
    const officialPlan = buildChromiumLaunchPlan({
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      profile: createProfile('official'),
      proxy: null
    });

    expect(customPlan.args).toContain('--fingerbrowser-policy=/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json');
    expect(customPlan.args).toContain('--lang=zh-CN');
    expect(customPlan.env.TZ).toBe('Asia/Shanghai');
    expect(officialPlan.args).not.toContain(expect.stringContaining('--fingerbrowser-policy='));
    expect(() =>
      buildChromiumLaunchPlan({
        executablePath: '/Applications/FingerBrowser Kernel.app/Contents/MacOS/FingerBrowser Kernel',
        profile: createProfile('custom-kernel'),
        proxy: null
      })
    ).toThrow('自研内核缺少策略文件');
  });

  it('reports a readable error when the custom kernel runtime is not installed', async () => {
    const dir = createTempDir();
    const manager = createKernelRuntimeManager({ dataDir: dir });

    expect(manager.status()).toMatchObject({
      installed: false,
      executablePath: path.join(dir, 'kernel-runtime', '0.1.0', 'FingerBrowser Kernel.app/Contents/MacOS/Chromium')
    });
    await expect(manager.ensureInstalled()).rejects.toThrow('自研内核未安装');
  });

  it('loads a custom kernel manifest from the build-machine output file', () => {
    const dir = createTempDir();
    const manifestPath = path.join(dir, 'fingerbrowser-kernel.manifest.json');
    const manifest: KernelRuntimeManifest = {
      version: '0.2.0',
      baseChromiumRevision: 'chromium-abcdef',
      patchsetVersion: '2026.04.30.1',
      platform: 'darwin',
      arch: 'arm64',
      artifactUrl: 'file:///tmp/fingerbrowser-kernel-v0.2.0-mac-arm64.zip',
      sha256: '2222222222222222222222222222222222222222222222222222222222222222',
      executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/Chromium',
      policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(loadKernelRuntimeManifestFile(manifestPath)).toEqual(manifest);
    expect(() => loadKernelRuntimeManifestFile(path.join(dir, 'missing.json'))).toThrow('自研内核 manifest 不存在');
  });

  it('persists an imported custom kernel manifest and reloads it after service restart', () => {
    const dir = createTempDir();
    const db = openApplicationDatabase(path.join(dir, 'fingerbrowser.sqlite'));
    const settings = createAppSettingsService({ db });
    const manifestPath = path.join(dir, 'fingerbrowser-kernel.manifest.json');
    const manifest: KernelRuntimeManifest = {
      version: '0.3.0',
      baseChromiumRevision: 'chromium-fixed-revision',
      patchsetVersion: '2026.05.06.1',
      platform: 'darwin',
      arch: 'arm64',
      artifactUrl: 'file:///tmp/fingerbrowser-kernel-v0.3.0-mac-arm64.zip',
      sha256: '3333333333333333333333333333333333333333333333333333333333333333',
      executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/Chromium',
      policySchemaVersion: KERNEL_POLICY_SCHEMA_VERSION
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const manager = createKernelRuntimeManager({ dataDir: dir, settings });
    const importedStatus = manager.importManifest(manifestPath);
    const reloadedManager = createKernelRuntimeManager({ dataDir: dir, settings });

    expect(importedStatus.manifest.version).toBe('0.3.0');
    expect(importedStatus.source).toBe('imported');
    expect(importedStatus.manifestPath).toBe(manifestPath);
    expect(importedStatus.importedAt).toEqual(expect.any(String));
    expect(reloadedManager.status()).toMatchObject({
      source: 'imported',
      manifestPath,
      manifest: { version: '0.3.0' }
    });

    const cleared = reloadedManager.clearManifest();
    expect(cleared.source).toBe('default');
    expect(createKernelRuntimeManager({ dataDir: dir, settings }).status().source).toBe('default');
  });
});
