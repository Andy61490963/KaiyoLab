import { test, expect, type BrowserContext } from '@playwright/test';
import sharp from 'sharp';
import type { Entry, Media } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

let state: Awaited<ReturnType<BrowserContext['storageState']>>;
const entries: Entry[] = [];
const images: Media[] = [];
const prefix = 'Pagination fixture';
// Runs after the publishing suite initializes the disposable E2E database.
test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ baseURL });
  const headers = { Origin: baseURL! };
  try {
    await signInForFixture(context.request, baseURL!);
    state = await context.storageState();
    for (const [kind, count] of [
      ['article', 11],
      ['project', 9],
    ] as const) {
      for (let i = 1; i <= count; i++) {
        const created = await context.request.post('/api/admin/entries', {
          headers,
          data: { kind, title: `${prefix} ${String(i).padStart(2, '0')}` },
        });
        expect(created.ok(), await created.text()).toBe(true);
        let entry = (await created.json()) as Entry;
        entries.push(entry);
        const saved = await context.request.patch(`/api/admin/entries/${entry.id}`, {
          headers,
          data: {
            version: entry.version,
            content: {
              ...entry.content,
              body: 'A pagination test fixture.',
              category: prefix,
              tags: ['paging'],
            },
          },
        });
        expect(saved.ok(), await saved.text()).toBe(true);
        entry = (await saved.json()) as Entry;
        const published = await context.request.post(`/api/admin/entries/${entry.id}/action`, {
          headers,
          data: { version: entry.version, action: 'publish' },
        });
        expect(published.ok(), await published.text()).toBe(true);
      }
    }
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
      .png()
      .toBuffer();
    for (let i = 1; i <= 13; i++) {
      const uploaded = await context.request.post('/api/admin/media', {
        headers,
        multipart: {
          file: {
            name: `pagination-image-${String(i).padStart(2, '0')}.png`,
            mimeType: 'image/png',
            buffer: png,
          },
          alt: 'Paging fixture',
        },
      });
      expect(uploaded.ok(), await uploaded.text()).toBe(true);
      images.push((await uploaded.json()) as Media);
    }
  } finally {
    await context.close();
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(state.cookies);
});
test.afterAll(async ({ browser, baseURL }) => {
  if (!state) return;
  const context = await browser.newContext({ baseURL, storageState: state });
  const headers = { Origin: baseURL! };
  try {
    for (const image of images)
      await context.request.delete(`/api/admin/media/${image.id}`, { headers });
    for (const entry of entries) {
      const response = await context.request.get(`/api/admin/entries/${entry.id}`);
      if (!response.ok()) continue;
      const current = (await response.json()) as Entry;
      if (!current.deletedAt)
        await context.request.post(`/api/admin/entries/${entry.id}/action`, {
          headers,
          data: { action: 'trash', version: current.version },
        });
    }
  } finally {
    await context.close();
  }
});

test('public lists sort globally, preserve filters across pages and work without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(
      `/articles?q=${encodeURIComponent(prefix)}&category=${encodeURIComponent(prefix)}&tag=paging&sort=title-asc&pageSize=8`,
    );
    await expect(page.locator('.article-list h2').first()).toContainText(`${prefix} 01`);
    await expect(page.locator('.article-list h2')).toHaveCount(8);
    await page.getByRole('link', { name: 'Next page', exact: true }).click();
    await expect(page.locator('.article-list h2').first()).toContainText(`${prefix} 09`);
    expect(new URL(page.url()).searchParams.get('tag')).toBe('paging');
    await page.locator('#collection-sort').selectOption('title-desc');
    await page.locator('.collection-controls button').click();
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    await expect(page.locator('.article-list h2').first()).toContainText(`${prefix} 11`);
    await page.goto(`/projects?q=${encodeURIComponent(prefix)}&sort=title-asc&pageSize=8`);
    await expect(page.locator('.project-grid h2')).toHaveCount(8);
    await page.getByRole('link', { name: 'Next page', exact: true }).click();
    await expect(page.locator('.project-grid h2')).toHaveCount(1);
    await expect(page.locator('.project-grid h2').first()).toContainText(`${prefix} 09`);
  } finally {
    await context.close();
  }
});

test('controls fit mobile widths and translate options without altering titles', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ['/articles', '/projects']) {
      await page.goto(`${path}?q=${encodeURIComponent(prefix)}&pageSize=8`);
      const titles = await page.locator('.article-list h2, .project-grid h2').allTextContents();
      await page.getByRole('button', { name: '繁體中文', exact: true }).click();
      await expect(page.locator('#collection-sort option[value="oldest"]')).toHaveText('最舊優先');
      expect(await page.locator('.article-list h2, .project-grid h2').allTextContents()).toEqual(
        titles,
      );
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${path} ${theme} ${width}`,
        ).toBe(true);
      }
      await testInfo.attach(`${path.slice(1)}-${theme}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  }
  expect(errors).toEqual([]);
});

test('admin entries retain ordering on reload, reset after search and clamp after deletion', async ({
  page,
}) => {
  await page.goto(
    `/admin/articles?q=${encodeURIComponent(prefix)}&pageSize=10&sort=title-asc&page=2`,
  );
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.admin-entry-title strong').first()).toContainText(`${prefix} 11`);
  await page.reload();
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('title-asc');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Move ${prefix} 11 to trash`, exact: true }).click();
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(10);
  await expect.poll(() => new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.getByRole('searchbox', { name: 'Search articles', exact: true }).fill(`${prefix} 04`);
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.admin-entry-title strong').first()).toContainText(`${prefix} 04`);
  await page.getByLabel('Sort by', { exact: true }).selectOption('title-desc');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('title-desc');
});

test('media pagination and picker controls are isolated from the editing URL', async ({ page }) => {
  await page.goto('/admin/media?q=pagination-image&pageSize=12&sort=name-asc&page=2');
  await expect(page.locator('.admin-media-card')).toHaveCount(1);
  await expect(page.locator('.admin-media-card strong')).toHaveText('pagination-image-13.png');
  await page.getByLabel('Sort by', { exact: true }).selectOption('name-desc');
  await expect(page.locator('.admin-media-card')).toHaveCount(12);
  await expect(page.locator('.admin-media-card strong').first()).toHaveText(
    'pagination-image-13.png',
  );
  await page.goto('/admin/about');
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose image', exact: true });
  const original = page.url();
  await picker
    .getByRole('searchbox', { name: 'Search media', exact: true })
    .fill('pagination-image');
  await picker.getByLabel('Per page', { exact: true }).selectOption('12');
  await picker.getByLabel('Sort by', { exact: true }).selectOption('name-asc');
  await expect(picker.locator('.admin-media-card')).toHaveCount(12);
  await picker.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(picker.locator('.admin-media-card')).toHaveCount(1);
  expect(page.url()).toBe(original);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
});

test('new collection endpoints still require authentication', async ({ browser, baseURL }) => {
  const guest = await browser.newContext({ baseURL });
  try {
    for (const path of ['/api/admin/entries?page=2', '/api/admin/media?sort=name-asc'])
      expect((await guest.request.get(path)).status()).toBe(401);
  } finally {
    await guest.close();
  }
});

test('圖片選擇器立即提交搜尋與排序，延遲回應和舊計時器不會吞掉下一頁', async ({ page }) => {
  await page.goto('/admin/about');
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose image', exact: true });
  await picker.getByLabel('Per page', { exact: true }).selectOption('12');
  await expect(picker.locator('.admin-media-card')).toHaveCount(12);
  const next = picker.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeEnabled();
  const originalUrl = page.url();
  // 停住 debounce，確保排序與換頁真的處理最新輸入，而非靠測試等待 250ms
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 60000);
  let releaseOld: () => void = () => {};
  let releaseCurrent: () => void = () => {};
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const requests: { q: string | null; sort: string | null }[] = [];
  await page.route('**/api/admin/media?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const sort = params.get('sort');
    if (params.get('page') !== '1' || !['name-asc', 'name-desc'].includes(sort || ''))
      return route.continue();
    requests.push({ q: params.get('q'), sort });
    const response = await route.fetch();
    await (sort === 'name-desc' ? oldGate : currentGate);
    await route.fulfill({ response });
  });
  try {
    await picker
      .getByRole('searchbox', { name: 'Search media', exact: true })
      .fill('pagination-image');
    await expect(next).toBeDisabled();
    await picker.getByLabel('Sort by', { exact: true }).selectOption('name-desc');
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({ q: 'pagination-image', sort: 'name-desc' });
    await picker.getByLabel('Sort by', { exact: true }).selectOption('name-asc');
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toEqual({ q: 'pagination-image', sort: 'name-asc' });
    await expect(next).toBeDisabled();
    releaseCurrent();
    await expect(picker.locator('.admin-media-card strong').first()).toHaveText(
      'pagination-image-01.png',
    );
    await next.click();
    await expect(picker.locator('.admin-media-card')).toHaveCount(1);
    await expect(picker.locator('.admin-media-card strong')).toHaveText('pagination-image-13.png');
    releaseOld();
    await page.clock.runFor(1000);
    await expect(picker.locator('.admin-media-card')).toHaveCount(1);
    await expect(picker.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(page.url()).toBe(originalUrl);
  } finally {
    releaseOld();
    releaseCurrent();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('圖片搜尋失敗後可重試，不以舊資料的頁碼繼續操作', async ({ page }) => {
  await page.goto('/admin/about');
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose image', exact: true });
  await expect(picker.locator('.admin-media-card').first()).toBeVisible();
  let failed = false;
  await page.route('**/api/admin/media?*', async (route) => {
    if (!failed && new URL(route.request().url()).searchParams.get('q') === 'pagination-image') {
      failed = true;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary media search outage' }),
      });
    }
    await route.continue();
  });
  await picker
    .getByRole('searchbox', { name: 'Search media', exact: true })
    .fill('pagination-image');
  await expect(picker.getByRole('alert')).toContainText('Temporary media search outage');
  await expect(picker.locator('.admin-media-card')).toHaveCount(0);
  await expect(
    picker.getByRole('navigation', { name: 'Media pagination', exact: true }),
  ).toHaveCount(0);
  const refresh = picker.getByRole('button', { name: 'Refresh media', exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(picker.locator('.admin-media-card')).toHaveCount(13);
  await expect(picker.getByRole('alert')).toHaveCount(0);
});
