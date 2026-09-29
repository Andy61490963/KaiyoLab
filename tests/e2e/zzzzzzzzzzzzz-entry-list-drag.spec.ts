import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { Entry, EntryKind, EntryOrderSnapshot } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `整列拖曳驗收-${Date.now()}`;
const category = `${prefix}-分類`;
const fixtures = new Map<string, EntryKind>();
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
let trash: Entry;

function collection(kind: EntryKind) {
  return kind === 'article' ? 'articles' : 'projects';
}

function row(page: Page, id: string) {
  return page.locator(`[data-sortable-entry-id="${id}"]`);
}

function handle(page: Page, id: string) {
  return page.locator(`[data-entry-drag-handle="${id}"]`);
}

async function currentEntry(request: APIRequestContext, id: string): Promise<Entry> {
  expect(fixtures.has(id), '只讀取本檔建立的測試內容').toBe(true);
  const response = await request.get(`/api/admin/entries/${id}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function snapshot(request: APIRequestContext, kind: EntryKind): Promise<EntryOrderSnapshot> {
  const response = await request.get(`/api/admin/entries/order?kind=${kind}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function move(request: APIRequestContext, origin: string, kind: EntryKind, id: string) {
  expect(fixtures.get(id), '只調整本檔建立的內容，不改變其他內容的相對順序').toBe(kind);
  const before = await snapshot(request, kind);
  const response = await request.patch('/api/admin/entries/order', {
    headers: { Origin: origin },
    data: { kind, id, position: 1, revision: before.revision },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function action(
  request: APIRequestContext,
  origin: string,
  entry: Entry,
  name: 'publish' | 'trash',
): Promise<Entry> {
  expect(fixtures.has(entry.id), '只改變本檔測試內容的狀態').toBe(true);
  const response = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers: { Origin: origin },
    data: { version: entry.version, action: name },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function openList(page: Page, kind: EntryKind, query: Record<string, string> = {}) {
  await page.goto(
    `/admin/${collection(kind)}?${new URLSearchParams({ pageSize: '10', ...query })}`,
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible();
  await expect(page.locator('[data-entry-order]')).toHaveCount(0);
  if (!Object.keys(query).length) {
    await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('manual');
    await expect(page.locator('[data-entry-drag-handle]').first()).toBeEnabled();
  }
}

function watchWrites(page: Page) {
  const writes: Array<{ id: string; position: number; revision: string }> = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PATCH' &&
      new URL(request.url()).pathname === '/api/admin/entries/order'
    )
      writes.push(request.postDataJSON());
  });
  return writes;
}

async function centerInViewport(target: Locator) {
  await target.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
  );
}

async function beginMouseDrag(page: Page, source: Locator) {
  await centerInViewport(source);
  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y + 12, { steps: 3 });
  await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
}

async function pointAt(page: Page, target: Locator, fraction = 0.75) {
  // 落點位於視窗中央，避免停留在邊緣時正常自動捲動讓列離開指標
  await centerInViewport(target);
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * fraction, {
    steps: 12,
  });
}

async function releaseMouse(page: Page) {
  await page.mouse.up();
  // dnd-kit 和整列連結會短暫防誤觸，避免緊接著的點擊被吃掉
  await page.waitForTimeout(100);
  await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
}

async function dragToRow(
  page: Page,
  source: Locator,
  targetId: string,
  edge: 'before' | 'after' = 'after',
  capture = false,
) {
  const target = row(page, targetId);
  await centerInViewport(target);
  await beginMouseDrag(page, source);
  await pointAt(page, target, edge === 'after' ? 0.75 : 0.25);
  await expect(target).toHaveAttribute('data-entry-drop-edge', edge);
  if (capture) {
    await mkdir('docs/screenshots', { recursive: true });
    // 拖曳期間維持視窗尺寸，避免整頁截圖觸發感應器取消
    await page.screenshot({ path: 'docs/screenshots/admin-sortable-list.png', fullPage: false });
    await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
  }
  await releaseMouse(page);
}

async function expectMoved(
  page: Page,
  kind: EntryKind,
  before: EntryOrderSnapshot,
  id: string,
  position: number,
) {
  expect(fixtures.get(id)).toBe(kind);
  const ids = before.items.map((item) => item.id).filter((item) => item !== id);
  ids.splice(position - 1, 0, id);
  await expect
    .poll(async () => (await snapshot(page.request, kind)).items.map((item) => item.id))
    .toEqual(ids);
  await expect(row(page, id)).toHaveAttribute('data-sortable-position', String(position));
  await expect(handle(page, id)).toBeEnabled();
}

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
    for (const kind of ['article', 'project'] as const) {
      const ids: string[] = [];
      for (let index = 1; index <= (kind === 'article' ? 22 : 12); index++) {
        const created = await context.request.post('/api/admin/entries', {
          headers: { Origin: baseURL! },
          data: { kind, title: `${prefix}-${kind}-${String(index).padStart(2, '0')}` },
        });
        expect(created.ok(), await created.text()).toBe(true);
        let entry = (await created.json()) as Entry;
        fixtures.set(entry.id, kind);
        ids.push(entry.id);
        const saved = await context.request.patch(`/api/admin/entries/${entry.id}`, {
          headers: { Origin: baseURL! },
          data: {
            version: entry.version,
            content: {
              ...entry.content,
              category,
              body: '主列表直接拖曳，不更動內容及發布時間',
              excerpt: '整列拖曳與跨頁排序驗收',
            },
          },
        });
        expect(saved.ok(), await saved.text()).toBe(true);
        entry = await saved.json();
        if (index <= 4) await action(context.request, baseURL!, entry, 'publish');
      }
      // 把專屬測試內容放在前段，讓未篩選列表仍只拖到自己的資料
      for (const id of ids.toReversed()) await move(context.request, baseURL!, kind, id);
    }
    const created = await context.request.post('/api/admin/entries', {
      headers: { Origin: baseURL! },
      data: { kind: 'article', title: `${prefix}-垃圾桶` },
    });
    expect(created.ok(), await created.text()).toBe(true);
    trash = await created.json();
    fixtures.set(trash.id, 'article');
    trash = await action(context.request, baseURL!, trash, 'trash');
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
    // 永久刪除限定本檔記錄的 ID，並核對類型與專屬標題前綴
    for (const [id, kind] of fixtures) {
      const response = await context.request.get(`/api/admin/entries/${id}`);
      if (response.status() === 404) continue;
      expect(response.ok(), await response.text()).toBe(true);
      let entry = (await response.json()) as Entry;
      expect(entry.kind).toBe(kind);
      expect(entry.content.title.startsWith(prefix)).toBe(true);
      if (!entry.deletedAt) entry = await action(context.request, baseURL!, entry, 'trash');
      const deleted = await context.request.delete(`/api/admin/entries/${id}`, {
        headers: { Origin: baseURL! },
        data: { version: entry.version },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('文章與作品主列表可從普通欄位及標題拖曳，短點連結和操作按鈕保持原功能', async ({
  page,
  browser,
  baseURL,
}) => {
  const writes = watchWrites(page);
  const confirmations: string[] = [];
  page.on('dialog', async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  for (const kind of ['article', 'project'] as const) {
    await openList(page, kind);
    const before = await snapshot(page.request, kind);
    const [first, second, third] = before.items;
    const original = await currentEntry(page.request, first.id);
    const capture = kind === 'article' && process.env.E2E_UPDATE_SCREENSHOTS === '1';
    if (capture) {
      await page.getByRole('button', { name: '繁體中文', exact: true }).click();
      await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    }
    await dragToRow(page, row(page, first.id).locator('td').nth(2), third.id, 'after', capture);
    if (capture) await page.getByRole('button', { name: 'English', exact: true }).click();
    await expectMoved(page, kind, before, first.id, 3);
    await page.reload();
    await expect(row(page, first.id)).toHaveAttribute('data-sortable-position', '3');
    await expect(handle(page, first.id)).toBeEnabled();
    const reordered = await snapshot(page.request, kind);
    const guest = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const publicPage = await guest.newPage();
      await publicPage.goto(`/${collection(kind)}?pageSize=8`);
      const titles = publicPage.locator(
        kind === 'article' ? '.article-list h2' : '.project-grid h2',
      );
      await expect(titles).toHaveText(
        reordered.items
          .filter((item) => item.published)
          .slice(0, 8)
          .map((item) => item.title),
      );
    } finally {
      await guest.close();
    }
    await dragToRow(page, row(page, first.id).locator('.admin-entry-title'), second.id, 'before');
    await expectMoved(page, kind, reordered, first.id, 1);
    const after = await currentEntry(page.request, first.id);
    expect({ ...after, sortOrder: original.sortOrder }).toEqual(original);
    const writeCount = writes.length;
    await row(page, first.id).locator('.admin-entry-title').click();
    await expect(page).toHaveURL(new RegExp(`/admin/${collection(kind)}/${first.id}$`));
    await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible();
    expect(writes).toHaveLength(writeCount);
    await openList(page, kind);
    await row(page, first.id).getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${collection(kind)}/${first.id}$`));
    await openList(page, kind);
    const trashButton = row(page, first.id).getByRole('button', {
      name: `Move ${first.title} to trash`,
      exact: true,
    });
    await trashButton.scrollIntoViewIfNeeded();
    const box = (await trashButton.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
    await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
    await page.mouse.up();
    const confirmationsBeforeClick = confirmations.length;
    await trashButton.click();
    expect(confirmations.length).toBe(confirmationsBeforeClick + 1);
    expect(confirmations.at(-1)).toContain(first.title);
    expect(writes).toHaveLength(writeCount);
    expect((await snapshot(page.request, kind)).revision).toBe(before.revision);
    expect(await currentEntry(page.request, first.id)).toEqual(after);
  }
});

test('主列表跨頁落區與頁碼懸停使用全域位置，跨頁取消不寫入並還原焦點', async ({ page }) => {
  await openList(page, 'article');
  let before = await snapshot(page.request, 'article');
  const first = before.items[0];
  await beginMouseDrag(page, row(page, first.id).locator('td').nth(1));
  await pointAt(page, page.locator('[data-entry-drop-page="2"]'));
  await releaseMouse(page);
  await expectMoved(page, 'article', before, first.id, 11);
  before = await snapshot(page.request, 'article');
  await beginMouseDrag(page, row(page, first.id).locator('td').nth(1));
  await pointAt(page, page.locator('[data-entry-drop-page="1"]'));
  await releaseMouse(page);
  await expectMoved(page, 'article', before, first.id, 10);
  before = await snapshot(page.request, 'article');
  const target = before.items[20];
  expect(fixtures.has(target.id), '跨頁目標也是本測試建立的內容').toBe(true);
  await beginMouseDrag(page, row(page, first.id).locator('td').nth(1));
  const thirdPage = page.locator('[data-entry-sort-page="3"]').first();
  // 其他測試可能保留更多內容，精簡分頁器在第一頁不一定列出第三頁
  if (!(await thirdPage.count())) {
    const secondPage = page.locator('[data-entry-sort-page="2"]').first();
    await pointAt(page, secondPage, 0.5);
    await expect(secondPage).toHaveAttribute('aria-current', 'page');
  }
  await pointAt(page, thirdPage, 0.5);
  await expect(thirdPage).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
  await pointAt(page, row(page, target.id));
  await expect(row(page, target.id)).toHaveAttribute('data-entry-drop-edge', 'after');
  await releaseMouse(page);
  await expectMoved(page, 'article', before, first.id, 21);
  const unchanged = await snapshot(page.request, 'article');
  const writes = watchWrites(page);
  await beginMouseDrag(page, row(page, first.id).locator('td').nth(1));
  const firstPage = page.locator('[data-entry-sort-page="1"]').first();
  await pointAt(page, firstPage, 0.5);
  await expect(firstPage).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await releaseMouse(page);
  await expect(page.locator('[data-entry-sort-page="3"]').first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(handle(page, first.id)).toBeFocused();
  expect(writes).toHaveLength(0);
  expect((await snapshot(page.request, 'article')).revision).toBe(unchanged.revision);
});

test('主列表鍵盤可搬移內容，Escape 取消且焦點留在把手', async ({ page }) => {
  await openList(page, 'project');
  const before = await snapshot(page.request, 'project');
  const first = before.items[0];
  const trigger = handle(page, first.id);
  await trigger.focus();
  await trigger.press('Space', { delay: 50 });
  await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-entry-sort-status]')).toHaveText('Drop here: position 2');
  await page.keyboard.press('Space');
  await expectMoved(page, 'project', before, first.id, 2);
  await expect(trigger).toBeFocused();
  const unchanged = await snapshot(page.request, 'project');
  const writes = watchWrites(page);
  await trigger.press('Space', { delay: 50 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(writes).toHaveLength(0);
  expect((await snapshot(page.request, 'project')).revision).toBe(unchanged.revision);
});

test('主列表排序 503 可重試，另一分頁改序造成 409 時必須重新載入', async ({ page }) => {
  await openList(page, 'project');
  let before = await snapshot(page.request, 'project');
  const first = before.items[0];
  let attempts = 0;
  await page.route('**/api/admin/entries/order', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.postDataJSON().id === first.id && ++attempts === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to process the request. Please try again.' }),
      });
    return route.continue();
  });
  await dragToRow(page, row(page, first.id).locator('td').nth(1), before.items[1].id);
  await expect(page.getByRole('alert')).toContainText(
    'Unable to process the request. Please try again.',
  );
  await expect(row(page, first.id)).toBeVisible();
  expect((await snapshot(page.request, 'project')).revision).toBe(before.revision);
  await page.getByRole('button', { name: 'Retry move', exact: true }).click();
  await expectMoved(page, 'project', before, first.id, 2);
  expect(attempts).toBe(2);
  await page.unrouteAll({ behavior: 'wait' });
  before = await snapshot(page.request, 'project');
  const other = await page.context().newPage();
  try {
    await openList(other, 'project');
    await dragToRow(other, row(other, before.items[0].id).locator('td').nth(1), before.items[2].id);
    await expectMoved(other, 'project', before, before.items[0].id, 3);
    const latest = await snapshot(page.request, 'project');
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === '/api/admin/entries/order',
    );
    await dragToRow(page, row(page, first.id).locator('td').nth(1), before.items[3].id);
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole('alert')).toContainText('This order has changed in another tab.');
    await expect(page.getByRole('button', { name: 'Retry move', exact: true })).toHaveCount(0);
    expect((await snapshot(page.request, 'project')).revision).toBe(latest.revision);
    await page.getByRole('button', { name: 'Reload order', exact: true }).click();
    await expect(page.locator('[data-sortable-entry-id]')).toHaveCount(10);
    await expect
      .poll(() =>
        page
          .locator('[data-sortable-entry-id]')
          .evaluateAll((rows) =>
            rows.map((element) => element.getAttribute('data-sortable-entry-id')),
          ),
      )
      .toEqual(latest.items.slice(0, 10).map((item) => item.id));
    await expect(page.locator('[data-entry-drag-handle]').first()).toBeEnabled();
  } finally {
    await other.close();
  }
});

test('搜尋分類狀態與非手動排序禁止拖曳，明確切回後才啟用且垃圾桶不能拖', async ({ page }) => {
  const writes = watchWrites(page);
  const before = await snapshot(page.request, 'article');
  const filters: Array<Record<string, string>> = [
    { q: prefix },
    { category },
    { status: 'draft' },
    { status: 'published' },
    { sort: 'updated-desc' },
    { status: 'trash', q: trash.content.title },
  ];
  for (const filter of filters) {
    await openList(page, 'article', filter);
    const first = page.locator('[data-sortable-entry-id]').first();
    await expect(first).toBeVisible();
    await expect(first.locator('[data-entry-drag-handle]')).toBeDisabled();
    await expect(page.locator('[data-entry-sortable]')).toContainText(
      filter.status === 'trash'
        ? 'Trashed content cannot be reordered. Restore it first.'
        : 'Direct dragging is available in manual order with no filters.',
    );
    const cell = first.locator('td').nth(1);
    await cell.scrollIntoViewIfNeeded();
    const box = (await cell.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 3 });
    await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
    await page.mouse.up();
    expect(writes).toHaveLength(0);
    if (filter.status === 'trash') {
      expect((await currentEntry(page.request, trash.id)).deletedAt).toBe(trash.deletedAt);
      continue;
    }
    await page
      .getByRole('button', { name: 'Use manual order and clear filters', exact: true })
      .click();
    await expect(page.getByLabel('Search articles', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Filter by category', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('manual');
    await expect(page.getByRole('button', { name: 'All content', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-entry-drag-handle]').first()).toBeEnabled();
    expect(writes).toHaveLength(0);
    expect((await snapshot(page.request, 'article')).revision).toBe(before.revision);
  }
});

test('手機快速滑動仍可捲動、長按整列可拖曳，中英文明暗三種寬度保持可操作', async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 1000 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await context.addCookies(cookies);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openList(page, 'project');
    const before = await snapshot(page.request, 'project');
    const first = before.items[0];
    const second = before.items[1];
    const title = row(page, first.id).locator('.admin-entry-title');
    await centerInViewport(title);
    const session = await context.newCDPSession(page);
    try {
      const scrollingWrites = watchWrites(page);
      const initialScroll = await page.evaluate(() => window.scrollY);
      const start = (await title.boundingBox())!;
      const gestureX = start.x + Math.min(50, start.width / 2);
      const gestureY = start.y + start.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: gestureX, y: gestureY }],
      });
      // 不等待長按門檻，立即移動超過容忍距離，應交還瀏覽器一般捲動
      for (const distance of [20, 60, 120])
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: gestureX, y: gestureY - distance }],
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(initialScroll + 20);
      await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
      expect(scrollingWrites).toHaveLength(0);
      expect((await snapshot(page.request, 'project')).revision).toBe(before.revision);
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), initialScroll);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScroll);
      await centerInViewport(title);
      const from = (await title.boundingBox())!;
      const target = (await row(page, second.id).boundingBox())!;
      const x = from.x + Math.min(50, from.width / 2);
      const y = from.y + from.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      // 等待實際長按啟動事件，不用固定延遲猜測感應器是否就緒
      await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
      for (let step = 1; step <= 12; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + ((target.y + target.height * 0.75 - y) * step) / 12 }],
        });
      await expect(row(page, second.id)).toHaveAttribute('data-entry-drop-edge', 'after');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expectMoved(page, 'project', before, first.id, 2);
    } finally {
      await session.detach();
    }
    const unchanged = await snapshot(page.request, 'project');
    const writes = watchWrites(page);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        for (const language of ['zh-TW', 'en']) {
          await page
            .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
            .click();
          await expect(page.locator('html')).toHaveAttribute('lang', language);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          const trigger = handle(page, first.id);
          await trigger.scrollIntoViewIfNeeded();
          const size = (await trigger.boundingBox())!;
          expect(size.width).toBeGreaterThanOrEqual(44);
          expect(size.height).toBeGreaterThanOrEqual(44);
          await trigger.focus();
          await trigger.press('Space', { delay: 50 });
          await expect(page.locator('[data-entry-drag-overlay]')).toBeVisible();
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Escape');
          await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await expect(page.locator('[data-entry-sort-status]')).toContainText(
            language === 'en' ? 'Drag cancelled' : '已取消拖曳',
          );
          expect(writes).toHaveLength(0);
          if (
            (language === 'zh-TW' && theme === 'light') ||
            (language === 'en' && theme === 'dark')
          )
            await testInfo.attach(`主列表拖曳-${width}-${language}-${theme}`, {
              body: await page.screenshot({ fullPage: true }),
              contentType: 'image/png',
            });
        }
      }
    }
    expect((await snapshot(page.request, 'project')).revision).toBe(unchanged.revision);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('列表與排序快照競態時禁止拖曳，重新讀取才恢復且不寫入排序', async ({ page }) => {
  const before = await snapshot(page.request, 'project');
  const writes = watchWrites(page);
  let orderReads = 0;
  await page.route('**/api/admin/entries/order?kind=project', async (route) => {
    if (route.request().method() !== 'GET' || ++orderReads !== 1) return route.continue();
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    const actual = (await response.json()) as EntryOrderSnapshot;
    const items = [...actual.items];
    expect(fixtures.has(items[0].id) && fixtures.has(items[1].id)).toBe(true);
    [items[0], items[1]] = [items[1], items[0]];
    const revision = createHash('sha256')
      .update(JSON.stringify(['project', items.map((item) => item.id)]))
      .digest('hex');
    expect(revision).not.toBe(actual.revision);
    // 只改第一次讀取結果，模擬列表之後才發生的排序，不碰資料庫內容
    await route.fulfill({ response, json: { ...actual, items, revision } });
  });
  await page.goto('/admin/projects?pageSize=10');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The list changed while its order was loading. Reload the order before dragging.',
  );
  await expect(page.locator('[data-entry-sortable]')).toHaveAttribute(
    'data-entry-sort-enabled',
    'false',
  );
  const first = before.items[0];
  await expect(row(page, first.id)).toHaveAttribute('data-sortable-position', '1');
  await expect(handle(page, first.id)).toBeDisabled();
  const cell = row(page, first.id).locator('td').nth(1);
  await centerInViewport(cell);
  const box = (await cell.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 3 });
  await expect(page.locator('[data-entry-drag-overlay]')).toHaveCount(0);
  await page.mouse.up();
  expect(writes).toHaveLength(0);
  expect(orderReads).toBe(1);
  await page.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(handle(page, first.id)).toBeEnabled();
  await expect(page.locator('[data-entry-sortable]')).toHaveAttribute(
    'data-entry-sort-enabled',
    'true',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('[data-sortable-entry-id]')
        .evaluateAll((rows) =>
          rows.map((element) => element.getAttribute('data-sortable-entry-id')),
        ),
    )
    .toEqual(before.items.slice(0, 10).map((item) => item.id));
  expect(orderReads).toBeGreaterThanOrEqual(2);
  expect(writes).toHaveLength(0);
  expect((await snapshot(page.request, 'project')).revision).toBe(before.revision);
  await page.unrouteAll({ behavior: 'wait' });
});
