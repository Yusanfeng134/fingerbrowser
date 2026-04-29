import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createManualActivationCode } from '../src/main/domain/license';

test('中文 UI 完成激活 license、新建环境、代理测试、导出审计和上限拦截', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-e2e-'));
  const activationCode = createManualActivationCode({
    signingSecret: 'fingerbrowser-commercial-trial-dev-secret',
    planId: 'trial',
    teamName: 'E2E 试卖团队',
    issuedAt: new Date('2026-04-29T08:00:00.000Z'),
    expiresAt: new Date(Date.now() + 86_400_000),
    overrides: { profileLimit: 1 }
  });
  const proxyServer = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
  const address = proxyServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address');
  }

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      FINGERBROWSER_E2E: '1',
      FINGERBROWSER_DATA_DIR: dataDir
    }
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '指纹浏览器' })).toBeVisible();

    await page.getByRole('tab', { name: '密码' }).click();
    await expect(page.getByText('密码库需要有效许可证')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存密码项' })).toHaveCount(0);

    await page.getByRole('tab', { name: '授权' }).click();
    await page.getByLabel('激活码').fill(activationCode);
    await page.getByRole('button', { name: '激活许可证' }).last().click();
    await expect(page.getByText('E2E 试卖团队 试用版 已激活')).toBeVisible();
    await expect(page.getByText(/环境用量 0\/1/)).toBeVisible();

    await page.getByRole('button', { name: '新建环境' }).click();
    await page.getByLabel('环境名称').fill('E2E 运营环境');
    await page.getByLabel('标签').fill('合规,测试');
    await page.getByLabel('代理主机').fill('127.0.0.1');
    await page.getByLabel('代理端口').fill(String(address.port));
    await page.getByLabel('代理账号').fill('operator');
    await page.getByLabel('代理密码').fill('proxy-password');
    await page.getByRole('button', { name: '保存环境' }).click();

    await expect(page.getByRole('heading', { name: 'E2E 运营环境' })).toBeVisible();
    await expect(page.getByText(/环境 1\/1/)).toBeVisible();

    await page.getByRole('tab', { name: '密码' }).click();
    await page.getByLabel('密码名称').fill('运营后台');
    await page.getByLabel('网站地址').fill('https://console.example.test/login');
    await page.getByLabel('登录用户名').fill('operator@example.test');
    await page.getByLabel('登录密码').fill('credential-secret');
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByText('运营后台')).toBeVisible();
    await expect(page.getByText('https://console.example.test/login')).toBeVisible();
    await expect(page.getByText('credential-secret')).toHaveCount(0);

    await page.getByLabel('搜索密码').fill('console');
    await expect(page.getByText('运营后台')).toBeVisible();
    await page.getByRole('button', { name: '复制账号 运营后台' }).click();
    await expect(page.getByText('账号已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '复制密码 运营后台' }).click();
    await expect(page.getByText('密码已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '编辑密码项 运营后台' }).click();
    await page.getByLabel('登录用户名').fill('updated@example.test');
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByText('updated@example.test')).toBeVisible();
    await page.getByRole('button', { name: '删除密码项 运营后台' }).click();
    await expect(page.getByText('暂无密码项')).toBeVisible();

    await page.getByRole('tab', { name: '配置' }).click();
    await page.getByRole('button', { name: '测试代理' }).click();
    await expect(page.getByText(/代理连通/)).toBeVisible();

    await page.getByRole('button', { name: '启动 Chromium' }).click();
    await expect(page.getByText('运行中')).toBeVisible();
    await page.getByRole('button', { name: '关闭环境' }).click();
    await expect(page.getByText('已关闭')).toBeVisible();

    await page.getByRole('button', { name: '新建环境' }).click();
    await expect(page.getByText('当前套餐环境数已达上限')).toBeVisible();

    await page.getByRole('tab', { name: '审计' }).click();
    await page.getByRole('button', { name: '导出审计' }).click();
    await expect(page.getByText(/审计已导出/)).toBeVisible();
    await expect(page.getByText('CREDENTIAL_CREATED')).toBeVisible();
    await expect(page.getByText('CREDENTIAL_PASSWORD_COPIED')).toBeVisible();
    await expect(page.getByText('CREDENTIAL_DELETED')).toBeVisible();
    await expect(page.getByText('PROFILE_LAUNCHED')).toBeVisible();
    await expect(page.getByText('PROFILE_STOPPED')).toBeVisible();
    await expect(page.getByText('proxy-password')).toHaveCount(0);
    await expect(page.getByText('credential-secret')).toHaveCount(0);
    await expect(page.getByText(activationCode)).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
});
