import { describe, expect, it } from 'vitest';
import { resolveChromiumSpawnCommand } from '../src/main/infrastructure/chromium-spawn';

describe('Chromium spawn command policy', () => {
  it('wraps Linux server launches with xvfb-run when DISPLAY is missing', () => {
    const spawnCommand = resolveChromiumSpawnCommand({
      executablePath: '/opt/fingerbrowser/kernel/chrome',
      args: ['--user-data-dir=/tmp/profile'],
      env: {},
      platform: 'linux',
      serverMode: true,
      commandExists: (command) => command === 'xvfb-run'
    });

    expect(spawnCommand).toEqual({
      command: 'xvfb-run',
      args: ['-a', '/opt/fingerbrowser/kernel/chrome', '--user-data-dir=/tmp/profile'],
      env: {}
    });
  });

  it('returns a readable setup error when xvfb-run is missing', () => {
    expect(() =>
      resolveChromiumSpawnCommand({
        executablePath: '/opt/fingerbrowser/kernel/chrome',
        args: [],
        env: {},
        platform: 'linux',
        serverMode: true,
        commandExists: () => false
      })
    ).toThrow('请安装 xvfb');
  });

  it('uses the Chromium executable directly when DISPLAY exists or server mode is disabled', () => {
    expect(
      resolveChromiumSpawnCommand({
        executablePath: '/opt/fingerbrowser/kernel/chrome',
        args: ['--user-data-dir=/tmp/profile'],
        env: { DISPLAY: ':99' },
        platform: 'linux',
        serverMode: true,
        commandExists: () => false
      })
    ).toMatchObject({
      command: '/opt/fingerbrowser/kernel/chrome',
      args: ['--user-data-dir=/tmp/profile']
    });

    expect(
      resolveChromiumSpawnCommand({
        executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
        args: [],
        env: {},
        platform: 'darwin',
        serverMode: false,
        commandExists: () => false
      })
    ).toMatchObject({
      command: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      args: []
    });
  });
});
