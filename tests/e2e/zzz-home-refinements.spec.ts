import { test, expect } from '@playwright/test';
import type { SiteSettings } from '../../src/lib/types';

const noteSlugs = [
  'aspnet-core-di-multiple-implementations',
  'tls-name-mismatch-file-sync',
  '502-follow-the-request',
  'mes-timeouts-idempotency',
  'manufacturing-ai-poc-evaluation',
];

test('language changes UI without navigating, rewriting content, or losing search state', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const intro = await page.locator('.home-intro-markdown').innerHTML();
  const titles = await page.locator('.journal-entry-title').allTextContents();
  const address = page.url();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const chinese = page.getByRole('button', { name: '繁體中文', exact: true });
  await chinese.focus();
  await page.keyboard.press('Space');
  await expect(chinese).toBeFocused();
  await expect(chinese).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { name: '最新文章', exact: true })).toBeVisible();
  expect(page.url()).toBe(address);
  expect(await page.locator('.home-intro-markdown').innerHTML()).toBe(intro);
  expect(await page.locator('.journal-entry-title').allTextContents()).toEqual(titles);
  expect(requests).toEqual([]);
  await page.goto('/articles?q=Astro&tag=HTTP');
  await expect(page.getByRole('searchbox', { name: '搜尋文章' })).toHaveValue('Astro');
  await expect(page).toHaveTitle('文章 · KaiyoLab');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search articles' })).toHaveValue('Astro');
  expect(new URL(page.url()).search).toBe('?q=Astro&tag=HTTP');
});

test('all five notes are real published content and keep their original language', async ({
  page,
  request,
}) => {
  for (const slug of noteSlugs) {
    const response = await request.get(`/articles/${slug}`);
    expect(response.status()).toBe(200);
  }
  await page.goto(`/articles/${noteSlugs[0]}`);
  const title = await page.locator('main h1').innerText();
  const code = await page.locator('.prose code').allTextContents();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('link', { name: '返回文章列表', exact: true })).toBeVisible();
  expect(await page.locator('main h1').innerText()).toBe(title);
  expect(await page.locator('.prose code').allTextContents()).toEqual(code);
  await page.goto(`/articles/${noteSlugs[2]}`);
  await expect(page.locator('main h1')).toHaveText(
    'A Practical 502 Checklist: Follow the Request, Not the Guess',
  );
  expect((await request.get('/api/admin/entries')).status()).toBe(401);
});

test('home layout, portrait, and controls fit both languages in both themes', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const response = await request.post('/api/auth/sign-in/email', {
    headers: { Origin: baseURL! },
    data: {
      email: process.env.E2E_EMAIL || 'e2e@example.test',
      password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026',
    },
  });
  expect(response.ok()).toBeTruthy();
  const original = (await (await request.get('/api/admin/settings')).json()) as SiteSettings;
  const timeline =
    "# Hey, I'm Andy!\n\nSoftware engineer, builder, and knowledge sharer.\n\n## A Brief Timeline\n\n**2001–2020　Gamer**\n\nGrew up playing games and exploring technology.\n\n**2020–2024　Study @ NTTU**\n\nStarted building personal projects and sharing development notes and knowledge online.\n\n**2024–2025　Software Engineering Intern @ NTTU**\n\nDeveloped and maintained systems related to student affairs and university administration.\n\n**2025–Now　MES Backend Engineer**\n\nBuilding MES-related systems and integrating heterogeneous systems across manufacturing environments.";
  try {
    expect(
      (
        await request.put('/api/admin/settings', {
          headers: { Origin: baseURL! },
          data: { ...original, homeIntro: timeline },
        })
      ).ok(),
    ).toBeTruthy();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [320, 375, 768, 900, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const language of ['en', 'zh-TW'] as const) {
          await page.goto('/');
          await page
            .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
            .click();
          await page.locator('.home-mascot img').evaluate(async (img: HTMLImageElement) => {
            await img.decode();
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${width} ${theme} ${language}`,
          ).toBe(true);
          for (const button of await page.locator('.language-switch button').all()) {
            const bounds = await button.boundingBox();
            expect(bounds!.width).toBeGreaterThanOrEqual(44);
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          }
          if (width === 1440) {
            const sidebar = page.locator('.public-sidebar-bottom a');
            await expect(sidebar).toHaveCount(1);
            await expect(sidebar).toHaveAttribute('href', 'https://github.com/Andy61490963');
            const portrait = (await page.locator('.home-mascot').boundingBox())!;
            const copy = (await page.locator('.home-intro-copy').boundingBox())!;
            expect(portrait.x).toBeGreaterThanOrEqual(copy.x + copy.width);
          }
          if ([375, 1440].includes(width)) {
            await page.screenshot({
              path: testInfo.outputPath(`home-${theme}-${language}-${width}.png`),
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
      }
    }
    expect(errors).toEqual([]);
  } finally {
    expect(
      (
        await request.put('/api/admin/settings', { headers: { Origin: baseURL! }, data: original })
      ).ok(),
    ).toBeTruthy();
  }
});

test('language selection synchronizes tabs and does not interfere with themes or menus', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/about');
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(other.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '行動版導覽' })).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
  await other.close();
});

test('blocked storage and reduced motion keep the switch usable', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  expect(
    await page
      .locator('.language-switch-thumb')
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe('0s');
  await page.getByRole('button', { name: '切換深色主題', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('without JavaScript the default interface works and no dead language control is shown', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.language-switch')).toBeHidden();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Articles', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Articles', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
