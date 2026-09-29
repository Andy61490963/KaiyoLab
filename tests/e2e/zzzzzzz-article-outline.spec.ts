import { test, expect, type Locator } from '@playwright/test';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const articlePath = '/articles/aspnet-core-di-multiple-implementations';

async function expectStickyWithinArticle(rail: Locator) {
  await expect
    .poll(() =>
      rail.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const boundary = node.parentElement!.getBoundingClientRect();
        // 側欄真正抵達文章底界時正常離開，不把 footer 當成閱讀區覆蓋
        return Math.abs(box.top - Math.min(80, boundary.bottom - box.height));
      }),
    )
    .toBeLessThan(2);
}

test('目錄與推薦共同固定，末段錨點正確且側欄遵守文章底界', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(articlePath);
  await page.evaluate(() => document.fonts.ready);
  const links = page.locator('.article-rail .article-outline a');
  const rail = page.locator('.article-rail-sticky');
  const card = page.locator('.article-rail-card');
  const supplement = page.locator('.article-rail-supplement');
  for (const height of [928, 900, 720]) {
    await page.setViewportSize({ width: 1440, height });
    let pinnedSupplementTop: number | undefined;
    for (const index of [2, 0, 3, 1, 3]) {
      const link = links.nth(index);
      const id = (await link.getAttribute('data-toc-target'))!;
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'location');
      await expectStickyWithinArticle(rail);
      if (index < 2) {
        await expect
          .poll(() => rail.evaluate((node) => Math.round(node.getBoundingClientRect().top)))
          .toBe(80);
        const top = Math.round((await supplement.boundingBox())!.y);
        if (pinnedSupplementTop !== undefined) expect(top).toBe(pinnedSupplementTop);
        pinnedSupplementTop = top;
        await expect(supplement.locator('.article-rail-related a').first()).toBeInViewport();
      }
      const panelGap = await supplement.evaluate(
        (node) =>
          node.getBoundingClientRect().top -
          node.previousElementSibling!.getBoundingClientRect().bottom,
      );
      expect(panelGap).toBe(24);
      expect(await card.evaluate((node) => getComputedStyle(node).position)).toBe('static');
      expect(await supplement.evaluate((node) => getComputedStyle(node).position)).not.toBe(
        'sticky',
      );
      expect(await page.evaluate((target) => document.activeElement?.id === target, id)).toBe(true);
      expect(new URL(page.url()).hash).toBe(`#${encodeURIComponent(id)}`);
      const before = await page.evaluate(() => scrollY);
      // 顏色、語言和目前章節更新不得再次移動文章或目錄
      await page.getByRole('button', { name: '繁體中文', exact: true }).click();
      await expectStickyWithinArticle(rail);
      expect(await page.evaluate(() => scrollY)).toBe(before);
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await links.nth(1).click();
    await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important }' });
    const path = testInfo.outputPath(`article-outline-${theme}-1440.png`);
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`固定目錄-${theme}`, { path, contentType: 'image/png' });
  }
});

test('延後完成的圖表保留錨點，但不搶走讀者手動捲動後的位置', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(articlePath);
  await page.evaluate(() => {
    document.documentElement.style.overflowAnchor = 'none';
  });
  const link = page.locator('.article-rail .article-outline a').nth(1);
  const id = (await link.getAttribute('data-toc-target'))!;
  await link.click();
  const offset = await page.evaluate(
    (target) => document.getElementById(target)!.getBoundingClientRect().top,
    id,
  );
  const finishDiagram = () =>
    page.evaluate((target) => {
      const diagram = document.createElement('div');
      diagram.style.height = '240px';
      document.getElementById(target)!.before(diagram);
      document.dispatchEvent(new CustomEvent('kaiyo:diagram-rendered'));
    }, id);
  await finishDiagram();
  await expect
    .poll(() =>
      page.evaluate(
        ({ target, expected }) =>
          Math.abs(document.getElementById(target)!.getBoundingClientRect().top - expected),
        { target: id, expected: offset },
      ),
    )
    .toBeLessThan(2);
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() =>
      page.evaluate((target) => document.getElementById(target)!.getBoundingClientRect().top, id),
    )
    .toBeLessThan(0);
  const manualPosition = await page.evaluate(() => scrollY);
  await finishDiagram();
  expect(await page.evaluate(() => scrollY)).toBe(manualPosition);
});

test('長中文目錄在桌機內捲動，手機與平板保留可操作的折疊目錄', async ({
  page,
  baseURL,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { Origin: baseURL! };
  await signInForFixture(page.request, baseURL!);
  const created = await page.request.post('/api/admin/entries', {
    headers,
    data: { kind: 'article', title: '長目錄驗收' },
  });
  expect(created.ok()).toBe(true);
  let entry = (await created.json()) as Entry;
  try {
    const body = Array.from(
      { length: 24 },
      (_, index) =>
        `## 第 ${index + 1} 節：製造執行系統的併發控制與工單狀態轉移\n\n${Array.from({ length: 8 }, () => '工單必須在同一個交易內檢查版本與更新狀態，避免兩個工作站同時覆寫同一筆資料').join('\n\n')}`,
    ).join('\n\n');
    const saved = await page.request.patch(`/api/admin/entries/${entry.id}`, {
      headers,
      data: {
        version: entry.version,
        content: {
          ...entry.content,
          body,
          excerpt: '目錄固定、長標題與不同視窗尺寸驗收',
          tags: ['MES', '併發控制'],
        },
      },
    });
    expect(saved.ok()).toBe(true);
    entry = (await saved.json()) as Entry;
    const published = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
      headers,
      data: { action: 'publish', version: entry.version },
    });
    expect(published.ok()).toBe(true);
    entry = (await published.json()) as Entry;
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/articles/${entry.content.slug}`);
      await page.evaluate(() => document.fonts.ready);
      const toc = page.locator(
        width >= 1320 ? '.article-rail .article-outline' : '.mobile-toc .article-outline',
      );
      if (width < 1320) await page.locator('.mobile-toc summary').click();
      const link = toc.locator('a').nth(18);
      const id = (await link.getAttribute('data-toc-target'))!;
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'location');
      expect(new URL(page.url()).hash).toBe(`#${encodeURIComponent(id)}`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (width >= 1320) {
        const card = page.locator('.article-rail-sticky');
        await expect
          .poll(() => card.evaluate((node) => Math.round(node.getBoundingClientRect().top)))
          .toBe(80);
        const bounds = await link.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(80);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(880);
        const position = await page.evaluate(() => scrollY);
        await page.mouse.move(1270, 350);
        await page.mouse.wheel(0, -240);
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(position);
        // 矮視窗與長目錄也只有外層捲軸；Tab 必須到得了推薦與標籤
        await page.setViewportSize({ width, height: 600 });
        const scrollContainers = await page
          .locator('.article-rail')
          .evaluate((rail) =>
            [...rail.querySelectorAll<HTMLElement>('*')]
              .filter(
                (node) =>
                  ['auto', 'scroll'].includes(getComputedStyle(node).overflowY) &&
                  node.scrollHeight > node.clientHeight + 1,
              )
              .map((node) => node.className),
          );
        expect(scrollContainers).toEqual(['article-rail-sticky']);
        const allLinks = page.locator('.article-rail-sticky a');
        await allLinks.first().focus();
        const focusedPosition = await page.evaluate(() => scrollY);
        for (let index = 0; index < (await allLinks.count()); index++) {
          const current = allLinks.nth(index);
          if (index > 0) await page.keyboard.press('Tab');
          await expect(current).toBeFocused();
          const focusBounds = (await current.boundingBox())!;
          expect(focusBounds.y).toBeGreaterThanOrEqual(79);
          expect(focusBounds.y + focusBounds.height).toBeLessThanOrEqual(577);
          expect(await page.evaluate(() => scrollY)).toBe(focusedPosition);
        }
        await page.setViewportSize({ width, height: 900 });
      } else {
        const geometry = await page.evaluate(
          (target) => ({
            heading: document.getElementById(target)!.getBoundingClientRect().top,
            header: document.querySelector('.public-header')!.getBoundingClientRect().bottom,
          }),
          id,
        );
        expect(geometry.heading).toBeGreaterThanOrEqual(geometry.header);
      }
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important }' });
      const path = testInfo.outputPath(`long-article-outline-${width}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      await testInfo.attach(`長目錄-${width}`, { path, contentType: 'image/png' });
    }
  } finally {
    const current = await page.request.get(`/api/admin/entries/${entry.id}`);
    if (current.ok()) {
      const latest = (await current.json()) as Entry;
      await page.request.post(`/api/admin/entries/${entry.id}/action`, {
        headers,
        data: { action: 'trash', version: latest.version },
      });
    }
  }
});
