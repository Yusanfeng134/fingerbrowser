# 管理员账号重置

当无法登录 FingerBrowser 后台时，可以使用本地 CLI 脚本恢复管理员账号。该脚本只更新本机 SQLite 数据库中的 `app_users` 记录，不会删除环境、代理、审计、Cookie、缓存、本地配置或浏览器 profile 目录。

## 使用前检查

1. 退出 FingerBrowser 应用，避免应用运行时同时写入数据库。
2. 确认操作者拥有本机数据目录或 SQLite 数据库文件的访问权限。
3. 准备新管理员密码。不要把密码写入 shell 历史、聊天记录或工单正文。

## 基本用法

推荐先用隐藏输入写入当前 shell 的环境变量，再执行脚本：

```bash
read -rsp "New admin password: " FINGERBROWSER_ADMIN_PASSWORD; echo
export FINGERBROWSER_ADMIN_PASSWORD
npm run admin:reset -- --email admin@example.com --data-dir "/absolute/path/to/fingerbrowser-data"
unset FINGERBROWSER_ADMIN_PASSWORD
```

也可以直接指定数据库文件：

```bash
read -rsp "New admin password: " FINGERBROWSER_ADMIN_PASSWORD; echo
export FINGERBROWSER_ADMIN_PASSWORD
npm run admin:reset -- --email admin@example.com --db "/absolute/path/to/fingerbrowser.sqlite"
unset FINGERBROWSER_ADMIN_PASSWORD
```

如果当前运维环境已经设置 `FINGERBROWSER_DATA_DIR`，可以省略 `--data-dir`：

```bash
read -rsp "New admin password: " FINGERBROWSER_ADMIN_PASSWORD; echo
export FINGERBROWSER_ADMIN_PASSWORD
FINGERBROWSER_DATA_DIR="/absolute/path/to/fingerbrowser-data" \
npm run admin:reset -- --email admin@example.com
unset FINGERBROWSER_ADMIN_PASSWORD
```

未设置 `FINGERBROWSER_ADMIN_PASSWORD` 且在交互式终端中运行时，脚本会使用隐藏输入并要求二次确认密码。

## 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--email <email>` | 是 | 目标管理员邮箱，会自动去除首尾空格并转为小写。 |
| `--display-name <name>` | 否 | 管理员显示名。更新已有用户时未传则保留原显示名；新建用户时默认 `管理员`。 |
| `--data-dir <dir>` | 三选一 | 数据目录，脚本会使用该目录下的 `fingerbrowser.sqlite`。 |
| `--db <file>` | 三选一 | 直接指定 SQLite 数据库文件。 |
| `FINGERBROWSER_DATA_DIR` | 三选一 | 未传 `--db` 或 `--data-dir` 时使用。 |
| `--json` | 否 | 输出不含密码、salt、hash 的 JSON，便于外部运维系统调用。 |
| `--allow-create-db` | 否 | 数据库文件不存在时允许创建新库。默认会拒绝缺失数据库，避免路径写错。 |

脚本不支持 `--password` 参数，避免明文密码出现在 shell 历史或系统进程列表中。

## 行为说明

- 目标邮箱存在时：保留原 `id`、`created_at`、`last_login_at`，更新为 `active admin` 并重置密码。
- 目标邮箱不存在时：创建新的 `active admin`，`last_login_at` 为空。
- 密码沿用应用内账号系统的 `scrypt` + 随机 salt 哈希方式，不保存明文密码。
- 成功输出不会包含明文密码、salt 或 password hash。

## 合规边界

管理员重置仅用于本机账号恢复和企业运维交接。该能力不提供、不承诺、不暗示任何平台风控绕过、账号农场、批量行为同步、验证码处理或平台规避能力。
