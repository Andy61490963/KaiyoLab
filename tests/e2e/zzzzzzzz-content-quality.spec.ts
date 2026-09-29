import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { defaultSettings } from '../../src/lib/defaults';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

test('發布提示與搬移連結預覽保持可讀，匯入連回新草稿', async ({ page, request, baseURL }) => {
  await signInForFixture(page.request, baseURL!);
  const headers = { Origin: baseURL! };
  const created = await page.request.post('/api/admin/entries', {
    headers,
    data: { kind: 'article', title: '內容品質驗收' },
  });
  expect(created.ok()).toBe(true);
  let entry = (await created.json()) as Entry;
  const cleanup = [entry.id];
  try {
    const saved = await page.request.patch(`/api/admin/entries/${entry.id}`, {
      headers,
      data: {
        version: entry.version,
        content: {
          ...entry.content,
          excerpt: '錨點與圖表檢查',
          body: '## 工單完成\n\n[正確](#section-工單完成) [失效](#section-不存在)\n\n```mermaid\nflowchart TD\nA[未結束\n```',
        },
      },
    });
    expect(saved.ok()).toBe(true);
    entry = await saved.json();
    await page.goto(`/admin/articles/${entry.id}`);
    const publish = page.getByRole('button', { name: 'Publish content', exact: true });
    await expect(publish).toBeVisible();
    await publish.click();
    const dialog = page.getByRole('dialog', { name: 'Review before publishing' });
    await expect(dialog.getByText(/找不到章節錨點：.*#section-不存在/)).toBeVisible();
    await expect(dialog.getByText(/Mermaid 圖表語法錯誤/)).toBeVisible();
    await expect(dialog.getByText('These suggestions do not block publishing')).toBeVisible();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect((await request.get(`/articles/${entry.content.slug}`)).status()).toBe(404);
    const { siteUrl: _siteUrl, ...settings } = defaultSettings;
    const oldPath = `/articles/${entry.content.slug}`;
    const archive = gzipSync(
      JSON.stringify({
        format: 'kaiyolab-content',
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceOrigin: new URL(baseURL!).origin,
        settings: { ...settings, homeIntro: '# 內容品質驗收' },
        aliases: [],
        taxonomies: [],
        media: [],
        revisions: [],
        entries: [
          {
            id: entry.id,
            kind: 'article',
            content: {
              ...entry.content,
              body: `## 工單完成\n\n[工單](${oldPath}?from=archive#section-工單完成)\n\n\`[範例](${oldPath})\``,
            },
            published: null,
            publishedAt: null,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
      }),
    );
    await page.goto('/admin/transfer');
    await page.getByLabel('KaiyoLab archive').setInputFiles({
      name: 'quality.kaiyo.json.gz',
      mimeType: 'application/gzip',
      buffer: archive,
    });
    const [preview] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes('/api/admin/transfer?action=preview'),
      ),
      page.getByRole('button', { name: 'Check archive' }).click(),
    ]);
    expect(preview.ok(), await preview.text()).toBe(true);
    await expect(page.getByRole('heading', { name: '站內連結調整' })).toBeVisible();
    const adjustments = page.locator('.transfer-adjustments').filter({ hasText: '封存檔連結' });
    await expect(adjustments).toContainText(`${oldPath}-import-1?from=archive#section-`);
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      }
    }
    const [response] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes('/api/admin/transfer?action=import'),
      ),
      page.getByRole('button', { name: 'Import as private drafts' }).click(),
    ]);
    expect(response.ok()).toBe(true);
    const imported = await response.json();
    cleanup.push(...imported.entryIds);
    await expect(page.getByRole('status').filter({ hasText: /^Imported/ })).toBeVisible();
    const copied = (await (
      await page.request.get(`/api/admin/entries/${imported.entryIds[0]}`)
    ).json()) as Entry;
    expect(copied.content.body).toContain(`/articles/${copied.content.slug}?from=archive#section-`);
    expect(copied.content.body).toContain(`\`[範例](${oldPath})\``);
    expect(copied.published).toBeNull();
    expect((await request.get(`/articles/${copied.content.slug}`)).status()).toBe(404);
  } finally {
    for (const id of cleanup) {
      const current = (await (await page.request.get(`/api/admin/entries/${id}`)).json()) as Entry;
      await page.request.post(`/api/admin/entries/${id}/action`, {
        headers,
        data: { action: 'trash', version: current.version },
      });
    }
  }
});
