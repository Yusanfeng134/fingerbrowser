import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface CredentialSafetyLabPageInput {
  dataDir: string;
  profileId: string;
  boundCredentialCount: number;
}

export interface CredentialSafetyLabPageResult {
  filePath: string;
  url: string;
  boundCredentialCount: number;
}

const LAB_USERNAME = 'lab-user@example.test';
const LAB_PASSWORD = 'LabOnly-Password-000';

export function writeCredentialSafetyLabPage(input: CredentialSafetyLabPageInput): CredentialSafetyLabPageResult {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.profileId)) {
    throw new Error('环境编号格式无效');
  }
  const boundCredentialCount = Math.max(0, Math.floor(input.boundCredentialCount));
  const dir = path.join(input.dataDir, 'security-lab', input.profileId);
  const filePath = path.join(dir, 'credential-safety-lab.html');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, credentialSafetyLabHtml(boundCredentialCount), 'utf8');
  return {
    filePath,
    url: pathToFileURL(filePath).toString(),
    boundCredentialCount
  };
}

function credentialSafetyLabHtml(boundCredentialCount: number): string {
  const labDataJson = JSON.stringify({
    username: LAB_USERNAME,
    password: LAB_PASSWORD,
    boundCredentialCount
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>本地密码安全实验</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #20312d;
      background: #f4f7f3;
    }
    body {
      margin: 0;
      padding: 28px;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    header {
      display: grid;
      gap: 7px;
    }
    h1, h2 {
      margin: 0;
      letter-spacing: 0;
    }
    h1 {
      font-size: 28px;
    }
    h2 {
      font-size: 17px;
    }
    p {
      margin: 0;
      line-height: 1.55;
      color: #607069;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
      gap: 14px;
    }
    section {
      border: 1px solid #d7dfd5;
      border-radius: 8px;
      background: #fff;
      padding: 16px;
      display: grid;
      gap: 14px;
      align-content: start;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #4f5d57;
    }
    input {
      min-height: 40px;
      border: 1px solid #cfd8cf;
      border-radius: 7px;
      padding: 0 11px;
      font: inherit;
      color: #20312d;
      background: #fbfdfb;
    }
    button {
      min-height: 40px;
      border: 0;
      border-radius: 7px;
      padding: 0 14px;
      font: inherit;
      font-weight: 750;
      color: #fff;
      background: #1f8875;
      cursor: pointer;
    }
    button.secondary {
      color: #1f8875;
      background: #e5f0ed;
    }
    dl {
      display: grid;
      gap: 10px;
      margin: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 10px;
      font-size: 13px;
    }
    dt {
      color: #69766f;
      font-weight: 750;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-weight: 700;
    }
    .note {
      border: 1px solid #d7dfd5;
      border-radius: 8px;
      padding: 12px 14px;
      background: #eaf2ef;
      color: #586760;
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    @media (max-width: 760px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>本地密码安全实验</h1>
      <p>这个页面只用于本地验证表单识别、字段匹配和日志脱敏。页面内置假账号和假密码，不读取真实密码库，也不连接真实站点。</p>
    </header>
    <p class="note">已绑定密码项：${boundCredentialCount}。真实账号、真实密码、代理凭据和客户内容不会写入此页面。</p>
    <div class="grid">
      <section>
        <h2>本地模拟登录表单</h2>
        <label>
          邮箱或用户名
          <input id="lab-username" name="username" autocomplete="username" placeholder="name@example.test" />
        </label>
        <label>
          登录密码
          <input id="lab-password" name="password" type="password" autocomplete="current-password" />
        </label>
        <div class="actions">
          <button id="detect-button" type="button" class="secondary">重新识别字段</button>
          <button id="fill-button" type="button">使用假凭据填入本地表单</button>
        </div>
      </section>
      <section>
        <h2>验证报告</h2>
        <dl>
          <div class="row"><dt>页面来源</dt><dd id="origin-result">本地文件</dd></div>
          <div class="row"><dt>用户名字段</dt><dd id="username-result">等待检测</dd></div>
          <div class="row"><dt>密码字段</dt><dd id="password-result">等待检测</dd></div>
          <div class="row"><dt>脱敏预览</dt><dd id="redacted-result">等待检测</dd></div>
          <div class="row"><dt>填入状态</dt><dd id="fill-result">未填入</dd></div>
        </dl>
      </section>
    </div>
  </main>
  <script id="lab-data" type="application/json">${labDataJson}</script>
  <script>
    const labData = JSON.parse(document.getElementById('lab-data').textContent || '{}');
    const text = (id, value) => {
      document.getElementById(id).textContent = value;
    };
    const redacted = (value) => value ? value.replace(/./g, '•') : '空';

    function findUsernameField() {
      return document.querySelector('input[autocomplete="username"]')
        || document.querySelector('input[type="email"]')
        || document.querySelector('input[name*="user" i]')
        || document.querySelector('input[name*="email" i]')
        || document.querySelector('input[type="text"]')
        || document.querySelector('input:not([type])');
    }

    function findPasswordField() {
      return document.querySelector('input[autocomplete="current-password"]')
        || document.querySelector('input[type="password"]')
        || document.querySelector('input[name*="pass" i]');
    }

    function detectFields() {
      const usernameField = findUsernameField();
      const passwordField = findPasswordField();
      text('username-result', usernameField ? '#' + usernameField.id + ' / name=' + usernameField.name : '未识别');
      text('password-result', passwordField ? '#' + passwordField.id + ' / type=' + passwordField.type : '未识别');
      text('redacted-result', labData.username + ' / ' + redacted(labData.password));
      return { usernameField, passwordField };
    }

    document.getElementById('detect-button').addEventListener('click', () => {
      detectFields();
      text('fill-result', '仅完成字段识别');
    });

    document.getElementById('fill-button').addEventListener('click', () => {
      const fields = detectFields();
      if (!fields.usernameField || !fields.passwordField) {
        text('fill-result', '字段不完整，未填入');
        return;
      }
      fields.usernameField.value = labData.username;
      fields.passwordField.value = labData.password;
      text('fill-result', '已使用本地假凭据填入');
    });

    detectFields();
  </script>
</body>
</html>`;
}
