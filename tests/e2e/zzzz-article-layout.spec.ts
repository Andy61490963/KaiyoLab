import { test, expect } from '@playwright/test';

// The publishing suite initializes an isolated database; the notes are migration fixtures.
const articlePath = '/articles/aspnet-core-di-multiple-implementations';

test('article columns fit both languages and themes without changing other pages', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    expect((await page.goto(articlePath))?.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 375, 768, 1024, 1280, 1440, 1648, 1920]) {
      await page.setViewportSize({ width, height: 928 });
      for (const language of ['en', 'zh-TW'] as const) {
        await page.getByRole('button', {
          name: language === 'en' ? 'English' : '繁體中文', exact: true,
        }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${width}px / ${theme} / ${language}`).toBe(true);
        await expect(page.locator('.article-heading h1')).toBeVisible();
        expect(await page.locator('.article-byline .entry-tags a').first().evaluate(
          (tag) => parseFloat(getComputedStyle(tag).fontSize),
        )).toBeGreaterThanOrEqual(13);
        const rail = page.locator('.article-rail');
        const mobileToc = page.locator('.mobile-toc');
        if (width >= 1320) {
          await expect(rail).toBeVisible();
          await expect(mobileToc).toBeHidden();
          const heading = (await page.locator('.article-heading').boundingBox())!;
          const column = (await page.locator('.article-reading-column').boundingBox())!;
          const card = (await page.locator('.article-rail-card').boundingBox())!;
          const toggle = (await page.locator('.language-switch').boundingBox())!;
          expect(Math.abs(heading.y - card.y)).toBeLessThanOrEqual(2);
          expect(card.x).toBeGreaterThan(column.x + column.width + 16);
          expect(card.y).toBeGreaterThanOrEqual(toggle.y + toggle.height + 8);
          expect(column.width).toBeGreaterThan(600);
        } else {
          await expect(rail).toBeHidden();
          await expect(mobileToc).toBeVisible();
        }
        if ([375, 1648].includes(width) && language === 'zh-TW') {
          const path = testInfo.outputPath(`article-${theme}-${language}-${width}.png`);
          await page.screenshot({ path, animations: 'disabled' });
          await testInfo.attach(`article-${theme}-${width}`, { path, contentType: 'image/png' });
        }
      }
    }
  }
  await page.goto('/');
  await expect(page.locator('.home-mascot')).toBeVisible();
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).maxWidth)).toBe('1480px');
  await expect(page.locator('.public-sidebar-bottom a')).toHaveCount(1);
  await expect(page.locator('.public-sidebar-bottom a')).toHaveAttribute('href', 'https://github.com/Andy61490963');
  expect(errors).toEqual([]);
});

test('outline follows scrolling and keyboard anchors while the rail stays available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(articlePath);
  const links = page.locator('.article-rail .article-outline a');
  expect(await links.count()).toBeGreaterThan(2);
  await expect(links.first()).toHaveAttribute('aria-current', 'location');
  const target = links.nth(1);
  const id = (await target.getAttribute('data-toc-target'))!;
  await target.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${encodeURIComponent(id)}`);
  await expect(target).toHaveAttribute('aria-current', 'location');
  expect(await page.evaluate((headingId) => document.activeElement?.id === headingId, id)).toBe(true);
  await expect.poll(() => page.locator('.article-rail-card').evaluate((card) => Math.round(card.getBoundingClientRect().top))).toBe(80);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(links.last()).toHaveAttribute('aria-current', 'location');
  expect(await page.locator('.article-rail .article-outline').evaluate((nav) => getComputedStyle(nav).overflowY)).toBe('visible');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(links.first()).toHaveAttribute('aria-current', 'location');
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('');
});

test('switching interface language preserves authored article and outline content', async ({ page }) => {
  await page.goto(articlePath);
  await expect(page.locator('.copy-code').first()).toBeVisible();
  const authored = async () => ({
    title: await page.locator('.article-heading h1').innerText(),
    excerpt: await page.locator('.article-lead').innerText(),
    code: await page.locator('.article-prose pre code').allTextContents(),
    outline: await page.locator('.article-rail .article-outline a').allTextContents(),
    tags: await page.locator('.article-rail-tags a').allTextContents(),
  });
  const original = await authored();
  const url = page.url();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('link', { name: '返回文章列表', exact: true })).toBeVisible();
  await expect(page.locator('.article-rail > .article-rail-card > h2')).toHaveText('目錄', { useInnerText: true });
  expect(await authored()).toEqual(original);
  expect(page.url()).toBe(url);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  expect(await authored()).toEqual(original);
  const related = page.locator('.article-rail-related a');
  await expect(related).toHaveCount(3);
  const hrefs = await related.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  for (const href of hrefs) expect(href).not.toBe(articlePath);
  const tag = page.locator('.article-rail-tags a').first();
  const tagName = await tag.innerText();
  expect(new URL((await tag.getAttribute('href'))!, page.url()).searchParams.get('tag')).toBe(tagName);
});

test('mobile table of contents and native fragments remain usable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto(articlePath);
    const toc = page.locator('.mobile-toc');
    await toc.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(toc).toHaveAttribute('open', '');
    const link = toc.locator('nav a').nth(1);
    const id = (await link.getAttribute('data-toc-target'))!;
    await link.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(`#${encodeURIComponent(id)}`);
    const geometry = await page.evaluate((headingId) => ({
      heading: document.getElementById(headingId)!.getBoundingClientRect().top,
      header: document.querySelector('.public-header')!.getBoundingClientRect().bottom,
    }), id);
    expect(geometry.heading).toBeGreaterThanOrEqual(geometry.header);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally {
    await context.close();
  }
});

test('technical images retain their ratio and wide code and tables scroll locally', async ({ page }) => {
  // Browser-only fixture: no production content or database records are modified.
  await page.route('**/__article-layout-test.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#888"/></svg>',
  }));
  for (const width of [375, 1648]) {
    await page.setViewportSize({ width, height: 928 });
    await page.goto(articlePath);
    await page.evaluate(() => {
      const column = document.querySelector('.article-reading-column')!;
      const figure = document.createElement('figure');
      figure.className = 'article-cover';
      const image = document.createElement('img');
      image.id = 'article-media-fixture';
      image.src = '/__article-layout-test.svg';
      image.alt = 'Wide technical diagram test fixture';
      image.width = 1280;
      image.height = 720;
      figure.append(image);
      column.querySelector('.article-heading')!.after(figure);
      const table = document.createElement('table');
      table.id = 'article-overflow-fixture';
      const row = table.insertRow();
      for (let i = 0; i < 12; i++) {
        const cell = row.insertCell();
        cell.textContent = `COLUMN_${i}_${'x'.repeat(80)}`;
        cell.style.whiteSpace = 'nowrap';
      }
      document.querySelector('.article-prose')!.append(table);
      document.querySelector('.article-prose pre code')!.textContent = 'veryLongIdentifier'.repeat(80);
    });
    const image = page.locator('#article-media-fixture');
    await image.evaluate((img: HTMLImageElement) => img.decode());
    expect(await image.evaluate((img) => {
      const box = img.getBoundingClientRect();
      return box.width / box.height;
    })).toBeCloseTo(3, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.locator('.article-prose pre').first().evaluate((pre) => pre.scrollWidth > pre.clientWidth)).toBe(true);
    expect(await page.locator('#article-overflow-fixture').evaluate((table) => table.scrollWidth > table.clientWidth)).toBe(true);
  }
});
