import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createUserService } from '../src/main/domain/user-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];
const scriptPath = path.join(process.cwd(), 'scripts/reset-admin.mjs');

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-admin-reset-test-'));
  tempDirs.push(dir);
  return dir;
}

function createDatabase(dataDir: string): void {
  const db = openApplicationDatabase(path.join(dataDir, 'fingerbrowser.sqlite'));
  db.close();
}

function runResetAdmin(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const nextEnv = {
    ...process.env,
    ...env
  };
  if (env.FINGERBROWSER_ADMIN_PASSWORD === undefined) {
    delete nextEnv.FINGERBROWSER_ADMIN_PASSWORD;
  }

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: nextEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function openUserService(dataDir: string) {
  const db = openApplicationDatabase(path.join(dataDir, 'fingerbrowser.sqlite'));
  return {
    db,
    userService: createUserService({ db })
  };
}

describe('admin reset script', () => {
  it('creates an active admin in an existing empty user table', () => {
    const dataDir = createTempDir();
    createDatabase(dataDir);
    const password = 'ResetPass123!';

    const result = runResetAdmin(['--email', ' Admin@Example.Test ', '--data-dir', dataDir, '--json'], {
      FINGERBROWSER_ADMIN_PASSWORD: password
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      action: 'created',
      email: 'admin@example.test',
      role: 'admin',
      status: 'active'
    });
    expect(result.stdout).not.toContain(password);

    const { db, userService } = openUserService(dataDir);
    const loginStatus = userService.login({ email: 'admin@example.test', password });
    expect(loginStatus.authenticated).toBe(true);
    expect(loginStatus.currentUser).toMatchObject({
      email: 'admin@example.test',
      displayName: '管理员',
      role: 'admin',
      status: 'active'
    });
    db.close();
  });

  it('resets an existing disabled member to active admin without removing other users', () => {
    const dataDir = createTempDir();
    const { db, userService } = openUserService(dataDir);
    userService.bootstrap({
      email: 'owner@example.test',
      displayName: 'Owner',
      password: 'OwnerPass123!'
    });
    const member = userService.createUser({
      email: 'member@example.test',
      displayName: 'Member',
      password: 'OldPass123!',
      role: 'member'
    });
    userService.updateUser({ id: member.id, status: 'disabled' });
    db.close();

    const newPassword = 'NewPass123!';
    const result = runResetAdmin(
      ['--email', 'member@example.test', '--display-name', 'Recovered Admin', '--data-dir', dataDir, '--json'],
      {
        FINGERBROWSER_ADMIN_PASSWORD: newPassword
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      action: 'updated',
      email: 'member@example.test',
      displayName: 'Recovered Admin',
      role: 'admin',
      status: 'active'
    });

    const after = openUserService(dataDir);
    expect(() => after.userService.login({ email: 'member@example.test', password: 'OldPass123!' })).toThrow(
      '邮箱或密码错误'
    );
    expect(after.userService.login({ email: 'member@example.test', password: newPassword }).currentUser).toMatchObject({
      email: 'member@example.test',
      displayName: 'Recovered Admin',
      role: 'admin',
      status: 'active'
    });
    expect(after.userService.listUsers().map((user) => user.email)).toEqual([
      'owner@example.test',
      'member@example.test'
    ]);
    after.db.close();
  });

  it('does not print plaintext password, salt, or hash in text or json output', () => {
    const dataDir = createTempDir();
    createDatabase(dataDir);
    const password = 'NoLeakPass123!';

    const result = runResetAdmin(['--email', 'admin@example.test', '--data-dir', dataDir, '--json'], {
      FINGERBROWSER_ADMIN_PASSWORD: password
    });

    expect(result.status).toBe(0);
    const db = new Database(path.join(dataDir, 'fingerbrowser.sqlite'));
    const row = db.prepare('select password_salt, password_hash from app_users where email = ?').get(
      'admin@example.test'
    ) as { password_salt: string; password_hash: string };
    db.close();
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(combinedOutput).not.toContain(password);
    expect(combinedOutput).not.toContain(row.password_salt);
    expect(combinedOutput).not.toContain(row.password_hash);

    const textResult = runResetAdmin(['--email', 'admin@example.test', '--data-dir', dataDir], {
      FINGERBROWSER_ADMIN_PASSWORD: 'AnotherPass123!'
    });
    expect(textResult.status).toBe(0);
    expect(`${textResult.stdout}\n${textResult.stderr}`).not.toContain('AnotherPass123!');
  });

  it('rejects missing databases by default and only creates one with an explicit flag', () => {
    const dataDir = createTempDir();
    const password = 'CreateDbPass123!';

    const rejected = runResetAdmin(['--email', 'admin@example.test', '--data-dir', dataDir], {
      FINGERBROWSER_ADMIN_PASSWORD: password
    });

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('数据库文件不存在');

    const accepted = runResetAdmin(['--email', 'admin@example.test', '--data-dir', dataDir, '--allow-create-db'], {
      FINGERBROWSER_ADMIN_PASSWORD: password
    });

    expect(accepted.status).toBe(0);
    const { db, userService } = openUserService(dataDir);
    expect(userService.login({ email: 'admin@example.test', password }).authenticated).toBe(true);
    db.close();
  });

  it('fails in non-interactive mode when no password environment variable is provided', () => {
    const dataDir = createTempDir();
    mkdirSync(dataDir, { recursive: true });
    createDatabase(dataDir);

    const result = runResetAdmin(['--email', 'admin@example.test', '--data-dir', dataDir], {
      FINGERBROWSER_ADMIN_PASSWORD: undefined
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('请设置 FINGERBROWSER_ADMIN_PASSWORD');
  });
});
