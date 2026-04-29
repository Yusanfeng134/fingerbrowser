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
    await expect(page.getByText('试卖上手清单')).toBeVisible();

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

    const sideNav = page.getByRole('navigation', { name: '主导航' });
    await sideNav.getByRole('link', { name: '审计' }).click();
    await expect(sideNav.getByRole('link', { name: '审计' })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: '导出审计' })).toBeVisible();
    await sideNav.getByRole('link', { name: '授权' }).click();
    await expect(sideNav.getByRole('link', { name: '授权' })).toHaveClass(/active/);
    await expect(page.getByText('授权中心')).toBeVisible();
    await sideNav.getByRole('link', { name: '试卖' }).click();
    await expect(sideNav.getByRole('link', { name: '试卖' })).toHaveClass(/active/);
    await expect(page.getByText('版本中心')).toBeVisible();
    await sideNav.getByRole('link', { name: '设置' }).click();
    await expect(sideNav.getByRole('link', { name: '设置' })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: '保存环境' })).toBeVisible();
    await sideNav.getByRole('link', { name: '环境' }).click();
    await expect(sideNav.getByRole('link', { name: '环境' })).toHaveClass(/active/);

    await page.getByRole('link', { name: '密码库' }).click();
    await expect(page.getByLabel('密码库菜单')).toBeVisible();
    await page.locator('#password-vault').getByRole('button', { name: '新增密码' }).click();
    await page.getByLabel('全局密码名称').fill('全局邮箱');
    await page.getByLabel('全局网站地址').fill('https://mail.example.test/login');
    await page.getByLabel('全局登录用户名').fill('mail@example.test');
    await page.getByLabel('全局登录密码').fill('global-credential-secret');
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();
    await expect(page.locator('.vault-list-row').filter({ hasText: '全局邮箱' }).getByText('未绑定环境')).toBeVisible();
    await expect(page.getByText('global-credential-secret')).toHaveCount(0);

    await page.getByLabel('搜索全局密码').fill('mail');
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();
    await page.getByRole('button', { name: '复制账号 全局邮箱' }).click();
    await expect(page.getByText('账号已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '复制密码 全局邮箱' }).click();
    await expect(page.getByText('密码已复制到剪贴板')).toBeVisible();
    await page.getByLabel('密码库菜单').getByRole('button', { name: /最近复制/ }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();
    await page.getByRole('button', { name: '编辑密码项 全局邮箱' }).click();
    await page.getByLabel('绑定环境').selectOption({ label: 'E2E 运营环境' });
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.locator('.vault-list-row').filter({ hasText: '全局邮箱' }).getByText('E2E 运营环境')).toBeVisible();

    await page.getByLabel('密码库菜单').getByRole('button', { name: /未绑定环境/ }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toHaveCount(0);
    await page.getByLabel('密码库菜单').getByRole('button', { name: /已绑定环境/ }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();
    await page.getByLabel('密码库菜单').getByRole('button', { name: /E2E 运营环境/ }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();

    await page.getByRole('link', { name: '环境' }).click();
    await page.getByRole('tab', { name: '密码' }).click();
    await expect(page.getByText('全局邮箱')).toBeVisible();
    await page.getByLabel('密码名称').fill('环境后台');
    await page.getByLabel('网站地址').fill('https://console.example.test/login');
    await page.getByLabel('登录用户名').fill('operator@example.test');
    await page.getByLabel('登录密码').fill('environment-credential-secret');
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByText('环境后台')).toBeVisible();
    await expect(page.getByText('https://console.example.test/login')).toBeVisible();
    await expect(page.getByText('environment-credential-secret')).toHaveCount(0);

    await page.getByLabel('搜索密码').fill('console');
    await expect(page.getByText('环境后台')).toBeVisible();
    await page.getByRole('button', { name: '复制账号 环境后台' }).click();
    await expect(page.getByText('账号已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '复制密码 环境后台' }).click();
    await expect(page.getByText('密码已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '编辑密码项 环境后台' }).click();
    await page.getByLabel('登录用户名').fill('updated@example.test');
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByText('updated@example.test')).toBeVisible();

    await page.getByRole('button', { name: '打开密码库' }).click();
    await page.getByLabel('搜索全局密码').fill('');
    await expect(page.getByRole('heading', { name: 'E2E 运营环境' })).toBeVisible();
    await expect(page.getByLabel('全局密码列表').getByText('环境后台')).toBeVisible();
    await expect(page.locator('.vault-list-row').filter({ hasText: '环境后台' }).getByText('E2E 运营环境')).toBeVisible();
    await page.locator('.vault-list-row').filter({ hasText: '环境后台' }).click();
    await page.getByRole('button', { name: '删除密码项 环境后台' }).click();
    await expect(page.getByText('环境后台')).toHaveCount(0);

    await page.getByRole('link', { name: '环境' }).click();

    await page.getByRole('tab', { name: '试卖' }).click();
    await expect(page.getByText(/完成度/)).toBeVisible();
    await expect(page.getByText(/当前版本：/)).toBeVisible();
    await page.getByRole('button', { name: '检查更新' }).click();
    await expect(page.locator('.notice-bar').getByText('检查更新失败：E2E 更新检查模拟失败')).toBeVisible();
    await page.getByLabel('客户团队').fill('E2E 试卖团队');
    await page.getByLabel('联系方式').fill('operator@example.test');
    await page.getByLabel('问题描述').fill('E2E 反馈：试卖流程可完成');
    await page.getByRole('button', { name: '生成反馈包' }).click();
    await expect(page.getByText(/反馈包已生成/)).toBeVisible();
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('UPDATE_CHECKED')).toBeVisible();
    await expect(page.getByText('FEEDBACK_PACKAGED')).toBeVisible();

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
    await expect(page.getByText('global-credential-secret')).toHaveCount(0);
    await expect(page.getByText('environment-credential-secret')).toHaveCount(0);
    await expect(page.getByText(activationCode)).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
});
