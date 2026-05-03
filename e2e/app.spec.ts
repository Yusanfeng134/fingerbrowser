import { _electron as electron, expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createManualActivationCode } from '../src/main/domain/license';

test('中文 UI 完成激活 license、新建环境、代理测试、导出审计和上限拦截', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-e2e-'));
  const importedManifestPath = path.join(dataDir, 'fingerbrowser-kernel-e2e.manifest.json');
  const importedArtifactPath = path.join(dataDir, 'fingerbrowser-kernel-e2e.zip');
  writeFileSync(importedArtifactPath, 'e2e imported kernel');
  writeFileSync(
    importedManifestPath,
    JSON.stringify({
      version: 'e2e-imported-kernel',
      baseChromiumRevision: 'refs/tags/e2e-imported',
      patchsetVersion: 'e2e-imported',
      platform: 'darwin',
      arch: 'arm64',
      artifactUrl: `file://${importedArtifactPath}`,
      sha256: createHash('sha256').update('e2e imported kernel').digest('hex'),
      executableRelativePath: 'FingerBrowser Kernel.app/Contents/MacOS/Chromium',
      policySchemaVersion: 1
    })
  );
  const activationCode = createManualActivationCode({
    signingSecret: 'fingerbrowser-commercial-trial-dev-secret',
    planId: 'trial',
    teamName: 'E2E 试卖团队',
    issuedAt: new Date('2026-04-29T08:00:00.000Z'),
    expiresAt: new Date(Date.now() + 86_400_000),
    overrides: { profileLimit: 4 }
  });
  const proxySockets = new Set<net.Socket>();
  const proxyServer = net.createServer((socket) => {
    proxySockets.add(socket);
    socket.once('close', () => proxySockets.delete(socket));
    socket.once('data', () => {
      const body = JSON.stringify({
        status: 'success',
        query: '203.0.113.8',
        timezone: 'America/Los_Angeles',
        country: 'United States',
        regionName: 'California',
        city: 'Los Angeles'
      });
      socket.end(`HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    });
  });
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
    await expect(page.getByRole('heading', { name: '创建管理员账号' })).toBeVisible();
    await page.getByLabel('管理员邮箱').fill('admin@example.test');
    await page.getByLabel('管理员名称').fill('E2E 管理员');
    await page.getByLabel('管理员密码').fill('AdminPass123!');
    await page.getByRole('button', { name: '创建管理员' }).click();
    await expect(page.getByRole('heading', { name: '指纹浏览器' })).toBeVisible();
    await expect(page.getByLabel('当前用户')).toContainText('E2E 管理员');
    await expect(page.getByText('试卖上手清单')).toHaveCount(0);
    await expect(page.getByText('试卖清单')).toHaveCount(0);

    await page.getByRole('tab', { name: '密码' }).click();
    await expect(page.getByText('密码库需要有效许可证')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存密码项' })).toHaveCount(0);

    await page.getByRole('tab', { name: '授权' }).click();
    await page.getByLabel('激活码').fill(activationCode);
    await page.getByRole('button', { name: '激活许可证' }).last().click();
    await expect(page.getByText('E2E 试卖团队 试用版 已激活')).toBeVisible();
    await expect(page.getByText(/环境用量 0\/4/)).toBeVisible();

    await page.getByRole('button', { name: '新建环境' }).click();
    await page.getByLabel('环境名称').fill('E2E 运营环境');
    await page.getByLabel('负责人').fill('E2E 负责人');
    await page.getByLabel('环境备注').fill('E2E 客户试卖备注');
    await page.getByLabel('环境分组').fill('E2E 项目组');
    await page.getByLabel('标签', { exact: true }).fill('合规,测试');
    await page.getByLabel('代理主机').fill('127.0.0.1');
    await page.getByLabel('代理端口').fill(String(address.port));
    await page.getByLabel('代理账号').fill('operator');
    await page.getByLabel('代理密码').fill('proxy-password');
    await expect(page.getByRole('button', { name: '读取系统代理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '扫描本机端口' })).toBeVisible();
    await page.getByLabel('时区', { exact: true }).selectOption('America/Chicago');
    await page.getByRole('button', { name: '根据代理匹配时区' }).click();
    await expect(page.getByLabel('时区', { exact: true })).toHaveValue('America/Los_Angeles');
    await expect(page.getByText(/已匹配代理 IP 时区 America\/Los_Angeles/)).toBeVisible();
    await expect(page.getByLabel('内核通道')).toHaveValue('official');
    await page.getByRole('button', { name: '保存环境' }).click();

    await expect(page.getByRole('heading', { name: 'E2E 运营环境' })).toBeVisible();
    await expect(page.getByText(/环境 1\/4/)).toBeVisible();
    await expect(page.getByLabel('环境列表').getByText('E2E 负责人')).toBeVisible();
    await page.getByLabel('搜索环境').fill('客户试卖备注');
    await expect(page.getByLabel('环境列表').getByText('E2E 运营环境')).toBeVisible();
    await page.getByLabel('搜索环境').fill('');

    const sideNav = page.getByRole('navigation', { name: '主导航' });
    await expect(sideNav.getByRole('link', { name: '环境' })).toBeVisible();
    await expect(sideNav.getByRole('link', { name: '我的桌面' })).toBeVisible();
    await expect(sideNav.getByRole('link', { name: '代理池' })).toBeVisible();
    await expect(sideNav.getByRole('link', { name: '密码库' })).toBeVisible();
    await expect(sideNav.getByRole('link', { name: '审计' })).toHaveCount(0);
    await expect(sideNav.getByRole('link', { name: '设置' })).toHaveCount(0);
    await expect(sideNav.getByRole('link', { name: '试卖' })).toHaveCount(0);
    await expect(sideNav.getByRole('link', { name: '授权' })).toHaveCount(0);
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByRole('button', { name: '导出审计' })).toBeVisible();
    await page.getByRole('tab', { name: '用户' }).click();
    await expect(page.getByLabel('用户列表').getByText('E2E 管理员')).toBeVisible();
    await page.getByLabel('新用户邮箱').fill('member@example.test');
    await page.getByLabel('新用户名称').fill('E2E 成员');
    await page.getByLabel('新用户初始密码').fill('MemberPass123!');
    await page.getByRole('button', { name: '创建用户' }).click();
    await expect(page.getByLabel('用户列表').getByText('E2E 成员')).toBeVisible();
    await page.getByRole('tab', { name: '授权' }).click();
    await expect(page.getByText('授权中心')).toBeVisible();
    await page.getByRole('tab', { name: '试卖' }).click();
    await expect(page.getByText('版本中心')).toBeVisible();
    await page.getByRole('tab', { name: '配置' }).click();
    await expect(page.getByRole('button', { name: '保存环境' })).toBeVisible();

    await sideNav.getByRole('link', { name: '代理池' }).click();
    await expect(page.getByRole('heading', { name: '代理池' })).toBeVisible();
    await page.getByRole('button', { name: '新增代理' }).click();
    await page.getByLabel('代理名称').fill('E2E 洛杉矶代理');
    await page.getByLabel('代理池协议').selectOption('http');
    await page.getByLabel('代理池主机').fill('127.0.0.1');
    await page.getByLabel('代理池端口').fill(String(address.port));
    await page.getByLabel('代理池账号').fill('pool-operator');
    await page.getByLabel('代理池密码').fill('pool-proxy-password');
    await page.getByLabel('代理地区').fill('US-CA');
    await page.getByLabel('代理时区').selectOption('America/Los_Angeles');
    await page.getByLabel('代理标签').fill('US,住宅');
    await page.getByRole('button', { name: '保存代理' }).click();
    await expect(page.getByLabel('代理池列表').getByText('E2E 洛杉矶代理')).toBeVisible();
    await page.getByLabel('代理池列表').getByText('E2E 洛杉矶代理').click();
    await page.getByRole('button', { name: '测试代理' }).click();
    await expect(page.getByText(/代理连通/)).toBeVisible();
    await page.getByRole('button', { name: '应用到当前环境' }).click();
    await expect(page.getByText(/已应用代理到环境：E2E 运营环境/)).toBeVisible();
    await sideNav.getByRole('link', { name: '环境' }).click();
    await expect(page.getByLabel('环境列表').getByText('E2E 项目组')).toBeVisible();

    await page.evaluate(async (manifestPath) => window.fingerBrowser.kernel.importManifest(manifestPath), importedManifestPath);
    await page.reload();
    await expect(page.getByText('来源：应用内导入')).toBeVisible();
    await expect(page.getByText('版本：e2e-imported-kernel')).toBeVisible();
    await sideNav.getByRole('link', { name: '环境' }).click();
    await expect(sideNav.getByRole('link', { name: '环境' })).toHaveClass(/active/);

    await page.getByRole('link', { name: '密码库' }).click();
    await expect(page.getByLabel('密码库菜单')).toBeVisible();
    await page.locator('#password-vault').getByRole('button', { name: '新增密码' }).click();
    await page.getByLabel('全局密码名称').fill('全局邮箱');
    await page.getByLabel('全局网站地址').fill('https://mail.example.test/login');
    await page.getByLabel('全局登录用户名').fill('mail@example.test');
    await page.getByRole('button', { name: '打开全局随机密码面板' }).click();
    await expect(page.getByLabel('密码生成器')).toBeVisible();
    await page.getByLabel('密码长度').fill('24');
    await page.getByRole('button', { name: '使用密码' }).click();
    await expect(page.getByRole('textbox', { name: '全局登录密码' })).not.toHaveValue('');
    const globalGeneratedPassword = await page.getByRole('textbox', { name: '全局登录密码' }).inputValue();
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByLabel('全局密码列表').getByText('全局邮箱')).toBeVisible();
    await expect(page.locator('.vault-list-row').filter({ hasText: '全局邮箱' }).getByText('未绑定环境')).toBeVisible();
    await page.getByRole('button', { name: '查看密码 全局邮箱' }).click();
    await expect(page.getByText(globalGeneratedPassword)).toBeVisible();
    await page.getByRole('button', { name: '隐藏密码 全局邮箱' }).click();
    await expect(page.getByText(globalGeneratedPassword)).toHaveCount(0);

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
    await page.getByRole('button', { name: '打开登录随机密码面板' }).click();
    await expect(page.getByLabel('密码生成器')).toBeVisible();
    await page.getByLabel('包含符号').uncheck();
    await page.getByRole('button', { name: '使用密码' }).click();
    await expect(page.getByRole('textbox', { name: '登录密码' })).not.toHaveValue('');
    const profileGeneratedPassword = await page.getByRole('textbox', { name: '登录密码' }).inputValue();
    await page.getByRole('button', { name: '保存密码项' }).click();
    await expect(page.getByText('环境后台')).toBeVisible();
    await expect(page.getByText('https://console.example.test/login')).toBeVisible();

    await page.getByLabel('搜索密码').fill('console');
    await expect(page.getByText('环境后台')).toBeVisible();
    await page.getByRole('button', { name: '查看密码 环境后台' }).click();
    await expect(page.getByText(profileGeneratedPassword)).toBeVisible();
    await page.getByRole('button', { name: '隐藏密码 环境后台' }).click();
    await expect(page.getByText(profileGeneratedPassword)).toHaveCount(0);
    await page.getByRole('button', { name: '复制账号 环境后台' }).click();
    await expect(page.getByText('账号已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '复制密码 环境后台' }).click();
    await expect(page.getByText('密码已复制到剪贴板')).toBeVisible();
    await page.getByRole('button', { name: '编辑密码项 环境后台' }).click();
    await page.getByLabel('登录用户名').fill('updated@example.test');
    await page.getByRole('button', { name: '打开登录随机密码面板' }).click();
    await page.getByRole('button', { name: '重新生成' }).click();
    await page.getByRole('button', { name: '使用密码' }).click();
    await expect(page.getByRole('textbox', { name: '登录密码' })).not.toHaveValue('');
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
    await expect(page.getByText(/试卖清单/)).toHaveCount(0);
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

    await page.getByRole('button', { name: '添加到桌面' }).click();
    await expect(page.getByText(/已添加到我的桌面：E2E 运营环境/)).toBeVisible();
    await sideNav.getByRole('link', { name: '我的桌面' }).click();
    await expect(page.getByRole('heading', { name: '我的桌面' })).toBeVisible();
    await expect(page.getByLabel('我的桌面快捷方式').getByText('E2E 运营环境')).toBeVisible();
    await page.getByRole('button', { name: '新建文件夹' }).click();
    await expect(page.getByText(/已创建文件夹：新建文件夹/)).toBeVisible();
    const openedEmptyFolder = page.getByRole('dialog', { name: '桌面文件夹 新建文件夹' });
    await expect(openedEmptyFolder).toBeVisible();
    await expect(openedEmptyFolder).toContainText('拖拽环境图标到这里');
    await page.getByRole('button', { name: '关闭文件夹 新建文件夹' }).click();
    await page.getByRole('button', { name: '打开 新建文件夹' }).click();
    await expect(openedEmptyFolder).toBeVisible();
    await page.getByRole('button', { name: '关闭文件夹 新建文件夹' }).click();
    await expect(page.locator('.desktop-shortcut').filter({ hasText: 'E2E 运营环境' })).toBeVisible();
    await expect(page.locator('.desktop-folder-shortcut').filter({ hasText: '新建文件夹' })).toBeVisible();
    await page.evaluate(() => {
      const source = [...document.querySelectorAll<HTMLElement>('.desktop-shortcut:not(.desktop-folder-shortcut)')].find(
        (element) => element.textContent?.includes('E2E 运营环境')
      );
      const target = [...document.querySelectorAll<HTMLElement>('.desktop-folder-shortcut')].find((element) =>
        element.textContent?.includes('新建文件夹')
      );
      if (!source || !target) {
        throw new Error('Desktop drag source or target missing');
      }
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    });
    await expect(page.getByText(/桌面已整理/)).toBeVisible();
    const desktopFolderPanel = page.getByRole('dialog', { name: '桌面文件夹 新建文件夹' });
    await expect(desktopFolderPanel).toBeVisible();
    await expect(desktopFolderPanel.getByText('E2E 运营环境')).toBeVisible();
    await page.getByRole('button', { name: '启动文件夹快捷方式 E2E 运营环境' }).click();
    await expect(page.getByText(/已启动：E2E 运营环境/)).toBeVisible();
    await sideNav.getByRole('link', { name: '环境' }).click();
    await expect(page.getByLabel('环境列表').getByText('运行中').first()).toBeVisible();
    await expect(page.getByLabel('本地代理状态')).toContainText('运行中');
    await expect(page.getByLabel('本地代理状态')).toContainText('HTTP');
    const checkPagePath = path.join(dataDir, 'environment-check', 'environment-check.html');
    expect(existsSync(checkPagePath)).toBe(true);
    const checkPageHtml = readFileSync(checkPagePath, 'utf8');
    expect(checkPageHtml).toContain('合规环境自检');
    expect(checkPageHtml).toContain('proxy-diagnostic');
    expect(checkPageHtml).toContain('"ip":"203.0.113.8"');
    expect(checkPageHtml).toContain('"ipTimezone":"America/Los_Angeles"');
    expect(checkPageHtml).toContain('主进程代理检测结果');
    expect(checkPageHtml).toContain('启动预检');
    expect(checkPageHtml).toContain('主进程代理预检通过');
    expect(checkPageHtml).not.toContain('proxy-password');
    await page.getByRole('button', { name: '关闭环境' }).click();
    await expect(page.getByLabel('环境列表').getByText('已关闭').first()).toBeVisible();
    await expect(page.getByLabel('本地代理状态')).toContainText('未启动');
    await sideNav.getByRole('link', { name: '我的桌面' }).click();
    await page.getByRole('button', { name: '移出' }).click();
    await expect(page.getByText(/已移出：E2E 运营环境/)).toBeVisible();
    await page.getByRole('button', { name: '删除文件夹' }).click();
    await expect(page.getByText(/已删除文件夹：新建文件夹/)).toBeVisible();
    await page.getByRole('button', { name: '移除桌面快捷方式 E2E 运营环境' }).click();
    await expect(page.getByText(/已从我的桌面移除：E2E 运营环境/)).toBeVisible();
    await expect(page.getByLabel('我的桌面快捷方式').getByText('E2E 运营环境')).toHaveCount(0);
    await sideNav.getByRole('link', { name: '环境' }).click();

    await page.getByLabel('内核通道').selectOption('custom-kernel');
    await page.getByLabel('Google API Key').fill('e2e-google-api-key');
    await page.getByLabel('Google OAuth Client ID').fill('e2e-google-client-id');
    await page.getByLabel('Google OAuth Client Secret').fill('e2e-google-client-secret');
    await page.getByLabel('启用自研内核 Google 账号登录支持').check();
    await page.getByRole('button', { name: '保存 Google 配置' }).click();
    await expect(page.getByText(/Google 账号登录支持已启用/)).toBeVisible();
    await expect(page.getByLabel('Google 账号登录配置')).toContainText('已启用');
    await expect(page.getByText('e2e-google-client-secret')).toHaveCount(0);
    await page.getByRole('button', { name: '启动 Chromium' }).click();
    await expect(page.getByLabel('环境列表').getByText('运行中').first()).toBeVisible();
    await expect(page.getByLabel('最后启动时间')).not.toHaveValue('尚未启动');
    await page.getByRole('button', { name: '关闭环境' }).click();
    await expect(page.getByLabel('环境列表').getByText('已关闭').first()).toBeVisible();
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('KERNEL_LAUNCHED')).toBeVisible();
    await page.getByRole('tab', { name: '配置' }).click();
    await page.getByRole('button', { name: '复制环境' }).click();
    await expect(page.getByText(/已复制环境：E2E 运营环境 副本/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E 运营环境 副本' })).toBeVisible();
    await expect(page.getByText(/环境 2\/4/)).toBeVisible();
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('PROFILE_DUPLICATED')).toBeVisible();
    await expect(page.getByText('proxy-password')).toHaveCount(0);
    await page.getByRole('tab', { name: '配置' }).click();
    await page.getByLabel('模板名称').fill('E2E 客服模板');
    await page.getByRole('button', { name: '保存为模板' }).click();
    await expect(page.getByText(/已保存模板：E2E 客服模板/)).toBeVisible();
    await expect(page.getByLabel('选择环境模板')).toHaveValue(/.+/);
    await page.getByRole('button', { name: '从模板创建' }).click();
    await expect(page.getByText(/已从模板创建环境：E2E 客服模板 环境 3/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E 客服模板 环境 3' })).toBeVisible();
    await expect(page.getByText(/环境 3\/4/)).toBeVisible();
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('PROFILE_CREATED_FROM_TEMPLATE')).toBeVisible();
    await expect(page.getByText('proxy-password')).toHaveCount(0);
    await page.getByRole('tab', { name: '配置' }).click();
    await page.getByRole('button', { name: '归档环境' }).click();
    await expect(page.getByText(/已归档环境：E2E 客服模板 环境 3/)).toBeVisible();
    await expect(page.getByLabel('环境列表').getByText('E2E 客服模板 环境 3')).toHaveCount(0);
    await page.getByLabel('筛选归档').selectOption('archived');
    await expect(page.getByLabel('环境列表').getByText('E2E 客服模板 环境 3')).toBeVisible();
    await page.getByRole('button', { name: '恢复环境' }).click();
    await expect(page.getByText(/已恢复环境：E2E 客服模板 环境 3/)).toBeVisible();
    await expect(page.getByLabel('环境列表').getByText('E2E 客服模板 环境 3')).toHaveCount(0);
    await page.getByLabel('筛选归档').selectOption('active');
    await expect(page.getByLabel('环境列表').getByText('E2E 客服模板 环境 3')).toBeVisible();
    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('PROFILE_ARCHIVED')).toBeVisible();
    await expect(page.getByText('PROFILE_RESTORED')).toBeVisible();
    await page.getByRole('tab', { name: '配置' }).click();

    await page.getByRole('button', { name: '新建环境' }).click();
    await page.getByLabel('环境名称').fill('E2E 自研内核环境');
    await page.getByLabel('环境分组').fill('E2E 项目组');
    await page.getByLabel('内核通道').selectOption('custom-kernel');
    await page.getByRole('button', { name: '保存环境' }).click();
    await expect(page.getByRole('heading', { name: 'E2E 自研内核环境' })).toBeVisible();
    await expect(page.getByText(/环境 4\/4/)).toBeVisible();
    await expect(page.getByText('自研内核：已安装')).toBeVisible();
    await page.getByRole('button', { name: '检查自研内核' }).click();
    await expect(page.getByText(/自研内核 e2e-imported-kernel 已就绪/)).toBeVisible();
    await page.getByRole('button', { name: '启动 Chromium' }).click();
    await expect(page.getByLabel('环境列表').getByText('运行中').first()).toBeVisible();
    await page.getByLabel('筛选状态').selectOption('running');
    await page.getByLabel('选择当前筛选环境').check();
    await expect(page.getByText(/已选 1 个环境/)).toBeVisible();
    await page.getByRole('button', { name: '批量关闭' }).click();
    await expect(page.getByText(/已关闭 1 个环境/)).toBeVisible();
    await page.getByLabel('筛选状态').selectOption('all');
    await expect(page.getByLabel('环境列表').getByText('已关闭').first()).toBeVisible();
    await page.getByLabel('筛选分组').selectOption('E2E 项目组');
    await expect(page.getByText(/当前筛选 4 个/)).toBeVisible();
    await page.getByLabel('选择当前筛选环境').check();
    await page.getByLabel('批量标签').fill('批量,商业化');
    await page.getByRole('button', { name: '修改标签' }).click();
    await expect(page.getByText(/已更新 4 个环境标签/)).toBeVisible();
    await expect(page.getByText('批量 / 商业化').first()).toBeVisible();
    await page.getByLabel('批量代理池').selectOption({ label: 'E2E 洛杉矶代理' });
    await page.getByRole('button', { name: '应用代理' }).click();
    await expect(page.getByText(/已应用代理到 4 个环境/)).toBeVisible();
    await page.getByLabel('筛选分组').selectOption('');

    await page.getByRole('button', { name: '新建环境' }).click();
    await expect(page.getByText('当前套餐环境数已达上限')).toBeVisible();

    await page.getByRole('tab', { name: '审计' }).click();
    await expect(page.getByText('KERNEL_POLICY_APPLIED')).toBeVisible();
    await expect(page.getByText('KERNEL_LAUNCHED')).toBeVisible();

    await page
      .locator('.profile-row-content')
      .filter({ hasText: 'E2E 运营环境', hasNotText: '副本' })
      .click();
    await page.getByRole('tab', { name: '审计' }).click();
    await page.getByRole('button', { name: '导出审计' }).click();
    await expect(page.getByText(/审计已导出/)).toBeVisible();
    await expect(page.getByText('CREDENTIAL_CREATED')).toBeVisible();
    await expect(page.getByText('CREDENTIAL_PASSWORD_REVEALED')).toBeVisible();
    await expect(page.getByText('CREDENTIAL_PASSWORD_COPIED')).toBeVisible();
    await expect(page.getByText('CREDENTIAL_DELETED')).toBeVisible();
    await expect(page.getByText('PROFILE_LAUNCHED').first()).toBeVisible();
    await expect(page.getByText('PROFILE_STOPPED').first()).toBeVisible();
    await expect(page.getByText('proxy-password')).toHaveCount(0);
    await expect(page.getByText(activationCode)).toHaveCount(0);
  } finally {
    await app.close();
    for (const socket of proxySockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
});
