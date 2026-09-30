import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import type { Entry, EntryKind, EntryOrderSnapshot } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `排序驗收-${Date.now()}`;
const fixtures: Entry[] = [];
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

async function snapshot(request: APIRequestContext, kind: EntryKind): Promise<EntryOrderSnapshot> {
  const response = await request.get(`/api/admin/entries/order?kind=${kind}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function move(
  request: APIRequestContext,
  origin: string,
  kind: EntryKind,
  id: string,
  position: number,
) {
  const current = await snapshot(request, kind);
  const response = await request.patch('/api/admin/entries/order', {
    headers: { Origin: origin },
    data: { kind, id, position, revision: current.revision },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<EntryOrderSnapshot>;
}

async function openOrder(page: Page, kind: EntryKind) {
  await page.goto(`/admin/${kind === 'article' ? 'articles' : 'projects'}?pageSize=10`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust order', exact: true }).click();
  await expect(page.locator('[data-entry-order]')).toBeVisible();
  await expect(page.locator('[data-order-id]')).toHaveCount(10);
  await expect(page.locator('[data-entry-order] h2')).toBeFocused();
}

async function drag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  expect(from).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2 + 10, {
    steps: 3,
  });
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  expect(to).not.toBeNull();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height * 0.75, { steps: 12 });
  await page.mouse.up();
  // dnd-kit 會在放下後攔截 50ms 的點擊，避免拖曳被誤判成按鈕點選
  await page.waitForTimeout(60);
}

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ baseURL });
  const headers = { Origin: baseURL! };
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
    for (const kind of ['article', 'project'] as const) {
      for (let i = 1; i <= 22; i++) {
        const created = await context.request.post('/api/admin/entries', {
          headers,
          data: { kind, title: `${prefix}-${kind}-${String(i).padStart(2, '0')}` },
        });
        expect(created.ok()).toBe(true);
        let entry = (await created.json()) as Entry;
        fixtures.push(entry);
        if (i <= 14) {
          const saved = await context.request.patch(`/api/admin/entries/${entry.id}`, {
            headers,
            data: {
              version: entry.version,
              content: { ...entry.content, body: '排序不改寫文章內容', excerpt: '跨頁排序測試' },
            },
          });
          expect(saved.ok()).toBe(true);
          entry = await saved.json();
          const published = await context.request.post(`/api/admin/entries/${entry.id}/action`, {
            headers,
            data: { version: entry.version, action: 'publish' },
          });
          expect(published.ok()).toBe(true);
        }
      }
      // 把本測試內容排在前面，不改變其他既有內容的相對順序
      for (const entry of fixtures.filter((entry) => entry.kind === kind).toReversed())
        await move(context.request, baseURL!, kind, entry.id, 1);
    }
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test.afterAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies(cookies || []);
    for (const entry of fixtures) {
      const response = await context.request.get(`/api/admin/entries/${entry.id}`);
      if (!response.ok()) continue;
      const current = (await response.json()) as Entry;
      if (!current.deletedAt)
        await context.request.post(`/api/admin/entries/${entry.id}/action`, {
          headers: { Origin: baseURL! },
          data: { version: current.version, action: 'trash' },
        });
    }
  } finally {
    await context.close();
  }
});

test('文章與作品可真實拖拉、重載保留順序，公開列表與草稿隔離正確', async ({
  page,
  browser,
  baseURL,
}) => {
  for (const kind of ['article', 'project'] as const) {
    const before = await snapshot(page.request, kind);
    const first = before.items[0];
    const third = before.items[2];
    const original = (await (
      await page.request.get(`/api/admin/entries/${first.id}`)
    ).json()) as Entry;
    await openOrder(page, kind);
    await drag(
      page,
      page.locator(`[data-order-id="${first.id}"] [data-order-handle]`),
      page.locator(`[data-order-id="${third.id}"]`),
    );
    await expect.poll(async () => (await snapshot(page.request, kind)).items[2].id).toBe(first.id);
    const updated = (await (
      await page.request.get(`/api/admin/entries/${first.id}`)
    ).json()) as Entry;
    expect({ ...updated, sortOrder: original.sortOrder }).toEqual(original);
    await openOrder(page, kind);
    await expect(page.locator('[data-order-id]').nth(2)).toHaveAttribute('data-order-id', first.id);
    const order = await snapshot(page.request, kind);
    const publicContext = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const publicPage = await publicContext.newPage();
      const path = kind === 'article' ? 'articles' : 'projects';
      const selector = kind === 'article' ? '.article-list h2' : '.project-grid h2';
      const pageSize = kind === 'article' ? 8 : 12;
      await publicPage.goto(`/${path}`);
      await expect(publicPage.locator('#collection-sort')).toHaveValue('manual');
      await expect(publicPage.locator(selector)).toHaveText(
        order.items
          .filter((item) => item.published)
          .slice(0, pageSize)
          .map((item) => item.title),
      );
      await publicPage.goto(`/${path}?page=2`);
      await expect(publicPage.locator(selector)).toHaveText(
        order.items
          .filter((item) => item.published)
          .slice(pageSize, pageSize * 2)
          .map((item) => item.title),
      );
      for (const item of order.items.filter((item) => !item.published))
        await expect(publicPage.locator('main')).not.toContainText(item.title);
    } finally {
      await publicContext.close();
    }
  }
});

test('跨頁拖拉寫入全域位置，鍵盤可移到遠頁，取消拖拉不寫入', async ({ page }) => {
  await openOrder(page, 'article');
  const first = (await snapshot(page.request, 'article')).items[0];
  await drag(
    page,
    page.locator(`[data-order-id="${first.id}"] [data-order-handle]`),
    page.locator('[data-order-drop-page="2"]'),
  );
  await expect
    .poll(async () => (await snapshot(page.request, 'article')).items[10].id)
    .toBe(first.id);
  await expect(page.locator(`[data-order-id="${first.id}"]`)).toHaveAttribute(
    'data-order-position',
    '11',
  );
  await drag(
    page,
    page.locator(`[data-order-id="${first.id}"] [data-order-handle]`),
    page.locator('[data-order-drop-page="1"]'),
  );
  await expect
    .poll(async () => (await snapshot(page.request, 'article')).items[9].id)
    .toBe(first.id);
  const unchanged = await snapshot(page.request, 'article');
  const sourceHandle = page.locator(`[data-order-id="${first.id}"] [data-order-handle]`);
  await sourceHandle.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHandle.boundingBox();
  await page.mouse.move(sourceBox!.x + 20, sourceBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + 30, sourceBox!.y + 35, { steps: 3 });
  const pageTwo = page.locator('[data-order-page="2"]').first();
  await pageTwo.scrollIntoViewIfNeeded();
  const pageTwoBox = await pageTwo.boundingBox();
  await page.mouse.move(
    pageTwoBox!.x + pageTwoBox!.width / 2,
    pageTwoBox!.y + pageTwoBox!.height / 2,
    { steps: 10 },
  );
  await expect(pageTwo).toHaveAttribute('aria-current', 'page');
  const nextFirst = page.locator('[data-order-id]').first();
  await nextFirst.scrollIntoViewIfNeeded();
  const nextBox = await nextFirst.boundingBox();
  await page.mouse.move(nextBox!.x + nextBox!.width / 2, nextBox!.y + nextBox!.height * 0.25, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(60);
  expect((await snapshot(page.request, 'article')).revision).toBe(unchanged.revision);
  await expect(sourceHandle).toBeFocused();
  await expect(page.locator('[data-order-page="1"]').first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  const row = page.locator(`[data-order-id="${first.id}"]`);
  await row.getByRole('button', { name: /Move to/ }).click();
  await page.getByLabel(/Position for/).fill('22');
  const submit = page.getByRole('button', { name: 'Move', exact: true });
  await submit.focus();
  await submit.press('Enter');
  await expect
    .poll(async () => (await snapshot(page.request, 'article')).items[21].id)
    .toBe(first.id);
  await expect(page.locator(`[data-order-id="${first.id}"]`)).toHaveAttribute(
    'data-order-position',
    '22',
  );
  const beforeCancel = await snapshot(page.request, 'article');
  const handle = page.locator(`[data-order-id="${first.id}"] [data-order-handle]`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 35, box!.y + 35, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  // 取消拖曳也會套用同一個 50ms 防誤觸期間
  await page.waitForTimeout(60);
  expect((await snapshot(page.request, 'article')).revision).toBe(beforeCancel.revision);
  await page.getByRole('button', { name: 'Back to list', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adjust order', exact: true })).toBeFocused();
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('manual');
});

test('儲存失敗保留可重試操作，另一分頁改序時不靜默覆蓋', async ({ page, baseURL }) => {
  await openOrder(page, 'project');
  const before = await snapshot(page.request, 'project');
  const first = before.items[0];
  const second = before.items[1];
  let failed = false;
  await page.route('**/api/admin/entries/order', (route) => {
    if (!failed && route.request().method() === 'PATCH') {
      failed = true;
      return route.abort('failed');
    }
    return route.continue();
  });
  await drag(
    page,
    page.locator(`[data-order-id="${first.id}"] [data-order-handle]`),
    page.locator(`[data-order-id="${second.id}"]`),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await snapshot(page.request, 'project')).revision).toBe(before.revision);
  await page.getByRole('button', { name: /Retry/ }).click();
  await expect
    .poll(async () => (await snapshot(page.request, 'project')).items[1].id)
    .toBe(first.id);
  await page.unrouteAll({ behavior: 'wait' });
  const changed = await move(page.request, baseURL!, 'project', first.id, 4);
  await page
    .locator(`[data-order-id="${second.id}"]`)
    .getByRole('button', { name: /Move down/ })
    .click();
  await expect(page.getByRole('alert')).toContainText(/changed|Reload/i);
  expect((await snapshot(page.request, 'project')).revision).toBe(changed.revision);
  await page.getByRole('button', { name: /Reload order/ }).click();
  await expect(page.locator('[data-order-id]').nth(3)).toHaveAttribute('data-order-id', first.id);
});

test('排序 API 拒絕訪客、跨站寫入及不合法位置', async ({ request, page, baseURL }) => {
  expect((await request.get('/api/admin/entries/order?kind=article')).status()).toBe(401);
  const current = await snapshot(page.request, 'article');
  const data = {
    kind: 'article',
    id: current.items[0].id,
    position: 2,
    revision: current.revision,
  };
  expect(
    (
      await page.request.patch('/api/admin/entries/order', {
        headers: { Origin: 'https://untrusted.example' },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch('/api/admin/entries/order', {
        headers: { Origin: baseURL! },
        data: { ...data, position: 0 },
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.get('/api/admin/entries/order?kind=invalid')).status()).toBe(400);
  expect((await snapshot(page.request, 'article')).revision).toBe(current.revision);
});

test('排序面板中英文及明暗主題在三種尺寸保持可操作', async ({ page }, testInfo) => {
  await openOrder(page, 'article');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
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
        const handle = page.locator('[data-order-handle]').first();
        const size = await handle.boundingBox();
        expect(size!.width).toBeGreaterThanOrEqual(44);
        expect(size!.height).toBeGreaterThanOrEqual(44);
        await testInfo.attach(`排序-${width}-${language}-${theme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
  expect(errors).toEqual([]);
});

test('手機觸控把手可拖拉，頁碼懸停可帶著內容切換到遠頁', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 1000 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await context.addCookies(cookies);
    const page = await context.newPage();
    await openOrder(page, 'project');
    const before = await snapshot(page.request, 'project');
    const first = before.items[0];
    const second = before.items[1];
    const from = await page
      .locator(`[data-order-id="${first.id}"] [data-order-handle]`)
      .boundingBox();
    const to = await page.locator(`[data-order-id="${second.id}"]`).boundingBox();
    const session = await context.newCDPSession(page);
    const x = from!.x + from!.width / 2;
    const y = from!.y + from!.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 12; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((to!.y + to!.height * 0.75 - y) * step) / 12 }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => (await snapshot(page.request, 'project')).items[1].id)
      .toBe(first.id);
    await session.detach();
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openOrder(page, 'project');
    const current = await snapshot(page.request, 'project');
    const item = current.items[0];
    const source = page.locator(`[data-order-id="${item.id}"] [data-order-handle]`);
    await source.scrollIntoViewIfNeeded();
    const box = await source.boundingBox();
    await page.mouse.move(box!.x + 20, box!.y + 20);
    await page.mouse.down();
    await page.mouse.move(box!.x + 30, box!.y + 35, { steps: 3 });
    const thirdPage = page.locator('[data-order-page="3"]').first();
    await thirdPage.scrollIntoViewIfNeeded();
    const pageBox = await thirdPage.boundingBox();
    await page.mouse.move(pageBox!.x + pageBox!.width / 2, pageBox!.y + pageBox!.height / 2, {
      steps: 10,
    });
    await expect(thirdPage).toHaveAttribute('aria-current', 'page');
    const destination = page.locator('[data-order-id]').first();
    await destination.scrollIntoViewIfNeeded();
    const target = await destination.boundingBox();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height * 0.75, {
      steps: 10,
    });
    await page.mouse.up();
    await expect
      .poll(async () => (await snapshot(page.request, 'project')).items[20].id)
      .toBe(item.id);
  } finally {
    await context.close();
  }
});
