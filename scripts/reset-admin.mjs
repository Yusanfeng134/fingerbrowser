#!/usr/bin/env node

import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { Writable } from 'node:stream';
import path from 'node:path';
import readline from 'node:readline/promises';
import Database from 'better-sqlite3';

const PASSWORD_HASH_LENGTH = 64;
const DATABASE_FILE_NAME = 'fingerbrowser.sqlite';

main().catch((error) => {
  const isJson = process.argv.includes('--json');
  const message = error instanceof Error ? error.message : String(error);
  if (isJson) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const email = normalizeEmail(requireValue(args.email, '缺少 --email'));
  const dbPath = resolveDatabasePath(args);
  const password = normalizePassword(await resolvePassword());
  const displayName = args.displayName === undefined ? undefined : normalizeDisplayName(args.displayName);
  const result = resetAdmin({
    dbPath,
    email,
    displayName,
    password,
    allowCreateDb: args.allowCreateDb
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }

  const actionText = result.action === 'created' ? '已创建' : '已更新';
  process.stdout.write(`管理员账号${actionText}：${result.email} (${result.status} ${result.role})\n`);
}

function parseArgs(values) {
  const parsed = {
    allowCreateDb: false,
    json: false,
    help: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      throw new Error(`未知参数：${value}`);
    }

    const name = value.slice(2);
    if (name === 'json') {
      parsed.json = true;
      continue;
    }
    if (name === 'allow-create-db') {
      parsed.allowCreateDb = true;
      continue;
    }
    if (name === 'help' || name === 'h') {
      parsed.help = true;
      continue;
    }
    if (name === 'password') {
      throw new Error('不支持 --password；请使用 FINGERBROWSER_ADMIN_PASSWORD 或终端隐藏输入');
    }

    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`参数 --${name} 缺少值`);
    }

    if (name === 'email') {
      parsed.email = next;
    } else if (name === 'display-name') {
      parsed.displayName = next;
    } else if (name === 'db') {
      parsed.db = next;
    } else if (name === 'data-dir') {
      parsed.dataDir = next;
    } else {
      throw new Error(`未知参数：--${name}`);
    }
    index += 1;
  }

  return parsed;
}

function resolveDatabasePath(args) {
  if (args.db && args.dataDir) {
    throw new Error('请只使用 --db 或 --data-dir 其中一种数据库定位方式');
  }

  if (args.db) {
    return path.resolve(args.db);
  }

  const dataDir = args.dataDir ?? process.env.FINGERBROWSER_DATA_DIR;
  if (!dataDir || !dataDir.trim()) {
    throw new Error('请通过 --db、--data-dir 或 FINGERBROWSER_DATA_DIR 指定数据库位置');
  }
  return path.join(path.resolve(dataDir), DATABASE_FILE_NAME);
}

async function resolvePassword() {
  const environmentPassword = process.env.FINGERBROWSER_ADMIN_PASSWORD;
  if (environmentPassword && environmentPassword.length > 0) {
    return environmentPassword;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('请设置 FINGERBROWSER_ADMIN_PASSWORD，或在交互式终端中运行隐藏输入');
  }

  const password = await promptHidden('新管理员密码：');
  const confirmed = await promptHidden('再次输入新管理员密码：');
  if (password !== confirmed) {
    throw new Error('两次输入的密码不一致');
  }
  return password;
}

async function promptHidden(prompt) {
  const output = new MutableOutput();
  process.stdout.write(prompt);
  output.muted = true;
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true
  });

  try {
    const answer = await rl.question('');
    process.stdout.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}

class MutableOutput extends Writable {
  constructor() {
    super();
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  }
}

function resetAdmin(input) {
  if (!existsSync(input.dbPath)) {
    if (!input.allowCreateDb) {
      throw new Error(`数据库文件不存在：${input.dbPath}。如需创建新库，请显式添加 --allow-create-db`);
    }
    mkdirSync(path.dirname(input.dbPath), { recursive: true });
  }

  const db = new Database(input.dbPath);
  try {
    db.pragma('journal_mode = WAL');
    ensureAppUsersTable(db);
    return db.transaction(() => {
      const existing = db.prepare('select * from app_users where email = ?').get(input.email);
      const now = new Date().toISOString();
      const secret = createPasswordSecret(input.password);

      if (existing) {
        const displayName = input.displayName ?? existing.display_name;
        db.prepare(
          `update app_users
           set display_name = ?, role = ?, status = ?, password_salt = ?, password_hash = ?, updated_at = ?
           where id = ?`
        ).run(displayName, 'admin', 'active', secret.salt, secret.hash, now, existing.id);
        return {
          action: 'updated',
          id: existing.id,
          email: input.email,
          displayName,
          role: 'admin',
          status: 'active',
          updatedAt: now
        };
      }

      const id = randomUUID();
      const displayName = input.displayName ?? '管理员';
      db.prepare(
        `insert into app_users (
          id, email, display_name, role, status, password_salt, password_hash, created_at, updated_at, last_login_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, input.email, displayName, 'admin', 'active', secret.salt, secret.hash, now, now, null);
      return {
        action: 'created',
        id,
        email: input.email,
        displayName,
        role: 'admin',
        status: 'active',
        updatedAt: now
      };
    })();
  } finally {
    db.close();
  }
}

function ensureAppUsersTable(db) {
  db.exec(`
    create table if not exists app_users (
      id text primary key,
      email text not null unique,
      display_name text not null,
      role text not null,
      status text not null,
      password_salt text not null,
      password_hash text not null,
      created_at text not null,
      updated_at text not null,
      last_login_at text
    );
  `);
}

function normalizeEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('邮箱格式无效');
  }
  return normalized;
}

function normalizeDisplayName(displayName) {
  const normalized = displayName.trim();
  if (!normalized) {
    throw new Error('用户名称不能为空');
  }
  return normalized;
}

function normalizePassword(password) {
  if (password.length < 8) {
    throw new Error('密码至少需要 8 位');
  }
  return password;
}

function createPasswordSecret(password) {
  const salt = randomBytes(16).toString('base64url');
  return {
    salt,
    hash: scryptSync(password, salt, PASSWORD_HASH_LENGTH).toString('base64url')
  };
}

function requireValue(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message);
  }
  return value;
}

function printHelp() {
  process.stdout.write(`FingerBrowser 管理员账号重置

用法：
  read -rsp "New admin password: " FINGERBROWSER_ADMIN_PASSWORD; echo
  export FINGERBROWSER_ADMIN_PASSWORD
  npm run admin:reset -- --email admin@example.com --data-dir /absolute/data/dir
  unset FINGERBROWSER_ADMIN_PASSWORD

参数：
  --email <email>              必填，目标管理员邮箱
  --display-name <name>        可选，目标管理员显示名
  --data-dir <dir>             数据目录，脚本会使用其中的 ${DATABASE_FILE_NAME}
  --db <file>                  直接指定 SQLite 数据库文件
  --json                       输出安全 JSON
  --allow-create-db            数据库文件不存在时允许创建
  --help                       显示帮助
`);
}
