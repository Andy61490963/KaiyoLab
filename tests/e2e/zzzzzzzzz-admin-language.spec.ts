import { expect, test, type BrowserContext } from '@playwright/test';
import { signInForFixture } from './helpers/auth';
import type { Entry } from '../../src/lib/types';

// 明確使用全新偏好，避免既有英文流程的測試設定蓋過產品預設值
test.use({ storageState: { cookies: [], origins: [] } });
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test('登入預設繁中，切換保留輸入與錯誤、記住偏好且不影響前台', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kaiyo-ui-language', 'en'));
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { name: '登入管理後台' })).toBeVisible();
  await page.getByLabel('電子郵件', { exact: true }).fill('language@example.test');
  await page.getByLabel('密碼', { exact: true }).fill('keep-this-input');
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD' }),
    }),
  );
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('電子郵件或密碼不正確');
  const english = page.getByRole('button', { name: 'English', exact: true });
  await english.focus();
  await english.press('Enter');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('language@example.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('keep-this-input');
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.');
  await expect(page).toHaveTitle('Sign in · KaiyoLab');
  expect(await page.evaluate(() => localStorage.getItem('kaiyo-ui-language'))).toBe('en');
  await page.reload();
  await expect(english).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('後台各頁中英標籤完整，作者內容原文保留', async ({ page, context }) => {
  await context.addCookies(cookies);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [path, zh, en] of [
    ['/admin', '總覽', 'Overview'],
    ['/admin/articles', '文章', 'Articles'],
    ['/admin/projects', '作品', 'Projects'],
    ['/admin/media', '媒體庫', 'Media library'],
    ['/admin/taxonomies', '分類與標籤', 'Categories & tags'],
    ['/admin/about', '關於我', 'About me'],
    ['/admin/settings', '網站設定', 'Site settings'],
    ['/admin/transfer', '內容匯出與匯入', 'Content transfer'],
    ['/admin/system', '系統狀態', 'System status'],
  ]) {
    await page.goto(path);
    await page.getByRole('button', { name: '繁體中文', exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(zh);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
  expect(errors).toEqual([]);
});

test('多分頁同步語言但保留未儲存設定，清除偏好回繁中', async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto('/admin/settings');
  const original = await page.getByLabel('網站名稱', { exact: true }).inputValue();
  await page.getByLabel('網站名稱', { exact: true }).fill('Overview 這是使用者的網站名稱');
  const other = await context.newPage();
  await other.goto('/admin');
  await other.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue(
    'Overview 這是使用者的網站名稱',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await other.evaluate(() => localStorage.removeItem('kaiyo-admin-language'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByLabel('網站名稱', { exact: true })).toHaveValue(
    'Overview 這是使用者的網站名稱',
  );
  const stored = await (await page.request.get('/api/admin/settings')).json();
  expect(stored.siteName).toBe(original);
  await page.getByLabel('網站名稱', { exact: true }).fill(original);
  await other.close();
});

test('編輯中切換不新增草稿、不清除正文，儲存失敗訊息可切換', async ({ page, context, baseURL }) => {
  await context.addCookies(cookies);
  const response = await page.request.post('/api/admin/entries', {
    headers: { Origin: baseURL! },
    data: { kind: 'article', title: 'Overview 不是介面文字' },
  });
  expect(response.ok()).toBe(true);
  const entry = (await response.json()) as Entry;
  let creations = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/entries')
      creations++;
  });
  try {
    await page.goto(`/admin/articles/${entry.id}`);
    await expect(page.getByLabel('文章標題')).toHaveValue('Overview 不是介面文字');
    await page.route(`**/api/admin/entries/${entry.id}`, (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    );
    await page.getByLabel('文章標題').fill('未儲存的 Overview');
    const editor = page.locator('.cm-content[contenteditable=true]');
    await editor.fill('# Original Title\n\n保留 **中文** 與 English，不能翻譯正文');
    await expect(page.getByRole('alert').filter({ hasText: '無法連線到伺服器' })).toBeVisible();
    await editor.press('Control+f');
    await page.locator('.cm-search input[name="search"]').fill('English');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByLabel('Article title')).toHaveValue('未儲存的 Overview');
    await expect(editor).toContainText('保留 **中文** 與 English，不能翻譯正文');
    await expect(page.locator('.cm-search input[name="search"]')).toHaveAttribute(
      'aria-label',
      'Find',
    );
    await expect(page.locator('.cm-search input[name="search"]')).toHaveValue('English');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to reach the server' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '繁體中文', exact: true }).click();
    await expect(page.getByLabel('文章標題')).toHaveValue('未儲存的 Overview');
    await expect(page.locator('.cm-search input[name="search"]')).toHaveAttribute(
      'aria-label',
      '尋找',
    );
    await expect(page.locator('.cm-search input[name="search"]')).toHaveValue('English');
    expect(creations).toBe(0);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    }
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await page.close();
    const current = await (await context.request.get(`/api/admin/entries/${entry.id}`)).json();
    const cleaned = await context.request.post(`/api/admin/entries/${entry.id}/action`, {
      headers: { Origin: baseURL! },
      data: { action: 'trash', version: current.version },
    });
    expect(cleaned.ok()).toBe(true);
  }
});

test('三種尺寸與明暗主題都可鍵盤切換，儲存停用時仍可使用', async ({ page, context }, testInfo) => {
  await context.addCookies(cookies);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/admin');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const lang of ['en', 'zh-TW']) {
        const button = page.getByRole('button', {
          name: lang === 'en' ? 'English' : '繁體中文',
          exact: true,
        });
        await button.focus();
        await button.press('Space');
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      }
      await testInfo.attach(`後台-${width}-${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
});
