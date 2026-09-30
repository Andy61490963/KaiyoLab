import { expect, test, type Page } from '@playwright/test';

const slugs = ['flow-field', 'svg-studio', 'kinetic-carousel', 'motion-studio', 'grid-studio'];

async function verifyPreviews(page: Page) {
  const rows = page.locator('.lab-index-row');
  await expect(rows).toHaveCount(5);
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))).toEqual(
    slugs.map((slug) => `/lab/${slug}`),
  );
  for (const slug of slugs) {
    const row = page.locator(`.lab-index-row[data-lab-slug="${slug}"]`);
    const preview = row.locator(`[data-lab-preview="${slug}"]`);
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview.locator('button, a, input, select, textarea, [tabindex]')).toHaveCount(0);
    const box = await preview.boundingBox();
    expect(box!.width).toBeGreaterThan(80);
    expect(box!.height).toBeGreaterThan(50);
  }
  // 入口直接使用可繪製的 SVG 幾何與原工具素材，不依賴五個 React 工具掛載
  await expect(page.locator('.lab-experiment-index astro-island')).toHaveCount(0);
  const trails = page.locator('[data-lab-preview="flow-field"] path');
  expect(await trails.count()).toBeGreaterThan(20);
  expect(
    await trails.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          /^M.+L/.test(node.getAttribute('d') || '') &&
          !/NaN|Infinity/.test(node.getAttribute('d') || ''),
      ),
    ),
  ).toBe(true);
  await expect(page.locator('[data-lab-preview="svg-studio"] .lab-preview-shape')).toHaveAttribute(
    'd',
    /^M.+C.+Z$/,
  );
  await expect(page.locator('[data-lab-preview="grid-studio"] [data-preview-cell]')).toHaveCount(6);
  const cards = page.locator('[data-lab-preview="kinetic-carousel"] img');
  await expect(cards).toHaveCount(3);
  await cards.first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.every(
          (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
}

test('LAB 五個成果入口可直接看見真實預覽並連到對應玩法', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lab');
  await verifyPreviews(page);
  const first = page.locator('.lab-index-row').first();
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/lab\/flow-field$/);
  await expect(page.locator('[data-flow-field]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('停用 JavaScript 仍有五個成果預覽與可使用的入口', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 375, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto('/lab');
    await verifyPreviews(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.locator('.lab-index-row[data-lab-slug="svg-studio"]').click();
    await expect(page).toHaveURL(/\/lab\/svg-studio$/);
    await expect(page.locator('.lab-demo noscript p')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('LAB 成果預覽在375、768、1440px中英文明暗皆完整可讀', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/lab');
    for (const language of ['繁體中文', 'English']) {
      await page.getByRole('button', { name: language, exact: true }).click();
      for (const theme of ['dark', 'light']) {
        await page.evaluate(
          (theme) => document.documentElement.setAttribute('data-theme', theme),
          theme,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${width}/${language}/${theme}`,
        ).toBe(true);
        await expect(page.locator('main h1')).toHaveCount(1);
        for (const slug of slugs) {
          const preview = page.locator(`[data-lab-preview="${slug}"]`);
          await expect(preview).toBeVisible();
          const box = await preview.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        }
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await testInfo.attach(`LAB成果入口-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

test('入口聚焦會展示短暫效果，減少動態時保持靜態', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/lab');
  const motion = page.locator('.lab-index-row[data-lab-slug="motion-studio"]');
  const object = motion.locator('.lab-preview-motion-move');
  const initial = await object.evaluate((node) => getComputedStyle(node).transform);
  await motion.focus();
  await expect
    .poll(() => object.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe(initial);
  await expect(motion).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(object).toHaveCSS('transform', 'none');
  for (const slug of slugs) {
    const row = page.locator(`.lab-index-row[data-lab-slug="${slug}"]`);
    await row.focus();
    const running = await row
      .locator('[data-lab-preview]')
      .evaluate(
        (node) =>
          node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      );
    expect(running).toBe(0);
  }
});
