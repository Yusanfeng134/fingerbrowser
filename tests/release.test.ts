import { describe, expect, it } from 'vitest';
import { compareVersions, parseLatestRelease } from '../src/main/domain/release';

describe('release domain', () => {
  it('compares semantic versions for update checks', () => {
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1);
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.2.0', '1.2.1')).toBe(-1);
  });

  it('parses latest GitHub release data with the mac trial asset', () => {
    const release = parseLatestRelease(
      {
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/Yusanfeng134/fingerbrowser/releases/tag/v0.2.0',
        prerelease: true,
        body: '试卖更新说明',
        assets: [
          {
            name: 'fingerbrowser-v0.2.0-mac-arm64-trial.zip',
            browser_download_url: 'https://example.test/download.zip'
          },
          {
            name: 'checksums.txt',
            browser_download_url: 'https://example.test/checksums.txt'
          }
        ]
      },
      '0.1.0'
    );

    expect(release).toMatchObject({
      status: 'update-available',
      latestVersion: '0.2.0',
      releaseUrl: 'https://github.com/Yusanfeng134/fingerbrowser/releases/tag/v0.2.0',
      assetName: 'fingerbrowser-v0.2.0-mac-arm64-trial.zip',
      downloadUrl: 'https://example.test/download.zip'
    });
  });

  it('handles missing releases and missing mac assets with readable statuses', () => {
    expect(parseLatestRelease(null, '0.1.0')).toMatchObject({
      status: 'unavailable',
      message: '暂未找到 GitHub Release'
    });
    expect(
      parseLatestRelease(
        {
          tag_name: 'v0.2.0',
          html_url: 'https://example.test/release',
          prerelease: true,
          assets: []
        },
        '0.1.0'
      )
    ).toMatchObject({
      status: 'unavailable',
      message: '未找到 macOS 试卖包'
    });
  });
});
