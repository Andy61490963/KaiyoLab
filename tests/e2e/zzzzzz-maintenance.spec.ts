import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Entry, Media } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

test('系統狀態、批次重試與匯入預覽沿用後台並保護公開內容', async ({ page, request, baseURL }) => {
  const headers = { Origin: baseURL! };
  await signInForFixture(page.request, baseURL!);
  for (const route of ['/api/admin/system', '/api/admin/transfer'])
    expect((await request.get(route)).status()).toBe(401);
  const originalEntries = new Set<string>();
  const originalMedia = new Set<string>();
  async function items<T extends { id: string }>(resource: string): Promise<T[]> {
    const rows: T[] = [];
    let pageNumber = 1;
    for (;;) {
      const response = await page.request.get(
        `/api/admin/${resource}?pageSize=100&page=${pageNumber}`,
      );
      expect(response.ok()).toBe(true);
      const data = await response.json();
      rows.push(...data.items);
      if (data.page * data.pageSize >= data.total) return rows;
      pageNumber++;
    }
  }
  for (const row of await items<Entry>('entries')) originalEntries.add(row.id);
  for (const row of await items<Media>('media')) originalMedia.add(row.id);
  if (process.env.CAPTURE_MAINTENANCE)
    await mkdir('.local/features-screenshots', { recursive: true });
  try {
    await page.goto('/admin/system');
    if (process.env.CAPTURE_MAINTENANCE)
      await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
    await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
    await expect(page.getByText(/^Connected ·/)).toBeVisible();
    await expect(page.getByText('Writable', { exact: true })).toBeVisible();
    const report = await (await page.request.get('/api/admin/system')).json();
    expect(report.database.available).toBe(true);
    expect(report.storage.writable).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/postgresql:|BETTER_AUTH_SECRET|UPLOAD_DIR/);
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await expect(page.getByRole('button', { name: 'Refresh status' })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (process.env.CAPTURE_MAINTENANCE && width !== 768)
          await page.screenshot({
            animations: 'disabled',
            path: `.local/features-screenshots/system-${theme}-${width}.png`,
          });
      }
    }
    await page.goto('/admin/media');
    let failed = false;
    await page.route('**/api/admin/media', async (route) => {
      if (route.request().method() === 'POST' && !failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary test outage' }),
        });
      }
      await route.continue();
    });
    const image = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#824053' },
    })
      .png()
      .toBuffer();
    await page.getByLabel('Upload image file').setInputFiles([
      { name: 'batch-first.png', mimeType: 'image/png', buffer: image },
      { name: 'batch-second.png', mimeType: 'image/png', buffer: image },
    ]);
    const queue = page.getByRole('region', { name: 'Upload progress' });
    await expect(queue.getByText('Temporary test outage')).toBeVisible();
    await expect(queue.getByText('1 / 2 complete')).toBeVisible();
    await page.getByRole('button', { name: 'Retry failed uploads' }).click();
    await expect(queue.getByText('1 / 1 complete')).toBeVisible();
    await page.unroute('**/api/admin/media');
    const uploaded = (await items<Media>('media')).filter((row) => !originalMedia.has(row.id));
    expect(uploaded).toHaveLength(2);
    const created = await page.request.post('/api/admin/entries', {
      headers,
      data: { kind: 'article', title: 'Transfer fixture' },
    });
    let fixture = (await created.json()) as Entry;
    const saved = await page.request.patch(`/api/admin/entries/${fixture.id}`, {
      headers,
      data: {
        version: fixture.version,
        content: {
          ...fixture.content,
          body: `Private transfer text\n\n![A cover](${uploaded[0].url})`,
          cover: uploaded[0].url,
          coverAlt: 'A cover',
        },
      },
    });
    expect(saved.ok()).toBe(true);
    fixture = await saved.json();
    const publicBefore = await (await request.get('/rss.xml')).text();
    await page.goto('/admin/transfer');
    if (process.env.CAPTURE_MAINTENANCE)
      await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download archive' }).click(),
    ]);
    const archive = await readFile((await download.path())!);
    await page
      .getByLabel('KaiyoLab archive')
      .setInputFiles({ name: 'site.kaiyo.json.gz', mimeType: 'application/gzip', buffer: archive });
    await expect(
      page.getByLabel('Also apply site settings and About me content'),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Check archive' }).click();
    await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
    await expect(page.getByText('Current site settings and About me will be kept.')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (process.env.CAPTURE_MAINTENANCE && width !== 768) {
          await page.getByRole('heading', { name: 'Review import' }).scrollIntoViewIfNeeded();
          await page.screenshot({
            animations: 'disabled',
            path: `.local/features-screenshots/transfer-${theme}-${width}.png`,
          });
        }
      }
    }
    await page.getByRole('button', { name: 'Import as private drafts' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Imported/ })).toBeVisible();
    expect(await (await request.get('/rss.xml')).text()).toBe(publicBefore);
    const imported = (await items<Entry>('entries')).filter(
      (row) => !originalEntries.has(row.id) && row.id !== fixture.id,
    );
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.every((row) => !row.published)).toBe(true);
    const copied = imported.find((row) => row.content.title === 'Transfer fixture')!;
    expect(copied.content.cover).not.toBe(fixture.content.cover);
    expect((await request.get(copied.content.cover)).status()).toBe(404);
    expect((await page.request.get(copied.content.cover)).status()).toBe(200);
  } finally {
    await page.unroute('**/api/admin/media');
    for (const row of (await items<Entry>('entries')).filter(
      (row) => !originalEntries.has(row.id),
    )) {
      await page.request.post(`/api/admin/entries/${row.id}/action`, {
        headers,
        data: { action: 'trash', version: row.version },
      });
    }
    // 垃圾桶與歷史版本仍需要的圖片由保護規則保留，整個測試資料庫在 CI 結束後清理
    for (const row of (await items<Media>('media')).filter(
      (row) => !originalMedia.has(row.id) && !row.usedBy.length,
    ))
      await page.request.delete(`/api/admin/media/${row.id}`, { headers });
  }
});
