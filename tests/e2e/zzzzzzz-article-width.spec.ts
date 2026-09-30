import { expect, test } from '@playwright/test';

for (const collection of [
  {
    name: '文章',
    path: '/articles',
    detail: '.article-detail',
    heading: '.article-heading',
    reading: '.article-grid',
    lineLimit: 74,
  },
  {
    name: '作品',
    path: '/projects',
    detail: '.project-detail',
    heading: '.project-detail-heading',
    reading: '.reading-layout',
    lineLimit: 72,
  },
]) {
  test(`列表進入${collection.name}與返回時外框、側欄、內容起點及語言切換保持一致`, async ({
    page,
  }) => {
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
      await page.goto(collection.path);
      await expect(page.locator('.language-switch')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const list = await measure();
      const listHeading = (await page.locator('.collection-header h1').boundingBox())!;
      await page.locator(`main a[href^="${collection.path}/"]`).first().click();
      await expect(page.locator(collection.detail)).toBeVisible();
      await expect(page.locator('.language-switch')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const detail = await measure();
      const detailHeading = (await page.locator(collection.heading).boundingBox())!;
      expect(
        Math.abs(detailHeading.x - listHeading.x),
        `${width} ${collection.name}標題與列表內容起點`,
      ).toBeLessThan(1);
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
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const frameWidth = await page.evaluate(() =>
        Math.min(document.documentElement.clientWidth, 1480),
      );
      expect(
        Math.abs(detail['.public-site'].width - frameWidth),
        '網站外框沿用 1480px 上限',
      ).toBeLessThan(1);
      const reading = (await page
        .locator(`${collection.detail} ${collection.reading}`)
        .boundingBox())!;
      const footer = (await page.locator('.public-footer-links').boundingBox())!;
      expect(Math.abs(footer.x - detailHeading.x), `${width} 頁尾與標題起點`).toBeLessThan(1);
      expect(
        Math.abs(footer.x + footer.width - reading.x - reading.width),
        `${width} 頁尾與閱讀區右緣`,
      ).toBeLessThan(1);
      const paragraphs = await page
        .locator(`${collection.detail} .prose > p:not(:has(img, video))`)
        .evaluateAll(
          (nodes, lineLimit) =>
            nodes.map((node) => {
              const style = getComputedStyle(node);
              const proseStyle = getComputedStyle(node.closest('.prose')!);
              const probe = document.createElement('span');
              Object.assign(probe.style, {
                position: 'fixed',
                visibility: 'hidden',
                display: 'block',
                font: style.font,
                width: `${lineLimit}ch`,
                maxWidth: 'none',
                padding: '0',
                border: '0',
              });
              document.body.append(probe);
              const lineWidth = probe.getBoundingClientRect().width;
              probe.remove();
              const cssLimit = Math.min(
                ...[style.maxWidth, proseStyle.maxWidth]
                  .map((value) => parseFloat(value))
                  .filter(Number.isFinite),
              );
              return { width: node.getBoundingClientRect().width, lineWidth, cssLimit };
            }),
          collection.lineLimit,
        );
      expect(paragraphs.length, '已發布內容包含可驗證的文字段落').toBeGreaterThan(0);
      for (const paragraph of paragraphs) {
        expect(Number.isFinite(paragraph.cssLimit), '段落仍有 CSS 行長上限').toBe(true);
        expect(paragraph.cssLimit, 'CSS 行長上限符合閱讀長度').toBeLessThanOrEqual(
          paragraph.lineWidth + 1,
        );
        expect(paragraph.width, '段落不會隨外框無限拉長').toBeLessThanOrEqual(
          paragraph.lineWidth + 1,
        );
      }
      if (width >= 1024) {
        const gutter = await page
          .locator(collection.detail)
          .evaluate((element) => parseFloat(getComputedStyle(element).paddingInlineStart));
        const header = detail['.public-header'];
        const gap = detailHeading.x - (header.x + header.width);
        const publicFrame = (await page.locator('.public-frame').boundingBox())!;
        const rightGap = publicFrame.x + publicFrame.width - reading.x - reading.width;
        expect(Math.abs(gap - gutter), `${width} ${collection.name}側欄與內容間距`).toBeLessThan(1);
        expect(Math.abs(rightGap - gutter), `${width} ${collection.name}內容右側間距`).toBeLessThan(
          1,
        );
        expect(Math.abs(gap - rightGap), `${width} ${collection.name}左右留白平衡`).toBeLessThan(1);
        expect(
          Math.abs(publicFrame.width - (detail['.public-site'].width - header.width)),
          '內容外框沒有改變側欄寬度',
        ).toBeLessThan(1);
        expect(header.width, '桌機側欄維持 260px').toBe(260);
        expect(gap, `${width} ${collection.name}沒有疊加置中留白`).toBeLessThanOrEqual(57);
      }
      if (width >= 1320 && collection.path === '/articles')
        await expect(page.locator('.article-rail-sticky')).toBeVisible();
      await page.locator(`${collection.detail} > .back-link`).click();
      await expect(page.locator('.language-switch')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await measure()).toEqual(list);
    }
  });
}
