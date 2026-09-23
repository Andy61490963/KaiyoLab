import { test, expect } from '@playwright/test';

// The existing publishing suite initializes an isolated test database before this file.
test('public pages have English navigation and fit narrow screens', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/articles', '/projects', '/about']) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('main h1').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path}: ${width}px / ${theme}`).toBe(true);
        expect(await page.locator('.public-brand').locator('img').count()).toBe(0);
        if (path === '/about' && [375, 1440].includes(width)) {
          await testInfo.attach(`about-${theme}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test('mobile navigation works without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Open menu', exact: true });
    const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(nav).toBeHidden();
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'About Me', exact: true }).click();
    await expect(page).toHaveURL(/\/about\/?$/);
    await expect(page.locator('main h1').first()).toBeVisible();
  } finally { await context.close(); }
});

test('menu closes on Escape and resize without duplicate visible navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/about');
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(nav).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(nav).toBeHidden();
});

test('search links preserve other filters and focus the requested search field', async ({ page }) => {
  await page.goto('/articles?q=Astro&category=Development#article-search');
  await expect(page.getByRole('searchbox', { name: 'Search articles' })).toBeFocused();
  const tag = page.locator('.tag-cloud a[href*="tag="]').first();
  await expect(tag).toBeVisible();
  const target = new URL((await tag.getAttribute('href'))!, page.url());
  expect(target.searchParams.get('q')).toBe('Astro');
  expect(target.searchParams.get('category')).toBe('Development');
  expect(target.searchParams.has('page')).toBe(false);
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/?$/);
});

test('system theme still works when storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/about');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
