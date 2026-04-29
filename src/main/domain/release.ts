import type { ReleaseCheckResult } from '../../shared/types';

export const RELEASE_REPOSITORY = 'Yusanfeng134/fingerbrowser';
export const RELEASES_PAGE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases`;
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  prerelease?: boolean;
  body?: string;
  assets?: GitHubReleaseAsset[];
}

export interface ReleaseCheckOptions {
  currentVersion: string;
  fetchJson: (url: string) => Promise<unknown>;
  now?: () => Date;
}

export async function checkForUpdates(options: ReleaseCheckOptions): Promise<ReleaseCheckResult> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  try {
    const payload = await options.fetchJson(LATEST_RELEASE_API_URL);
    return {
      ...parseLatestRelease(payload, options.currentVersion),
      checkedAt
    };
  } catch (error) {
    return {
      status: 'error',
      currentVersion: options.currentVersion,
      releaseUrl: RELEASES_PAGE_URL,
      message: error instanceof Error ? `检查更新失败：${error.message}` : '检查更新失败',
      checkedAt
    };
  }
}

export function parseLatestRelease(payload: unknown, currentVersion: string): Omit<ReleaseCheckResult, 'checkedAt'> {
  if (!payload || typeof payload !== 'object') {
    return {
      status: 'unavailable',
      currentVersion,
      releaseUrl: RELEASES_PAGE_URL,
      message: '暂未找到 GitHub Release'
    };
  }
  const release = payload as GitHubReleasePayload;
  const latestVersion = normalizeVersion(release.tag_name ?? '');
  const releaseUrl = release.html_url ?? RELEASES_PAGE_URL;
  const asset = (release.assets ?? []).find((item) => item.name?.endsWith('-mac-arm64-trial.zip'));
  if (!latestVersion) {
    return {
      status: 'unavailable',
      currentVersion,
      releaseUrl,
      message: 'GitHub Release 缺少版本号'
    };
  }
  if (!asset?.name || !asset.browser_download_url) {
    return {
      status: 'unavailable',
      currentVersion,
      latestVersion,
      releaseUrl,
      message: '未找到 macOS 试卖包'
    };
  }
  const comparison = compareVersions(currentVersion, latestVersion);
  return {
    status: comparison < 0 ? 'update-available' : 'up-to-date',
    currentVersion,
    latestVersion,
    releaseUrl,
    assetName: asset.name,
    downloadUrl: asset.browser_download_url,
    message: comparison < 0 ? `发现新版本 ${latestVersion}` : '当前已是最新试卖版本'
  };
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number(part));
  const rightParts = normalizeVersion(right).split('.').map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart < rightPart) {
      return -1;
    }
    if (leftPart > rightPart) {
      return 1;
    }
  }
  return 0;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split('-')[0];
}
