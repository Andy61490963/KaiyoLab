import { test, expect, type APIRequestContext } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { emptyContent } from '../../src/lib/defaults';
import type { Entry } from '../../src/lib/types';

let owner: APIRequestContext;
let entry: Entry;
const slug = 'article-reading-fixture';
const title = 'ASP.NET Core DI：同一個介面，多個實作到底怎麼注入？';
const body =
  `A reading-layout fixture, not production content.\n\n## 前言\n\n` +
  '先釐清註冊、解析與生命週期，再討論實作的選擇。 '.repeat(30) +
  '\n\n## 註冊多個實作\n\n```csharp\n' +
  'LongTypeName'.repeat(45) +
  '\n```\n\n' +
  '| Field | Value |\n| --- | --- |\n| Long value | ' +
  'value'.repeat(120) +
  ' |\n\n' +
  'Keep the article language unchanged. '.repeat(25) +
  '\n\n## 生命週期與取捨\n\n' +
  'Scoped services belong to their request scope. '.repeat(25);

async function count(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/article-views/${id}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { views: number }).views;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname))
    throw new Error('These write fixtures require an isolated loopback test server.');
  owner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await owner.post('/api/auth/sign-in/email', {
      data: {
        email: process.env.E2E_EMAIL || 'e2e@example.test',
        password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026',
      },
    });
    if (response.status() !== 429 || attempt === 2) {
      expect(response.ok()).toBe(true);
      break;
    }
    const seconds = Number(
      response.headers()['retry-after'] || response.headers()['x-retry-after'],
    );
    expect(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60).toBe(true);
    await delay((seconds + 1) * 1000);
  }
  const created = await owner.post('/api/admin/entries', { data: { kind: 'article', title } });
  expect(created.status()).toBe(201);
  entry = await created.json();
  const updated = await owner.patch(`/api/admin/entries/${entry.id}`, {
    data: {
      version: entry.version,
      content: {
        ...emptyContent,
        title,
        slug,
        body,
        excerpt: '從單一注入、IEnumerable 到 enum resolver，釐清註冊順序與生命週期。',
        category: 'Backend Engineering',
        tags: ['C#', 'ASP.NET Core', 'DI'],
        cover: '/images/cover-grid.svg',
        coverAlt: 'Existing geometric test cover',
      },
    },
  });
  expect(updated.ok()).toBe(true);
  entry = await updated.json();
  const published = await owner.post(`/api/admin/entries/${entry.id}/action`, {
    data: { version: entry.version, action: 'publish' },
  });
  expect(published.ok()).toBe(true);
  entry = await published.json();
});
test.afterAll(async () => {
  if (entry && owner) {
    const current = (await (await owner.get(`/api/admin/entries/${entry.id}`)).json()) as Entry;
    await owner.post(`/api/admin/entries/${entry.id}/action`, {
      data: { version: current.version, action: 'trash' },
    });
  }
  await owner?.dispose();
});

test('views are persistent, reload-suppressed, localized, and not a unique-person claim', async ({
  page,
  request,
}) => {
  const before = await count(request, entry.id);
  expect(await count(request, entry.id)).toBe(before);
  await page.goto(`/articles/${slug}`);
  const badge = page.locator('[data-article-views]');
  await expect(badge).toHaveAttribute('data-view-registered', 'true');
  expect(await count(request, entry.id)).toBe(before + 1);
  await page.reload();
  await expect(badge).toHaveAttribute('data-view-registered', 'true');
  expect(await count(request, entry.id)).toBe(before + 1);
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(badge).toHaveAttribute('aria-label', `${before + 1} 次瀏覽`);
  await expect(badge).toHaveAttribute('title', /並非不重複人數/);
  await expect(page.locator('main h1')).toHaveText(title);
});

test('article hero and reading columns fit both themes and languages without document overflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/articles/${slug}`);
      for (const language of ['English', '繁體中文']) {
        await page.getByRole('button', { name: language, exact: true }).click();
        await page
          .locator('.article-cover img')
          .evaluate(async (image: HTMLImageElement) => image.decode());
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${width}/${theme}/${language}`,
        ).toBe(true);
        if (width === 1440) {
          const text = (await page.locator('.article-heading').boundingBox())!;
          const image = (await page.locator('.article-cover').boundingBox())!;
          expect(image.x).toBeGreaterThanOrEqual(text.x + text.width);
          await expect(page.locator('.article-toc')).toBeVisible();
        } else if (width <= 1024) {
          await expect(page.locator('.mobile-toc')).toBeVisible();
        }
        expect(await page.locator('.article-byline .entry-tags a').first().evaluate(
          element => parseFloat(getComputedStyle(element).fontSize),
        )).toBeGreaterThanOrEqual(13);
        if ([375, 1440].includes(width) && language === '繁體中文') {
          await expect(page.locator('[data-article-views]')).toHaveAttribute(
            'data-view-state',
            'ready',
          );
          await page.screenshot({
            path: testInfo.outputPath(`article-${theme}-${width}.png`),
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test('active table of contents follows sections, and native keyboard anchors still work', async ({
  page,
}) => {
  await page.goto(`/articles/${slug}`);
  const nav = page.getByRole('navigation', { name: 'Article table of contents', exact: true });
  const link = nav.getByRole('link', { name: '註冊多個實作', exact: true });
  // The Markdown pipeline intentionally prefixes IDs to prevent DOM-name collisions.
  const target = await page.locator('.article-body h2').filter({ hasText: '註冊多個實作' }).getAttribute('id');
  expect(target).toBeTruthy();
  await expect(link).toHaveAttribute('href', `#${target}`);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(link).toHaveAttribute('aria-current', 'location');
  expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${target}`);
  const next = nav.getByRole('link', { name: '生命週期與取捨', exact: true });
  await next.click();
  await expect(next).toHaveAttribute('aria-current', 'location');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/articles/${slug}`);
  await page.locator('.mobile-toc summary').click();
  const mobileLink = page
    .getByRole('navigation', { name: 'Mobile article table of contents' })
    .getByRole('link', { name: '註冊多個實作', exact: true });
  await mobileLink.click();
  await expect(mobileLink).toHaveAttribute('aria-current', 'location');
  expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${target}`);
});

test('missing covers and failed telemetry do not break reading or invent counts', async ({
  page,
}) => {
  await page.route('**/api/article-views/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"unavailable"}',
    }),
  );
  const response = await page.goto('/articles/aspnet-core-di-multiple-implementations');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.article-cover')).toHaveCount(0);
  await expect(page.locator('.article-heading h1')).toBeVisible();
  await expect(page.locator('[data-article-views]')).toHaveAttribute(
    'data-view-state',
    'unavailable',
  );
  await expect(page.locator('[data-view-number]')).toHaveText('—');
});

test('reading, original contents, and section links remain available without JavaScript', async ({
  browser,
  baseURL,
  request,
}) => {
  const before = await count(request, entry.id);
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto(`/articles/${slug}`);
    await expect(page.locator('main h1')).toHaveText(title);
    await page.locator('.mobile-toc summary').click();
    await page
      .getByRole('navigation', { name: 'Mobile article table of contents' })
      .getByRole('link', { name: '註冊多個實作', exact: true })
      .click();
    expect(await count(request, entry.id)).toBe(before);
    await expect(page.locator('[data-view-number]')).toHaveText('—');
  } finally {
    await context.close();
  }
});
