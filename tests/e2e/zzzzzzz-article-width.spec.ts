import { expect, test } from '@playwright/test';

test('列表進入文章與返回時外框、側欄、內容起點及語言切換保持一致', async ({ page }) => {
  const measure = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ['.public-site', '.public-header', 'main .page-shell', '.language-switch'].map(
          (selector) => {
            const rect = document.querySelector(selector)!.getBoundingClientRect();
            return [selector, { x: rect.x, width: rect.width }];
          },
        ),
      ),
    );
  for (const width of [1920, 1440, 1320, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/articles');
    await expect(page.locator('.language-switch')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const list = await measure();
    await page.locator('main a[href^="/articles/"]').first().click();
    await expect(page.locator('[data-article-reader]')).toBeVisible();
    await expect(page.locator('.language-switch')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const detail = await measure();
    for (const selector of Object.keys(list)) {
      expect(
        Math.abs(list[selector].x - detail[selector].x),
        `${width} ${selector} 起點`,
      ).toBeLessThan(1);
      expect(
        Math.abs(list[selector].width - detail[selector].width),
        `${width} ${selector} 寬度`,
      ).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    if (width >= 1320) await expect(page.locator('.article-rail-sticky')).toBeVisible();
    await page.locator('.article-detail > .back-link').click();
    await expect(page.locator('.language-switch')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await measure()).toEqual(list);
  }
});
