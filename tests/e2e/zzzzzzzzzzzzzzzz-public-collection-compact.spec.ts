import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `精簡列表驗收-${Date.now()}`;
const owned = new Set<string>();
const fixtures: Entry[] = [];
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
const collections = [
  {
    path: '/articles',
    size: 8,
    selector: '.article-list h2',
    search: 'Search articles',
    kind: 'article',
  },
  {
    path: '/projects',
    size: 12,
    selector: '.project-grid h2',
    search: 'Search projects',
    kind: 'project',
  },
  { path: '/lab', size: 12, selector: '.lab-grid h2', search: 'Search LAB', kind: 'project' },
] as const;

function requireLocal(origin: string) {
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
}

async function isolatedDatabase(baseURL: string) {
  requireLocal(baseURL);
  for (const name of ['SITE_URL', 'PLAYWRIGHT_BASE_URL'])
    if (process.env[name]) requireLocal(process.env[name]!);
  if (process.env.DATABASE_URL) {
    requireLocal(process.env.DATABASE_URL);
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    return {
      query: async (sql: string) => (await pool.query(sql)).rows[0]?.result,
      close: () => pool.end(),
    };
  }
  // Compose 的資料庫不公開主機連接埠，只允許已知的獨立 CI 專案
  expect(process.env.CI).toBe('true');
  expect(process.env.COMPOSE_PROJECT_NAME).toBe('kaiyolab-ci');
  return {
    query: async (sql: string) => {
      const output = execFileSync(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'db',
          'psql',
          '-X',
          '-q',
          '-t',
          '-A',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'kaiyo',
          '-d',
          'kaiyolab',
        ],
        { input: sql, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 20000 },
      );
      return JSON.parse(output.trim());
    },
    close: async () => {},
  };
}

async function mutate(request: APIRequestContext, origin: string, entry: Entry, action: string) {
  const response = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers: { Origin: origin },
    data: { action, version: entry.version },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<Entry>;
}

test.beforeAll(async ({ browser, baseURL }) => {
  requireLocal(baseURL!);
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
    for (const [kind, count] of [
      ['article', 9],
      ['project', 13],
    ] as const) {
      for (let index = 1; index <= count; index++) {
        const created = await context.request.post('/api/admin/entries', {
          headers: { Origin: baseURL! },
          data: { kind, title: `${prefix}-${kind}-${String(index).padStart(2, '0')}` },
        });
        expect(created.ok(), await created.text()).toBe(true);
        let entry = (await created.json()) as Entry;
        owned.add(entry.id);
        const saved = await context.request.patch(`/api/admin/entries/${entry.id}`, {
          headers: { Origin: baseURL! },
          data: {
            version: entry.version,
            content: {
              ...entry.content,
              category: kind === 'project' ? 'LAB' : prefix,
              tags: ['compact-filter'],
              excerpt: '搜尋、排序與換頁的公開驗收內容',
              body: '## 資料邊界\n\n只有已發布的內容出現在列表',
            },
          },
        });
        expect(saved.ok(), await saved.text()).toBe(true);
        entry = await saved.json();
        fixtures.push(await mutate(context.request, baseURL!, entry, 'publish'));
      }
    }
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser, baseURL }) => {
  if (!cookies) return;
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  try {
    for (const id of owned) {
      const response = await context.request.get(`/api/admin/entries/${id}`);
      if (response.status() === 404) continue;
      expect(response.ok(), await response.text()).toBe(true);
      let entry = (await response.json()) as Entry;
      expect(entry.content.title.startsWith(prefix)).toBe(true);
      if (!entry.deletedAt) entry = await mutate(context.request, baseURL!, entry, 'trash');
      const removed = await context.request.delete(`/api/admin/entries/${id}`, {
        headers: { Origin: baseURL! },
        data: { version: entry.version },
      });
      expect(removed.ok(), await removed.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('真正空站隱藏查詢工具與空統計，但有搜尋條件仍可清除', async ({ page, baseURL }) => {
  const database = await isolatedDatabase(baseURL!);
  const original = (await database.query(
    "SELECT COALESCE(json_agg(snapshot), '[]') AS result FROM (SELECT id, published FROM entries WHERE published IS NOT NULL) snapshot;",
  )) as { id: string; published: Entry['published'] }[];
  try {
    // 僅暫時隱藏測試環境的公開快照，不變更內容、版本、日期與排序
    await database.query(
      'WITH hidden AS (UPDATE entries SET published = NULL WHERE published IS NOT NULL RETURNING id) SELECT count(*)::int AS result FROM hidden;',
    );
    for (const collection of collections) {
      await page.goto(collection.path);
      await expect(page.locator('.collection-controls')).toHaveCount(0);
      await expect(page.locator('.collection-page-summary, .pagination')).toHaveCount(0);
      await expect(page.getByRole('searchbox', { name: collection.search })).toHaveCount(0);
      await page.goto(`${collection.path}?q=missing`);
      await expect(page.getByRole('searchbox', { name: collection.search })).toHaveValue('missing');
      await expect(
        page.getByRole('link', {
          name: collection.kind === 'article' ? 'Remove search: missing' : 'Clear filters',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('.collection-page-summary, .pagination')).toHaveCount(0);
      await page
        .getByRole('link', {
          name: collection.kind === 'article' ? 'Remove search: missing' : 'Clear filters',
          exact: true,
        })
        .click();
      await expect(page.locator('.collection-controls')).toHaveCount(0);
      expect(new URL(page.url()).search).toBe('');
    }
    await page.goto('/');
    await expect(page.locator('[aria-labelledby="featured-projects-title"]')).toHaveCount(0);
    await page.goto('/lab');
    await expect(page.locator('.lab-index-row')).toHaveCount(5);
    await expect(page.locator('main h1')).toHaveCount(1);
  } finally {
    try {
      // Base64 僅含固定字元，避免測試文章中的引號進入 SQL 語法
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');
      const restored = await database.query(`WITH restored AS (
        UPDATE entries AS current SET published = saved.published
        FROM jsonb_to_recordset(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)
          AS saved(id text, published jsonb)
        WHERE current.id = saved.id AND current.published IS NULL RETURNING current.id
      ) SELECT count(*)::int AS result FROM restored;`);
      expect(restored, '所有公開快照必須完整還原').toBe(original.length);
    } finally {
      await database.close();
    }
  }
});

test('公開列表固定筆數、單頁只有一次統計且零結果保留搜尋', async ({ page }) => {
  for (const collection of collections) {
    await page.goto(
      `${collection.path}?q=${encodeURIComponent(prefix)}&sort=title-asc&pageSize=24`,
    );
    await expect(page.locator(collection.selector)).toHaveCount(collection.size);
    await expect(page.locator('select[name="pageSize"]')).toHaveCount(0);
    await expect(page.locator('.collection-page-summary')).toHaveCount(1);
    const next = page.getByRole('link', { name: 'Next page', exact: true });
    expect(
      new URL((await next.getAttribute('href'))!, page.url()).searchParams.has('pageSize'),
    ).toBe(false);
    await next.click();
    await expect(page.locator(collection.selector)).toHaveCount(1);
    const entry = fixtures.find((entry) => entry.kind === collection.kind)!;
    const search = page.getByRole('searchbox', { name: collection.search });
    await search.fill(entry.content.title);
    await search.press('Enter');
    await expect(page.locator(collection.selector)).toHaveText(entry.content.title);
    await expect(page.locator('.collection-page-summary, .pagination')).toHaveCount(0);
    await expect(page.locator('.collection-results > span')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    expect(new URL(page.url()).searchParams.has('pageSize')).toBe(false);
    await search.fill(`${prefix}-不存在`);
    await search.press('Enter');
    await expect(page.locator(collection.selector)).toHaveCount(0);
    await expect(search).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: collection.kind === 'article' ? `Remove search: ${prefix}-不存在` : 'Clear filters',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('.collection-page-summary, .pagination')).toHaveCount(0);
  }
});

test('排序原地更新並保留焦點、捲動、語言與上一頁歷史', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  const first = fixtures.find((entry) => entry.kind === 'article')!;
  const last = fixtures.filter((entry) => entry.kind === 'article').at(-1)!;
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=title-asc`);
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { collectionDocument: string }).collectionDocument = 'same-document';
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest()) requests.push(request.url());
  });
  const sort = page.locator('#collection-sort');
  await sort.focus();
  const scroll = await page.evaluate(() => window.scrollY);
  await sort.selectOption('title-desc');
  await expect(page.locator('.article-list h2').first()).toHaveText(last.content.title);
  await expect(sort).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.locator('#collection-sort option[value="manual"]')).toHaveText('預設順序');
  await expect(page.locator('.collection-page-summary')).toContainText('共 9 筆');
  await page.goBack();
  await expect(page.locator('.article-list h2').first()).toHaveText(first.content.title);
  await expect(sort).toHaveValue('title-asc');
  expect(
    await page.evaluate(
      () => (window as unknown as { collectionDocument: string }).collectionDocument,
    ),
  ).toBe('same-document');
  expect(requests).toEqual([]);
});

test('等待搜尋時的鍵盤焦點與捲動保留，前後歷史還原各自最後閱讀位置', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=title-asc`);
  const firstQuery = prefix;
  const secondQuery = `"${prefix}"`;
  const search = page.getByRole('searchbox', { name: 'Search articles', exact: true });
  const sort = page.locator('#collection-sort');
  const root = page.locator('[data-public-collection]');
  const releases: Array<() => void> = [];
  let captured = 0;
  let pending: Promise<void> | undefined;
  const holdNextResponse = () => {
    let release: () => void = () => {};
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    releases.push(release);
    return release;
  };
  await page.route('**/articles?**', async (route) => {
    if (pending && route.request().resourceType() === 'fetch') {
      const gate = pending;
      pending = undefined;
      captured++;
      await gate;
    }
    await route.continue();
  });
  try {
    const releaseSearch = holdNextResponse();
    await search.fill(secondQuery);
    await search.press('Enter');
    await expect.poll(() => captured).toBe(1);
    // 實際 Tab 到排序，驗證等待期間新增的焦點，不只保留送出時的搜尋欄
    await page.keyboard.press('Tab');
    await expect(sort).toBeFocused();
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);
    releaseSearch();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(secondQuery);
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect(sort).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);

    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(firstQuery);
    await expect(search).toHaveValue(firstQuery);
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(secondQuery);
    await expect(search).toHaveValue(secondQuery);
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);

    const releaseSort = holdNextResponse();
    await sort.selectOption('title-desc');
    await expect.poll(() => captured).toBe(2);
    const outside = page.getByRole('button', { name: 'English', exact: true });
    await outside.focus();
    await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(650);
    releaseSort();
    await expect(page.locator('.article-list h2').first()).toHaveText(
      fixtures.filter((entry) => entry.kind === 'article').at(-1)!.content.title,
    );
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect(outside).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(650);
  } finally {
    releases.forEach((release) => release());
  }
});

async function historyWithReadingPositions(page: Page) {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=newest`);
  const sort = page.locator('#collection-sort');
  const root = page.locator('[data-public-collection]');
  const scrollTo = async (position: number) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), position);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
  };
  await scrollTo(300);
  await sort.selectOption('oldest');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('oldest');
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await scrollTo(700);
  await sort.selectOption('title-desc');
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('title-desc');
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await scrollTo(900);
  return { sort, root, scrollTo };
}

test('快速連續返回不把仍在顯示的列表位置寫入尚未載入的歷史', async ({ page }) => {
  const { sort, root } = await historyWithReadingPositions(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false;
  await page.route('**/articles?**', async (route) => {
    if (!captured && route.request().resourceType() === 'fetch') {
      captured = true;
      await gate;
      try {
        await route.continue();
      } catch {
        /* 第二次返回會中止第一次請求 */
      }
    } else await route.continue();
  });
  try {
    await page.goBack();
    await expect.poll(() => captured).toBe(true);
    expect(new URL(page.url()).searchParams.get('sort')).toBe('oldest');
    await expect(sort).toHaveValue('title-desc');
    expect(await page.evaluate(() => window.scrollY)).toBe(900);
    await page.goBack();
    await expect(sort).toHaveValue('newest');
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
    release();
    await page.goForward();
    await expect(sort).toHaveValue('oldest');
    await expect(root).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(700);
  } finally {
    release();
  }
});

test('返回請求取消或失敗時，繼續閱讀舊畫面不污染目的歷史位置', async ({ page }) => {
  for (const mode of ['cancel', 'failure'] as const) {
    const { sort, root, scrollTo } = await historyWithReadingPositions(page);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured = false;
    await page.route('**/articles?**', async (route) => {
      if (!captured && route.request().resourceType() === 'fetch') {
        captured = true;
        await gate;
        try {
          if (mode === 'failure') await route.abort('failed');
          else await route.continue();
        } catch {
          /* 輸入新文字會中止已攔截的返回請求 */
        }
      } else await route.continue();
    });
    try {
      await page.goBack();
      await expect.poll(() => captured).toBe(true);
      await expect(sort).toHaveValue('title-desc');
      if (mode === 'cancel') {
        await page
          .getByRole('searchbox', { name: 'Search articles', exact: true })
          .fill(`${prefix} 待搜尋`);
        release();
      } else {
        release();
        await expect(page.getByRole('alert')).toContainText('Unable to update results');
      }
      await expect(root).toHaveAttribute('aria-busy', 'false');
      await scrollTo(500);
      await page.goBack();
      await expect(sort).toHaveValue('newest');
      await expect(root).toHaveAttribute('aria-busy', 'false');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
      await page.goForward();
      await expect(sort).toHaveValue('oldest');
      await expect(root).toHaveAttribute('aria-busy', 'false');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(700);
    } finally {
      release();
      await page.unroute('**/articles?**');
    }
  }
});

test('排序等待期間展開說明或標籤，回應後保留 summary 焦點與展開狀態', async ({ page }) => {
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=title-asc`);
  const releases: Array<() => void> = [];
  try {
    for (const [selector, ordering] of [
      ['.collection-search-help', 'title-desc'],
      ['details.tag-cloud', 'title-asc'],
    ]) {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      releases.push(release);
      let captured = false;
      await page.route('**/articles?**', async (route) => {
        if (!captured && route.request().resourceType() === 'fetch') {
          captured = true;
          await gate;
        }
        await route.continue();
      });
      await page.locator('#collection-sort').selectOption(ordering);
      await expect.poll(() => captured).toBe(true);
      const details = page.locator(selector);
      const summary = details.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open');
      release();
      await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe(ordering);
      await expect(page.locator('[data-public-collection]')).toHaveAttribute('aria-busy', 'false');
      await expect(summary).toBeFocused();
      await expect(details).toHaveAttribute('open');
      await page.unroute('**/articles?**');
    }
  } finally {
    releases.forEach((release) => release());
  }
});

test('排序請求失敗保留原結果並可重試', async ({ page }) => {
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=title-asc`);
  const original = await page.locator('.article-list h2').allTextContents();
  const originalUrl = page.url();
  let fail = true;
  await page.route('**/articles?**', async (route) => {
    if (route.request().resourceType() === 'fetch' && fail) {
      fail = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#collection-sort').selectOption('title-desc');
  await expect(page.locator('.collection-feedback')).toContainText('Unable to update results');
  expect(await page.locator('.article-list h2').allTextContents()).toEqual(original);
  expect(page.url()).toBe(originalUrl);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.article-list h2').first()).toHaveText(
    fixtures.filter((entry) => entry.kind === 'article').at(-1)!.content.title,
  );
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeHidden();
});

test('等待排序期間繼續輸入，舊請求不能蓋掉新文字', async ({ page }) => {
  await page.goto(`/articles?q=${encodeURIComponent(prefix)}&sort=title-asc`);
  const original = await page.locator('.article-list h2').allTextContents();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false;
  await page.route('**/articles?**', async (route) => {
    if (!captured && route.request().resourceType() === 'fetch') {
      captured = true;
      await gate;
      try {
        await route.continue();
      } catch {
        /* 繼續輸入時瀏覽器會中止舊請求 */
      }
    } else await route.continue();
  });
  try {
    await page.locator('#collection-sort').selectOption('title-desc');
    await expect.poll(() => captured).toBe(true);
    const first = fixtures.find((entry) => entry.kind === 'article')!;
    const search = page.getByRole('searchbox', { name: 'Search articles', exact: true });
    await search.fill(first.content.title);
    release();
    await expect(page.locator('[data-public-collection]')).toHaveAttribute('aria-busy', 'false');
    expect(await page.locator('.article-list h2').allTextContents()).toEqual(original);
    await expect(search).toHaveValue(first.content.title);
    await search.press('Enter');
    // 陣列斷言會同時等待筆數與文字收斂，避免回應到達前的八筆舊結果觸發 strict mode
    await expect(page.locator('.article-list h2')).toHaveText([first.content.title]);
    expect(new URL(page.url()).searchParams.get('q')).toBe(first.content.title);
  } finally {
    release();
  }
});

test('搜尋說明與標籤在桌機手機均可用鍵盤收合，選取條件可分別移除', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(
        `/articles?q=${encodeURIComponent(prefix)}&category=${encodeURIComponent(prefix)}&tag=compact-filter`,
      );
      for (const language of ['English', '繁體中文']) {
        await page.getByRole('button', { name: language, exact: true }).click();
        const help = page
          .locator('details')
          .filter({ has: page.locator('summary', { hasText: /Search help|搜尋說明/ }) });
        await expect(help).not.toHaveAttribute('open');
        await help.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(help).toHaveAttribute('open');
        await page.keyboard.press('Enter');
        await expect(help).not.toHaveAttribute('open');
        const tags = page.locator('details.tag-cloud');
        await expect(tags).not.toHaveAttribute('open');
        await tags.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(
          tags.getByRole('link', { name: '#compact-filter', exact: true }),
        ).toBeVisible();
        await tags.locator('summary').click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      }
      await testInfo.attach(`精簡工具列-${width}-${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
  const remove = page.locator('[data-filter-chip="tag"]');
  await remove.click();
  await expect.poll(() => new URL(page.url()).searchParams.has('tag')).toBe(false);
  expect(new URL(page.url()).searchParams.get('category')).toBe(prefix);
  expect(new URL(page.url()).searchParams.get('q')).toBe(prefix);
  expect(errors).toEqual([]);
});
