import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import sharp from 'sharp';
import type { Entry, EntryKind, Media } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `永久刪除驗收-${Date.now()}`;
const fixtures = new Map<string, EntryKind>();
const images: Media[] = [];
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

async function currentEntry(request: APIRequestContext, id: string): Promise<Entry> {
  const response = await request.get(`/api/admin/entries/${id}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function changeState(
  request: APIRequestContext,
  origin: string,
  entry: Entry,
  action: 'publish' | 'trash' | 'restore',
): Promise<Entry> {
  expect(fixtures.has(entry.id), '只操作本檔建立的驗收內容').toBe(true);
  const response = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers: { Origin: origin },
    data: { version: entry.version, action },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function createEntry(
  request: APIRequestContext,
  origin: string,
  kind: EntryKind,
  suffix: string,
  options: { category?: string; published?: boolean; trash?: boolean; cover?: string } = {},
): Promise<Entry> {
  const headers = { Origin: origin };
  const created = await request.post('/api/admin/entries', {
    headers,
    data: { kind, title: `${prefix}-${suffix}` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  let entry = (await created.json()) as Entry;
  fixtures.set(entry.id, kind);
  const saved = await request.patch(`/api/admin/entries/${entry.id}`, {
    headers,
    data: {
      version: entry.version,
      content: {
        ...entry.content,
        body: '永久刪除驗收正文',
        category: options.category || '',
        cover: options.cover || '',
        coverAlt: options.cover ? '永久刪除驗收圖片' : '',
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  entry = await saved.json();
  if (options.published) entry = await changeState(request, origin, entry, 'publish');
  if (options.trash !== false) entry = await changeState(request, origin, entry, 'trash');
  return entry;
}

function row(page: Page, entry: Entry) {
  const collection = entry.kind === 'article' ? 'articles' : 'projects';
  return page.locator(`.admin-table tbody tr:has(a[href="/admin/${collection}/${entry.id}"])`);
}

function deleteButton(page: Page, entry: Entry, language: 'en' | 'zh-TW' = 'en') {
  return row(page, entry).getByRole('button', {
    name:
      language === 'en'
        ? `Delete ${entry.content.title} permanently`
        : `永久刪除「${entry.content.title}」`,
    exact: true,
  });
}

async function openTrash(
  page: Page,
  kind: EntryKind,
  query: string,
  options: { category?: string; page?: number; sort?: string } = {},
) {
  const params = new URLSearchParams({
    status: 'trash',
    q: query,
    pageSize: '10',
    sort: options.sort || 'title-asc',
    page: String(options.page || 1),
  });
  if (options.category) params.set('category', options.category);
  await page.goto(`/admin/${kind === 'article' ? 'articles' : 'projects'}?${params}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trash', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

async function confirmDelete(
  page: Page,
  button: Locator,
  entry: Entry,
  accept: boolean,
  language: 'en' | 'zh-TW' = 'en',
  keyboard = false,
) {
  const opened = page.waitForEvent('dialog');
  const activated = keyboard ? button.press('Enter') : button.click();
  const dialog = await opened;
  const type = dialog.type();
  const message = dialog.message();
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await activated;
  expect(type).toBe('confirm');
  expect(message).toContain(entry.content.title);
  expect(message).toContain(language === 'en' ? 'This cannot be undone.' : '這個操作無法還原');
  expect(message).toContain(
    language === 'en' ? 'Images will stay in the media library.' : '圖片會保留在媒體庫',
  );
}

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test.afterAll(async ({ browser, baseURL }) => {
  if (!cookies) return;
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  try {
    // 永久刪除只允許本測試記錄的 ID，並再次核對專屬標題前綴
    for (const [id, kind] of fixtures) {
      const response = await context.request.get(`/api/admin/entries/${id}`);
      if (response.status() === 404) continue;
      expect(response.ok(), await response.text()).toBe(true);
      let entry = (await response.json()) as Entry;
      expect(entry.kind).toBe(kind);
      expect(entry.content.title.startsWith(prefix)).toBe(true);
      if (!entry.deletedAt) entry = await changeState(context.request, baseURL!, entry, 'trash');
      const deleted = await context.request.delete(`/api/admin/entries/${id}`, {
        headers: { Origin: baseURL! },
        data: { version: entry.version },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
    for (const image of images) {
      expect(image.name.startsWith(prefix)).toBe(true);
      const deleted = await context.request.delete(`/api/admin/media/${image.id}`, {
        headers: { Origin: baseURL! },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('文章與作品取消永久刪除不送出請求，確認後重新載入仍不存在且圖片保留', async ({
  page,
  baseURL,
}) => {
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#9d2357' } })
    .png()
    .toBuffer();
  const upload = await page.request.post('/api/admin/media', {
    headers: { Origin: baseURL! },
    multipart: {
      file: { name: `${prefix}-保留圖片.png`, mimeType: 'image/png', buffer: png },
      alt: '永久刪除後保留的驗收圖片',
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const image = (await upload.json()) as Media;
  images.push(image);
  for (const kind of ['article', 'project'] as const) {
    const entry = await createEntry(page.request, baseURL!, kind, `確認-${kind}`, {
      published: true,
      cover: image.url,
    });
    const history = await page.request.get(`/api/admin/history/${entry.id}`);
    expect(history.ok()).toBe(true);
    expect((await history.json()).items.length).toBeGreaterThanOrEqual(2);
    await openTrash(page, kind, entry.content.title);
    const button = deleteButton(page, entry);
    await expect(button).toBeVisible();
    let deletes = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'DELETE' &&
        new URL(request.url()).pathname === `/api/admin/entries/${entry.id}`
      )
        deletes++;
    });
    await button.focus();
    await confirmDelete(page, button, entry, false, 'en', true);
    expect(await currentEntry(page.request, entry.id)).toEqual(entry);
    expect(deletes).toBe(0);
    await expect(button).toBeFocused();
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname === `/api/admin/entries/${entry.id}`,
    );
    await confirmDelete(page, button, entry, true, 'en', true);
    const response = await deleted;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, id: entry.id });
    await expect(
      page.getByRole('status').filter({ hasText: 'Content permanently deleted.' }),
    ).toBeVisible();
    await expect(row(page, entry)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh list', exact: true })).toBeFocused();
    expect(deletes).toBe(1);
    await page.reload();
    await expect(row(page, entry)).toHaveCount(0);
    expect((await page.request.get(`/api/admin/entries/${entry.id}`)).status()).toBe(404);
    expect((await page.request.get(`/api/admin/history/${entry.id}`)).status()).toBe(404);
    expect((await page.request.get(image.url)).status()).toBe(200);
  }
  const media = await page.request.get(`/api/admin/media?q=${encodeURIComponent(image.name)}`);
  expect(media.ok()).toBe(true);
  const kept = (await media.json()).items.find((item: Media) => item.id === image.id);
  expect(kept).toMatchObject({ id: image.id, usedBy: [] });
});

test('刪除最後一頁唯一內容回到有效頁碼並保留搜尋、分類與排序', async ({ page, baseURL }) => {
  const group = `${prefix}-跨頁`;
  const category = `${prefix}-分類`;
  const entries: Entry[] = [];
  for (let index = 1; index <= 11; index++)
    entries.push(
      await createEntry(
        page.request,
        baseURL!,
        'article',
        `跨頁-${String(index).padStart(2, '0')}`,
        { category },
      ),
    );
  const untouched = await createEntry(page.request, baseURL!, 'article', '搜尋以外保留', {
    category,
  });
  await openTrash(page, 'article', group, { category, page: 2, sort: 'title-asc' });
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
  const last = entries.at(-1)!;
  await expect(row(page, last)).toBeVisible();
  await confirmDelete(page, deleteButton(page, last), last, true);
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.admin-list-pagination')).toContainText('10 items');
  await expect(page.getByRole('button', { name: 'Refresh list', exact: true })).toBeFocused();
  await expect(page.getByLabel('Search articles', { exact: true })).toHaveValue(group);
  await expect(page.getByLabel('Filter by category', { exact: true })).toHaveValue(category);
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('title-asc');
  await expect(page.getByLabel('Per page', { exact: true })).toHaveValue('10');
  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;
      return {
        q: params.get('q'),
        category: params.get('category'),
        sort: params.get('sort'),
        page: params.get('page'),
        status: params.get('status'),
      };
    })
    .toEqual({ q: group, category, sort: 'title-asc', page: null, status: 'trash' });
  expect(await currentEntry(page.request, untouched.id)).toEqual(untouched);
  const remaining = await page.request.get(
    `/api/admin/entries?kind=article&status=trash&q=${encodeURIComponent(group)}&sort=title-asc&pageSize=10`,
  );
  expect((await remaining.json()).items.map((entry: Entry) => entry.id)).toEqual(
    entries.slice(0, 10).map((entry) => entry.id),
  );
  await page.reload();
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(10);
  await expect(row(page, last)).toHaveCount(0);
});

test('永久刪除遇到 503 保留原列、顯示錯誤且可重新確認重試', async ({ page, baseURL }) => {
  const entry = await createEntry(page.request, baseURL!, 'project', '失敗重試');
  await openTrash(page, 'project', entry.content.title);
  let attempts = 0;
  await page.route(`**/api/admin/entries/${entry.id}`, (route) => {
    if (route.request().method() === 'DELETE' && ++attempts === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to process the request. Please try again.' }),
      });
    return route.continue();
  });
  const button = deleteButton(page, entry);
  await button.focus();
  await confirmDelete(page, button, entry, true, 'en', true);
  await expect(page.getByRole('alert')).toContainText(
    'Unable to process the request. Please try again.',
  );
  await expect(button).toBeEnabled();
  await expect(button).toBeFocused();
  expect(await currentEntry(page.request, entry.id)).toEqual(entry);
  expect(attempts).toBe(1);
  await confirmDelete(page, button, entry, true);
  await expect(row(page, entry)).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Content permanently deleted.' }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect((await page.request.get(`/api/admin/entries/${entry.id}`)).status()).toBe(404);
  await page.unrouteAll({ behavior: 'wait' });
});

test('訪客、跨站、非垃圾桶與舊版本不能刪除，另一分頁還原後確認也不會誤刪', async ({
  page,
  request,
  baseURL,
}) => {
  let entry = await createEntry(page.request, baseURL!, 'article', '權限與衝突', { trash: false });
  const endpoint = `/api/admin/entries/${entry.id}`;
  const data = { version: entry.version };
  expect((await request.delete(endpoint, { headers: { Origin: baseURL! }, data })).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.delete(endpoint, {
        headers: { Origin: 'https://untrusted.example' },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.delete(endpoint, { headers: { Origin: baseURL! }, data })).status(),
  ).toBe(409);
  expect(await currentEntry(page.request, entry.id)).toEqual(entry);
  entry = await changeState(page.request, baseURL!, entry, 'trash');
  expect(
    (await page.request.delete(endpoint, { headers: { Origin: baseURL! }, data })).status(),
  ).toBe(409);
  expect(await currentEntry(page.request, entry.id)).toEqual(entry);
  await openTrash(page, 'article', entry.content.title);
  await expect(deleteButton(page, entry)).toBeVisible();
  const other = await page.context().newPage();
  try {
    await openTrash(other, 'article', entry.content.title);
    await row(other, entry).getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(row(other, entry)).toHaveCount(0);
    const restored = await currentEntry(page.request, entry.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.published).toBeNull();
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' && new URL(response.url()).pathname === endpoint,
    );
    await confirmDelete(page, deleteButton(page, entry), entry, true);
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await currentEntry(page.request, entry.id)).toEqual(restored);
    await page.getByRole('button', { name: 'Refresh list', exact: true }).click();
    await expect(row(page, entry)).toHaveCount(0);
    expect(await currentEntry(page.request, entry.id)).toEqual(restored);
  } finally {
    await other.close();
  }
});

test('永久刪除在中英文、明暗主題與手機平板桌面保持鍵盤可操作', async ({
  page,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const kind of ['article', 'project'] as const) {
    const entry = await createEntry(page.request, baseURL!, kind, `介面-${kind}`);
    await openTrash(page, kind, entry.content.title);
    await expect(row(page, entry)).toBeVisible();
    let deletes = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'DELETE' &&
        new URL(request.url()).pathname === `/api/admin/entries/${entry.id}`
      )
        deletes++;
    });
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        for (const language of ['zh-TW', 'en'] as const) {
          await page
            .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
            .click();
          await expect(page.locator('html')).toHaveAttribute('lang', language);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          const badge = await row(page, entry).locator('.admin-badge').boundingBox();
          expect(badge!.height, '狀態標籤維持單行，不被動作按鈕擠成直排').toBeLessThan(40);
          const restore = row(page, entry).getByRole('button', {
            name: language === 'en' ? 'Restore' : '還原',
            exact: true,
          });
          const button = deleteButton(page, entry, language);
          await restore.focus();
          await restore.press('Tab');
          await expect(button).toBeFocused();
          await expect(button).toBeVisible();
          await confirmDelete(page, button, entry, false, language, true);
          await expect(button).toBeFocused();
          expect(deletes).toBe(0);
          if (
            (language === 'zh-TW' && theme === 'light') ||
            (language === 'en' && theme === 'dark')
          )
            await testInfo.attach(`永久刪除-${kind}-${width}-${language}-${theme}`, {
              body: await page.screenshot({ fullPage: true }),
              contentType: 'image/png',
            });
        }
      }
    }
    expect(await currentEntry(page.request, entry.id)).toEqual(entry);
  }
  expect(errors).toEqual([]);
});
