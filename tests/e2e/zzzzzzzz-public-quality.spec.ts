import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

test('手機標籤、搜尋、閱讀時間及分享資料沿用現有版型', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  const headers = { Origin: baseURL! };
  await signInForFixture(page.request, baseURL!);
  const entries: Entry[] = [];
  const category = `閱讀驗收-${Date.now()}`;
  const longEnglishTag = 'A'.repeat(80);
  const longChineseTag = '標'.repeat(80);
  const tags = [
    ...Array.from({ length: 18 }, (_, index) => `quality-${index + 1}`),
    longEnglishTag,
    longChineseTag,
  ];
  try {
    for (const [title, body] of [
      [
        'MES 公開閱讀驗收',
        `## 交易規則\n\n${'報工併發控制需要保護資料一致性'.repeat(60)}\n\n使用 FOR UPDATE 鎖定資料列`,
      ],
      ['MES 片語搜尋驗收', '## 其他內容\n\nFOR something UPDATE'],
    ]) {
      const created = await page.request.post('/api/admin/entries', {
        headers,
        data: { kind: 'article', title },
      });
      expect(created.ok(), await created.text()).toBe(true);
      let entry = (await created.json()) as Entry;
      entries.push(entry);
      const saved = await page.request.patch(`/api/admin/entries/${entry.id}`, {
        headers,
        data: {
          version: entry.version,
          content: { ...entry.content, body, category, tags, excerpt: '驗證中文閱讀與搜尋' },
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      entry = (await saved.json()) as Entry;
      expect((await request.get(`/og/article/${entry.content.slug}.png`)).status()).toBe(404);
      const published = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
        headers,
        data: { version: entry.version, action: 'publish' },
      });
      expect(published.ok(), await published.text()).toBe(true);
      entries[entries.length - 1] = (await published.json()) as Entry;
    }
    const article = entries[0];
    const list = `/articles?category=${encodeURIComponent(category)}`;
    await page.goto(`${list}&q=${encodeURIComponent('MES 併發')}`);
    await expect(page.locator('.article-list h2')).toHaveCount(1);
    await page.goto(`${list}&q=${encodeURIComponent('MES "FOR UPDATE"')}`);
    await expect(page.locator('.article-list h2')).toHaveCount(1);
    await page.goto(`${list}&q=${encodeURIComponent('MES FOR UPDATE')}`);
    await expect(page.locator('.article-list h2')).toHaveCount(2);
    const card = page
      .locator('.journal-entry')
      .filter({ has: page.getByRole('link', { name: article.content.title, exact: true }) });
    const listMinutes = (await card.locator('.journal-entry-meta').innerText()).match(
      /(\d+) min read/,
    )?.[1];
    expect(listMinutes).toBeTruthy();
    await page.goto(`/articles/${article.content.slug}`);
    await expect(page.locator('.article-prose')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('#article-title')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('.article-outline [data-toc-target][lang="zh-Hant"]')).toHaveCount(2);
    await expect(page.locator('.article-heading .entry-meta')).toContainText(
      `${listMinutes} min read`,
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'zh_TW');
    const data = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) || '{}',
    );
    expect(data).toMatchObject({
      '@type': 'BlogPosting',
      inLanguage: 'zh-Hant',
      headline: article.content.title,
      datePublished: article.publishedAt,
    });
    await page.getByRole('button', { name: '繁體中文', exact: true }).click();
    await expect(page.locator('.article-prose')).toHaveAttribute('lang', 'zh-Hant');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('.article-prose')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('.article-outline [data-toc-target][lang="zh-Hant"]')).toHaveCount(2);

    const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(imageUrl).toContain(`/og/article/${article.content.slug}.png`);
    const png = await request.get(imageUrl!);
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toBe('image/png');
    expect(await sharp(await png.body()).metadata()).toMatchObject({
      width: 1200,
      height: 630,
      format: 'png',
    });
    await testInfo.attach('文章分享圖片', { body: await png.body(), contentType: 'image/png' });
    const draft = await page.request.patch(`/api/admin/entries/${article.id}`, {
      headers,
      data: {
        version: article.version,
        content: {
          ...article.content,
          title: '尚未公開的私密標題',
          slug: `${article.content.slug}-renamed`,
        },
      },
    });
    expect(draft.ok(), await draft.text()).toBe(true);
    const stillPublic = await request.get(imageUrl!);
    expect(stillPublic.headers().etag).toBe(png.headers().etag);
    const privateDraft = (await draft.json()) as Entry;
    const newImageUrl = `/og/article/${privateDraft.content.slug}.png`;
    expect((await request.get(newImageUrl)).status()).toBe(404);
    const renamed = await page.request.post(`/api/admin/entries/${article.id}/action`, {
      headers,
      data: { version: privateDraft.version, action: 'publish' },
    });
    expect(renamed.ok(), await renamed.text()).toBe(true);
    const oldImage = await request.get(imageUrl!, {
      maxRedirects: 0,
      headers: { 'If-None-Match': png.headers().etag },
    });
    expect(oldImage.status()).toBe(301);
    expect(oldImage.headers().location).toBe(newImageUrl);
    expect(oldImage.headers()['cache-control']).toBe('no-store');
    expect((await request.get(imageUrl!)).status()).toBe(200);
    const unpublish = await page.request.post(`/api/admin/entries/${article.id}/action`, {
      headers,
      data: { version: (await renamed.json()).version, action: 'unpublish' },
    });
    expect(unpublish.ok(), await unpublish.text()).toBe(true);
    expect(
      (await request.get(imageUrl!, { headers: { 'If-None-Match': png.headers().etag } })).status(),
    ).toBe(404);
    expect((await request.get(newImageUrl)).status()).toBe(404);

    const noJs = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
    try {
      const mobile = await noJs.newPage();
      for (const theme of ['light', 'dark'] as const) {
        await mobile.emulateMedia({ colorScheme: theme });
        for (const width of [375, 768, 1440]) {
          await mobile.setViewportSize({ width, height: 812 });
          await mobile.goto(list);
          const details = mobile.locator('details.tag-cloud');
          const noOverflow = async () =>
            expect(
              await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              `${theme} ${width}px 標籤篩選不得撐破版面`,
            ).toBe(true);
          await expect(details).not.toHaveAttribute('open', '');
          await expect(details.locator('div')).toBeHidden();
          // 全尺寸使用相同的收合入口，分類數量不應改變其操作方式
          const closed = (await details.boundingBox())!;
          const summary = (await details.locator('summary').boundingBox())!;
          expect(closed.height).toBeCloseTo(summary.height, 0);
          await noOverflow();
          for (const tag of ['quality-1', longEnglishTag, longChineseTag]) {
            await details.locator('summary').focus();
            await mobile.keyboard.press('Enter');
            await expect(details).toHaveAttribute('open', '');
            await noOverflow();
            for (const value of [longEnglishTag, longChineseTag]) {
              const link = details.getByRole('link', { name: `#${value}`, exact: true });
              await expect(link).toBeVisible();
              const box = (await link.boundingBox())!;
              expect(box.x).toBeGreaterThanOrEqual(0);
              expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            }
            await details.getByRole('link', { name: `#${tag}`, exact: true }).click();
            await expect(mobile.locator('[data-filter-chip="tag"]')).toContainText(`#${tag}`);
            await expect(mobile.locator('[data-filter-chip="tag"]')).toBeVisible();
            await expect(details).not.toHaveAttribute('open', '');
            await expect(details.locator('div')).toBeHidden();
            await noOverflow();
          }
          await testInfo.attach(`標籤篩選-${theme}-${width}`, {
            body: await mobile.screenshot(),
            contentType: 'image/png',
          });
        }
      }
    } finally {
      await noJs.close();
    }
  } finally {
    for (const entry of entries) {
      const response = await page.request.get(`/api/admin/entries/${entry.id}`);
      if (!response.ok()) continue;
      const current = (await response.json()) as Entry;
      if (!current.deletedAt) {
        const removed = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
          headers,
          data: { action: 'trash', version: current.version },
        });
        expect(removed.ok(), await removed.text()).toBe(true);
      }
    }
  }
});
