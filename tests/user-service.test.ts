import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createUserService } from '../src/main/domain/user-service';
import { openApplicationDatabase } from '../src/main/infrastructure/database';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-user-test-'));
  tempDirs.push(dataDir);
  const db = openApplicationDatabase(path.join(dataDir, 'app.sqlite'));
  const userService = createUserService({ db });
  return { db, userService };
}

describe('user service', () => {
  it('bootstraps the first local admin and stores only a salted password hash', () => {
    const { db, userService } = createHarness();

    const status = userService.bootstrap({
      email: ' Admin@Example.Test ',
      displayName: '管理员',
      password: 'AdminPass123!'
    });
    const stored = db.prepare('select * from app_users where email = ?').get('admin@example.test') as {
      password_salt: string;
      password_hash: string;
    };

    expect(status.authenticated).toBe(true);
    expect(status.currentUser).toMatchObject({
      email: 'admin@example.test',
      displayName: '管理员',
      role: 'admin',
      status: 'active'
    });
    expect(stored.password_salt).not.toBe('');
    expect(stored.password_hash).not.toContain('AdminPass123!');
    expect(JSON.stringify(status)).not.toContain('AdminPass123!');
    expect(() =>
      userService.bootstrap({
        email: 'other@example.test',
        displayName: '其他管理员',
        password: 'OtherPass123!'
      })
    ).toThrow('管理员账号已初始化');
  });

  it('requires valid active credentials for login and tracks the current audit actor', () => {
    const { userService } = createHarness();
    userService.bootstrap({
      email: 'admin@example.test',
      displayName: '管理员',
      password: 'AdminPass123!'
    });
    userService.logout();

    expect(userService.status()).toMatchObject({
      bootstrapped: true,
      authenticated: false,
      currentUser: null
    });
    expect(() => userService.requireAuthenticated()).toThrow('请先登录');
    expect(() => userService.login({ email: 'admin@example.test', password: 'wrong-password' })).toThrow(
      '邮箱或密码错误'
    );

    const loginStatus = userService.login({
      email: 'ADMIN@example.test',
      password: 'AdminPass123!'
    });

    expect(loginStatus.authenticated).toBe(true);
    expect(loginStatus.currentUser?.email).toBe('admin@example.test');
    expect(userService.currentActor()).toBe('admin@example.test');
  });

  it('lets admins create and disable users while blocking disabled logins and self-disable', () => {
    const { userService } = createHarness();
    userService.bootstrap({
      email: 'admin@example.test',
      displayName: '管理员',
      password: 'AdminPass123!'
    });

    const member = userService.createUser({
      email: 'member@example.test',
      displayName: '运营成员',
      password: 'MemberPass123!',
      role: 'member'
    });

    expect(member).toMatchObject({
      email: 'member@example.test',
      displayName: '运营成员',
      role: 'member',
      status: 'active'
    });
    expect(userService.listUsers().map((user) => user.email)).toEqual(['admin@example.test', 'member@example.test']);
    expect(() => userService.updateUser({ id: userService.status().currentUser?.id ?? '', status: 'disabled' })).toThrow(
      '不能停用当前登录用户'
    );

    userService.updateUser({ id: member.id, status: 'disabled' });
    userService.logout();

    expect(() => userService.login({ email: 'member@example.test', password: 'MemberPass123!' })).toThrow(
      '用户已停用'
    );
  });
});
