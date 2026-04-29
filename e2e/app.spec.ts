import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

test('中文 UI 完成新建环境、代理测试、启动关闭和审计查看', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-e2e-'));
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

    await page.getByRole('button', { name: '新建环境' }).click();
    await page.getByLabel('环境名称').fill('E2E 运营环境');
    await page.getByLabel('标签').fill('合规,测试');
    await page.getByLabel('代理主机').fill('127.0.0.1');
    await page.getByLabel('代理端口').fill(String(address.port));
    await page.getByLabel('代理账号').fill('operator');
    await page.getByLabel('代理密码').fill('proxy-password');
    await page.getByRole('button', { name: '保存环境' }).click();

    await expect(page.getByRole('heading', { name: 'E2E 运营环境' })).toBeVisible();
    await page.getByRole('button', { name: '测试代理' }).click();
    await expect(page.getByText(/代理连通/)).toBeVisible();

    await page.getByRole('button', { name: '启动 Chromium' }).click();
    await expect(page.getByText('运行中')).toBeVisible();
    await page.getByRole('button', { name: '关闭环境' }).click();
    await expect(page.getByText('已关闭')).toBeVisible();

    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('PROFILE_LAUNCHED')).toBeVisible();
    await expect(page.getByText('PROFILE_STOPPED')).toBeVisible();
    await expect(page.getByText('proxy-password')).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
});
