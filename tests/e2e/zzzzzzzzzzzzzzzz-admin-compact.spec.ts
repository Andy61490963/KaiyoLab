import { expect, test, type BrowserContext } from '@playwright/test';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `後台精簡驗收-${Date.now()}`;
const entries: Entry[] = [];
let state: Awaited<ReturnType<BrowserContext['storageState']>>;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    state = await context.storageState();
    for (const kind of ['article', 'project']) {
      for (let index = 0; index < 11; index++) {
        const response = await context.request.post('/api/admin/entries', {
          headers: { Origin: baseURL! },
          data: { kind, title: `${prefix}-${kind}-${String(index).padStart(2, '0')}` },
        });
        expect(response.ok(), await response.text()).toBe(true);
        entries.push(await response.json());
      }
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
  try {
    for (const entry of entries) {
      const trashed = await context.request.post(`/api/admin/entries/${entry.id}/action`, {
        headers: { Origin: baseURL! },
        data: { action: 'trash', version: entry.version },
      });
      expect(trashed.ok(), await trashed.text()).toBe(true);
      const current = (await trashed.json()) as Entry;
      const deleted = await context.request.delete(`/api/admin/entries/${entry.id}`, {
        headers: { Origin: baseURL! },
        data: { version: current.version },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('文章作品搜尋排序同列，筆數隨分頁調整且保留搜尋與焦點', async ({ page }) => {
  for (const kind of ['articles', 'projects']) {
    await page.goto(`/admin/${kind}?q=${encodeURIComponent(prefix)}&sort=title-asc&pageSize=10`);
    const toolbar = page.locator('.admin-filter-row');
    const pager = page.locator('.admin-list-pagination');
    const search = toolbar.getByRole('searchbox');
    const sort = toolbar.getByLabel('Sort by', { exact: true });
    const size = pager.getByLabel('Per page', { exact: true });
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(10);
    await expect(sort).toHaveValue('title-asc');
    await expect(toolbar.getByLabel('Per page', { exact: true })).toHaveCount(0);
    const searchBox = await search.boundingBox();
    const sortBox = await sort.boundingBox();
    expect(Math.abs(searchBox!.y - sortBox!.y)).toBeLessThan(10);
    await expect(page.locator('.admin-page-title .admin-eyebrow')).toHaveCount(0);
    await expect(page.locator('.admin-page-title p')).toHaveCount(0);
    const next = pager.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toHaveText('');
    await next.click();
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
    // selectOption 不會自動取得焦點，改以原生鍵盤操作驗證更新前後的焦點
    await size.focus();
    await expect(size).toBeFocused();
    await size.press('ArrowDown');
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(11);
    await expect(size).toBeFocused();
    await expect(size).toHaveValue('20');
    await expect(search).toHaveValue(prefix);
    await expect(sort).toHaveValue('title-asc');
    await expect(pager.getByRole('status')).toHaveText('11 items');
    await expect(pager.getByRole('navigation')).toHaveCount(0);
    await search.fill(`${prefix}-找不到`);
    await expect(page.getByRole('heading', { name: 'No matching content' })).toBeVisible();
    await expect(pager.getByRole('status', { includeHidden: true })).toHaveText('');
    await expect(size).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  }
});

test('排序說明按需展開，手機中英分頁與媒體分類筆數入口仍可操作', async ({ page }) => {
  await page.goto('/admin/articles?pageSize=10');
  const help = page.locator('.admin-entry-sort-help details');
  await expect(help).not.toHaveAttribute('open', '');
  const summary = help.locator('summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(help).toHaveAttribute('open', '');
  await expect(help.getByText(/For keyboard sorting/)).toBeVisible();
  await summary.press('Enter');
  await expect(help).not.toHaveAttribute('open', '');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(summary).toHaveText('排序說明');
  const pager = page.locator('.admin-list-pagination');
  await expect(pager.getByRole('button', { name: '下一頁', exact: true })).toBeVisible();
  await expect(pager.getByLabel('每頁筆數').locator('option:checked')).toHaveText('10 筆／頁');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(pager.getByRole('button', { name: 'Next', exact: true })).toBeVisible();

  await page.goto('/admin/media');
  const mediaSize = page.locator('.admin-list-pagination').getByLabel('Per page', { exact: true });
  await mediaSize.selectOption('12');
  await expect(mediaSize).toHaveValue('12');
  await expect(page).toHaveURL(/pageSize=12/);
  await page.goto('/admin/taxonomies');
  const taxonomySizes = page
    .locator('.admin-list-pagination')
    .getByLabel('Per page', { exact: true });
  await expect(taxonomySizes).toHaveCount(2);
  for (const size of await taxonomySizes.all()) {
    await size.selectOption('20');
    await expect(size).toHaveValue('20');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
