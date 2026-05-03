import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type {
  AppUser,
  AuthStatus,
  BootstrapUserInput,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
  UserRole,
  UserStatus
} from '../../shared/types';
import type { ApplicationDatabase } from '../infrastructure/database';

interface CreateUserServiceOptions {
  db: ApplicationDatabase;
  now?: () => Date;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  password_salt: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserService {
  status(): AuthStatus;
  bootstrap(input: BootstrapUserInput): AuthStatus;
  login(input: LoginInput): AuthStatus;
  logout(): AuthStatus;
  requireAuthenticated(): AppUser;
  requireAdmin(): AppUser;
  currentActor(): string;
  listUsers(): AppUser[];
  createUser(input: CreateUserInput): AppUser;
  updateUser(input: UpdateUserInput): AppUser;
}

const PASSWORD_HASH_LENGTH = 64;

export function createUserService(options: CreateUserServiceOptions): UserService {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  let currentUser: AppUser | null = null;

  function normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new Error('邮箱格式无效');
    }
    return normalized;
  }

  function normalizeDisplayName(displayName: string): string {
    const normalized = displayName.trim();
    if (!normalized) {
      throw new Error('用户名称不能为空');
    }
    return normalized;
  }

  function normalizePassword(password: string): string {
    if (password.length < 8) {
      throw new Error('密码至少需要 8 位');
    }
    return password;
  }

  function normalizeRole(role: UserRole): UserRole {
    return role === 'admin' ? 'admin' : 'member';
  }

  function normalizeStatus(status: UserStatus): UserStatus {
    return status === 'disabled' ? 'disabled' : 'active';
  }

  function hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, PASSWORD_HASH_LENGTH).toString('base64url');
  }

  function createPasswordSecret(password: string): { salt: string; hash: string } {
    const salt = randomBytes(16).toString('base64url');
    return {
      salt,
      hash: hashPassword(password, salt)
    };
  }

  function verifyPassword(password: string, row: UserRow): boolean {
    const expected = Buffer.from(row.password_hash, 'base64url');
    const actual = Buffer.from(hashPassword(password, row.password_salt), 'base64url');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  function mapUser(row: UserRow): AppUser {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    };
  }

  function getUserRowByEmail(email: string): UserRow | null {
    return (db.prepare('select * from app_users where email = ?').get(email) as UserRow | undefined) ?? null;
  }

  function getUserRowById(id: string): UserRow {
    const row = db.prepare('select * from app_users where id = ?').get(id) as UserRow | undefined;
    if (!row) {
      throw new Error('用户不存在');
    }
    return row;
  }

  function isBootstrapped(): boolean {
    const row = db.prepare('select count(*) as count from app_users').get() as { count: number };
    return row.count > 0;
  }

  function authStatus(): AuthStatus {
    return {
      bootstrapped: isBootstrapped(),
      authenticated: Boolean(currentUser),
      currentUser
    };
  }

  function setLastLogin(row: UserRow): AppUser {
    const loggedInAt = now().toISOString();
    db.prepare('update app_users set last_login_at = ?, updated_at = ? where id = ?').run(loggedInAt, loggedInAt, row.id);
    const next = mapUser({
      ...row,
      updated_at: loggedInAt,
      last_login_at: loggedInAt
    });
    currentUser = next;
    return next;
  }

  function requireAuthenticated(): AppUser {
    if (!currentUser) {
      throw new Error('请先登录');
    }
    if (currentUser.status !== 'active') {
      currentUser = null;
      throw new Error('用户已停用');
    }
    return currentUser;
  }

  function requireAdmin(): AppUser {
    const user = requireAuthenticated();
    if (user.role !== 'admin') {
      throw new Error('需要管理员权限');
    }
    return user;
  }

  return {
    status: authStatus,
    bootstrap(input: BootstrapUserInput): AuthStatus {
      if (isBootstrapped()) {
        throw new Error('管理员账号已初始化');
      }
      const email = normalizeEmail(input.email);
      const displayName = normalizeDisplayName(input.displayName);
      const password = normalizePassword(input.password);
      const secret = createPasswordSecret(password);
      const id = randomUUID();
      const createdAt = now().toISOString();

      db.prepare(
        `insert into app_users (
          id, email, display_name, role, status, password_salt, password_hash, created_at, updated_at, last_login_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, email, displayName, 'admin', 'active', secret.salt, secret.hash, createdAt, createdAt, createdAt);

      currentUser = {
        id,
        email,
        displayName,
        role: 'admin',
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: createdAt
      };
      return authStatus();
    },
    login(input: LoginInput): AuthStatus {
      const email = normalizeEmail(input.email);
      const row = getUserRowByEmail(email);
      if (!row || !verifyPassword(input.password, row)) {
        throw new Error('邮箱或密码错误');
      }
      if (row.status !== 'active') {
        throw new Error('用户已停用');
      }
      setLastLogin(row);
      return authStatus();
    },
    logout(): AuthStatus {
      currentUser = null;
      return authStatus();
    },
    requireAuthenticated,
    requireAdmin,
    currentActor(): string {
      return currentUser?.email ?? 'local-user';
    },
    listUsers(): AppUser[] {
      requireAdmin();
      const rows = db.prepare('select * from app_users order by created_at asc').all() as UserRow[];
      return rows.map(mapUser);
    },
    createUser(input: CreateUserInput): AppUser {
      requireAdmin();
      const email = normalizeEmail(input.email);
      if (getUserRowByEmail(email)) {
        throw new Error('用户邮箱已存在');
      }
      const displayName = normalizeDisplayName(input.displayName);
      const password = normalizePassword(input.password);
      const role = normalizeRole(input.role);
      const secret = createPasswordSecret(password);
      const id = randomUUID();
      const createdAt = now().toISOString();
      db.prepare(
        `insert into app_users (
          id, email, display_name, role, status, password_salt, password_hash, created_at, updated_at, last_login_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, email, displayName, role, 'active', secret.salt, secret.hash, createdAt, createdAt, null);
      return mapUser(getUserRowById(id));
    },
    updateUser(input: UpdateUserInput): AppUser {
      const actor = requireAdmin();
      const existing = getUserRowById(input.id);
      const nextStatus = input.status ? normalizeStatus(input.status) : existing.status;
      if (actor.id === existing.id && nextStatus === 'disabled') {
        throw new Error('不能停用当前登录用户');
      }
      const nextDisplayName =
        typeof input.displayName === 'string' ? normalizeDisplayName(input.displayName) : existing.display_name;
      const nextRole = input.role ? normalizeRole(input.role) : existing.role;
      const updatedAt = now().toISOString();
      db.prepare(
        `update app_users
         set display_name = ?, role = ?, status = ?, updated_at = ?
         where id = ?`
      ).run(nextDisplayName, nextRole, nextStatus, updatedAt, existing.id);

      const updated = mapUser(getUserRowById(existing.id));
      if (currentUser?.id === updated.id) {
        currentUser = updated;
      }
      return updated;
    }
  };
}
