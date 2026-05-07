import { existsSync } from 'node:fs';
import path from 'node:path';

export interface ChromiumSpawnCommandInput {
  executablePath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  serverMode?: boolean;
  commandExists?: (command: string) => boolean;
}

export interface ChromiumSpawnCommand {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export function resolveChromiumSpawnCommand(input: ChromiumSpawnCommandInput): ChromiumSpawnCommand {
  const platform = input.platform ?? process.platform;
  const commandExists = input.commandExists ?? ((command) => commandExistsInPath(command, input.env));
  if (platform === 'linux' && input.serverMode === true && !input.env.DISPLAY) {
    if (!commandExists('xvfb-run')) {
      throw new Error('服务器模式未检测到 DISPLAY，且缺少 xvfb-run；请安装 xvfb 后重试');
    }
    return {
      command: 'xvfb-run',
      args: ['-a', input.executablePath, ...input.args],
      env: input.env
    };
  }
  return {
    command: input.executablePath,
    args: input.args,
    env: input.env
  };
}

export function commandExistsInPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(path.join(directory, command)));
}
