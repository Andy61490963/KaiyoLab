import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import type { Entry, EntryKind, EntryOrderSnapshot } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `LAB驗收-${Date.now()}`;
const owned = new Set<string>();
const published: Entry[] = [];
let draft: Entry;
let article: Entry;
let ordinary: Entry;
let trashed: Entry;
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

async function mutate(request: APIRequestContext, origin: string, entry: Entry, action: string) {
  expect(owned.has(entry.id)).toBe(true);
  const response = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers: { Origin: origin },
    data: { version: entry.version, action },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<Entry>;
}

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
    async function create(label: string, kind: EntryKind, category: string, publish: boolean) {
      const created = await context.request.post('/api/admin/entries', {
        headers: { Origin: baseURL! },
        data: { kind, title: `${prefix}-${label}` },
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
            category,
            excerpt: '實驗與小工具驗收',
            body: '## 操作方式\n\nLAB 僅顯示已發布的作品',
            demoUrl: 'https://example.com/tool',
            repoUrl: 'https://github.com/example/tool',
          },
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      entry = await saved.json();
      return publish ? mutate(context.request, baseURL!, entry, 'publish') : entry;
    }
    for (let i = 1; i <= 13; i++)
      published.push(await create(`實驗${String(i).padStart(2, '0')}`, 'project', 'LAB', true));
    draft = await create('私人草稿', 'project', '', false);
    ordinary = await create('一般作品', 'project', '', true);
    article = await create('LAB文章', 'article', 'LAB', true);
    trashed = await create('垃圾桶', 'project', 'LAB', true);
    trashed = await mutate(context.request, baseURL!, trashed, 'trash');
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

test('LAB 保留公開快照隔離、搜尋、分頁與手動順序', async ({ page, baseURL }) => {
  // 使用未登入的公開頁驗證，不以後台權限繞過草稿隔離
  await page.goto(`/lab?q=${encodeURIComponent(prefix)}`);
  await expect(page.locator('main h1')).toHaveText('LAB', { useInnerText: true });
  await expect(page.locator('.project-card')).toHaveCount(12);
  await expect(page.locator('.collection-page-summary')).toContainText('of 13');
  for (const hidden of [draft, ordinary, article, trashed])
    await expect(page.locator('main')).not.toContainText(hidden.content.title);
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('q')).toBe(prefix);
  await page
    .getByRole('searchbox', { name: 'Search LAB', exact: true })
    .fill(published[0].content.title);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-title')).toHaveText(published[0].content.title);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.getByRole('searchbox', { name: 'Search LAB', exact: true }).fill(`${prefix}-不存在`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matching experiments', { exact: true })).toBeVisible();

  await page.context().addCookies(cookies);
  const snapshot = (await (
    await page.request.get('/api/admin/entries/order?kind=project')
  ).json()) as EntryOrderSnapshot;
  const moved = published.at(-1)!;
  const reordered = await page.request.patch('/api/admin/entries/order', {
    headers: { Origin: baseURL! },
    data: { kind: 'project', id: moved.id, position: 1, revision: snapshot.revision },
  });
  expect(reordered.ok(), await reordered.text()).toBe(true);
  const changed = await page.request.patch(`/api/admin/entries/${moved.id}`, {
    headers: { Origin: baseURL! },
    data: {
      version: moved.version,
      content: { ...moved.content, category: '', title: `${prefix}-尚未發布的修改` },
    },
  });
  expect(changed.ok(), await changed.text()).toBe(true);
  await page.context().clearCookies();
  await page.goto(`/lab?q=${encodeURIComponent(prefix)}&category=其他`);
  await expect(page.locator('.project-title').first()).toHaveText(moved.content.title);
  await expect(page.locator('main')).not.toContainText(`${prefix}-尚未發布的修改`);
  expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe(`${baseURL}/lab`);
  expect(await (await page.request.get('/sitemap.xml')).text()).toContain(`${baseURL}/lab</loc>`);
});

test('LAB 導覽與空白品牌圖示在中英文明暗及手機上正常', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(`/lab?q=${encodeURIComponent(prefix)}`);
      for (const language of ['zh-TW', 'en']) {
        await page
          .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
          .click();
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        if (width <= 800) {
          const menu = page.locator('#mobile-menu');
          await menu.locator('summary').click();
          await expect(
            page.locator('#mobile-nav').getByRole('link', { name: 'LAB', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
          await page.keyboard.press('Escape');
          await expect(menu).not.toHaveAttribute('open');
        } else {
          await expect(
            page.locator('.public-nav').getByRole('link', { name: 'LAB', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
        }
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
        await expect(page.locator('img[src="/favicon.svg"]')).toHaveCount(0);
        expect(await page.locator('link[rel=icon]').getAttribute('href')).toMatch(
          /^data:image\/svg\+xml,/,
        );
      }
      if (width !== 768)
        await testInfo.attach(`LAB-${width}-${theme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
    }
  }
  const oldIcon = await page.request.get('/favicon.svg');
  expect(oldIcon.ok()).toBe(true);
  expect(await oldIcon.text()).not.toMatch(/<(path|rect|circle)\b/);
  await page.goto(`/articles/${article.content.slug}`);
  await expect(page.locator('img[src="/favicon.svg"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('後台選擇 LAB 類別後須發布才會出現在 LAB，取消發布立即移除', async ({ page, baseURL }) => {
  await page.context().addCookies(cookies);
  await page.goto(`/admin/projects/${draft.id}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('Category', { exact: true }).selectOption('LAB');
  await expect
    .poll(async () => {
      const current = (await (
        await page.request.get(`/api/admin/entries/${draft.id}`)
      ).json()) as Entry;
      return current.content.category;
    })
    .toBe('LAB');
  draft = await (await page.request.get(`/api/admin/entries/${draft.id}`)).json();
  expect(
    await (await page.request.get(`/lab?q=${encodeURIComponent(draft.content.title)}`)).text(),
  ).not.toContain('class="project-card"');
  draft = await mutate(page.request, baseURL!, draft, 'publish');
  await page.goto(`/lab?q=${encodeURIComponent(draft.content.title)}`);
  await expect(page.locator('.project-title')).toHaveText(draft.content.title);
  draft = await mutate(page.request, baseURL!, draft, 'unpublish');
  await page.reload();
  await expect(page.getByText('No matching experiments', { exact: true })).toBeVisible();
});
