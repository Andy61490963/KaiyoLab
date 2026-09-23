import { test, expect, type Page } from '@playwright/test';
import type { SiteSettings } from '../../src/lib/types';

const languageButton = (page: Page) => page.locator('.language-toggle:visible');
const noteSlugs = [
  'dotnet-di-multiple-implementations', 'tls-certificate-name-mismatch',
  'debugging-502-container-vs-public', 'draft-autosave-publish-boundaries',
  'mes-integration-before-retry',
];
const authoredHtml = (page: Page) => page.locator('[data-authored-content]').evaluate((element) => {
  const copy = element.cloneNode(true) as HTMLElement;
  // Generated copy buttons are interface controls, not authored Markdown.
  copy.querySelectorAll('.copy-code').forEach((button) => button.remove());
  return copy.innerHTML;
});

test('toggle changes only UI and persists without navigating or rewriting content', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const original = await page.locator('.home-intro-markdown').innerHTML();
  const url = page.url();
  await languageButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { name: '最新文章', exact: true })).toBeVisible();
  expect(await page.locator('.home-intro-markdown').innerHTML()).toBe(original);
  expect(page.url()).toBe(url);
  await expect(languageButton(page)).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  for (const slug of noteSlugs) {
    const response = await page.goto(`/articles/${slug}`);
    expect(response?.status()).toBe(200);
    const body = await authoredHtml(page);
    const title = await page.locator('main h1').innerText();
    await languageButton(page).click();
    expect(await authoredHtml(page)).toBe(body);
    expect(await page.locator('main h1').innerText()).toBe(title);
  }
  const second = await context.newPage();
  await second.goto('/about');
  await languageButton(page).click();
  await expect(second.locator('html')).toHaveAttribute('lang', (await page.locator('html').getAttribute('lang'))!);
  await second.close();
  expect(errors).toEqual([]);
});

test('public refinements fit both languages and themes at five viewport widths', async ({ page }, testInfo) => {
  for (const language of ['en', 'zh-TW']) {
    await page.goto('/');
    await page.evaluate((value) => localStorage.setItem('kaiyo-ui-language', value), language);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of ['/', '/articles?q=C%23', '/projects', '/about']) {
          await page.goto(path);
          await expect(page.locator('html')).toHaveAttribute('lang', language);
          await expect(languageButton(page)).toHaveCount(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} ${language} ${theme} ${width}`).toBe(true);
          if (path === '/') {
            const cat = page.locator('.home-companion img');
            await expect(cat).toBeVisible();
            expect(await cat.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
            await expect(page.locator('.public-sidebar-bottom a')).toHaveCount(1);
            await expect(page.locator('.public-sidebar-bottom a')).toHaveAttribute('href', 'https://github.com/Andy61490963');
            if ([375, 1440].includes(width)) {
              await testInfo.attach(`home-${language}-${theme}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
            }
          }
        }
      }
    }
  }
});

test('Chinese search and mobile controls retain their behaviors', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await languageButton(page).click();
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await page.getByRole('navigation', { name: '行動版導覽' }).getByRole('link', { name: '文章', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜尋文章' }).fill('Timeout');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page).toHaveURL(/q=Timeout/);
  await expect(page.getByRole('heading', { name: 'MES 系統整合：Timeout 之後，重試之前' })).toBeVisible();
  await page.getByRole('button', { name: '切換深色主題' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('blocked preference storage and reduced motion keep the switch usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await languageButton(page).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  expect(await languageButton(page).evaluate((button) => getComputedStyle(button, '::before').transitionDuration)).toBe('0s');
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('homepage remains readable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.language-toggle:visible')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Latest Articles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '最新文章' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  } finally { await context.close(); }
});

// This fixture changes only the isolated CI database and always restores it.
test('a long, authored timeline keeps its text with the cat beside it', async ({ page, baseURL }, testInfo) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Use an isolated local test server, never production.');
  const headers = { Origin: baseURL };
  const login = await page.request.post('/api/auth/sign-in/email', { headers, data: { email: process.env.E2E_EMAIL || 'e2e@example.test', password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026' } });
  expect(login.ok()).toBe(true);
  const response = await page.request.get('/api/admin/settings');
  expect(response.ok()).toBe(true);
  const original = await response.json() as SiteSettings;
  const intro = "# Hey, I'm Andy!\n\nSoftware engineer, builder, and knowledge sharer.\n\n## A Brief Timeline\n\n**2001–2020　Gamer**\n\nGrew up playing games and exploring technology.\n\n**2020–2024　Study @ NTTU**\n\nStarted building personal projects and sharing development notes and knowledge online.\n\n**2024–2025　Software Engineering Intern @ NTTU**\n\nDeveloped and maintained systems related to student affairs and university administration.\n\n**2025–Now　MES Backend Engineer**\n\nBuilding MES-related systems and integrating heterogeneous systems across manufacturing environments.";
  try {
    const update = await page.request.put('/api/admin/settings', { headers, data: { ...original, authorName: 'Andy', homeIntro: intro } });
    expect(update.ok()).toBe(true);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: "Hey, I'm Andy!" })).toBeVisible();
      for (const lang of ['en', 'zh-TW']) {
        if (await page.locator('html').getAttribute('lang') !== lang) await languageButton(page).click();
        await expect(page.getByRole('heading', { name: 'A Brief Timeline' })).toBeVisible();
        if (width === 1440) {
          const cat = (await page.locator('.home-companion').boundingBox())!;
          const copy = (await page.locator('.home-intro-copy').boundingBox())!;
          expect(cat.x).toBeGreaterThanOrEqual(copy.x + copy.width);
        }
        await page.locator('.home-companion img').evaluate((img: HTMLImageElement) => img.decode());
        await testInfo.attach(`timeline-${lang}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
  } finally {
    const restored = await page.request.put('/api/admin/settings', { headers, data: original });
    expect(restored.ok()).toBe(true);
  }
});
