import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Entry, EntryRevision } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

test('發布檢查、系列、封面焦點與歷史還原保留私人草稿', async ({ page, baseURL, request }) => {
  const headers = { Origin: baseURL! };
  if (process.env.CAPTURE_EDITOR) await mkdir('.local/features-screenshots', { recursive: true });
  await signInForFixture(page.request, baseURL!);
  const created = await page.request.post('/api/admin/entries', {
    headers,
    data: { kind: 'article', title: 'History original' },
  });
  let entry = (await created.json()) as Entry;
  const save = await page.request.patch(`/api/admin/entries/${entry.id}`, {
    headers,
    data: {
      version: entry.version,
      content: {
        ...entry.content,
        title: 'History original',
        body: 'Original published text',
        excerpt: 'Original summary',
        cover: '/images/cover-grid.svg',
        coverAlt: 'A grid',
      },
    },
  });
  entry = (await save.json()) as Entry;
  const published = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
    headers,
    data: { action: 'publish', version: entry.version },
  });
  expect(published.ok(), await published.text()).toBe(true);
  entry = (await published.json()) as Entry;
  const publicPath = `/articles/${entry.content.slug}`;
  const history = (await (await page.request.get(`/api/admin/history/${entry.id}`)).json()) as {
    items: EntryRevision[];
  };
  const original = history.items.find((revision) => revision.source === 'published')!;
  try {
    await page.goto(`/admin/articles/${entry.id}`);
    if (process.env.CAPTURE_EDITOR)
      await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
    await page.getByLabel('Article title').fill('Updated public title');
    await page.getByLabel('Summary', { exact: true }).fill('');
    await page
      .locator('.cm-content')
      .fill(
        'Updated text\n\n![](/images/cover-grid.svg)\n\n[Missing](/articles/missing-editor-review)',
      );
    await page
      .locator('summary')
      .filter({ hasText: /^Article series$/ })
      .click();
    await page.getByLabel('Series name').fill('Docker notes');
    await page.getByLabel('Position in series').fill('2');
    await page
      .locator('summary')
      .filter({ hasText: /^Cover crop focus$/ })
      .click();
    await page.getByLabel(/Horizontal focus/).press('End');
    await page.getByLabel(/Horizontal focus/).press('ArrowLeft');
    await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review before publishing' });
    await expect(review).toBeVisible();
    await expect(
      review.getByText('Add a summary for content cards and search results'),
    ).toBeVisible();
    await expect(review.getByText('1 body image has no alternative text')).toBeVisible();
    await expect(
      review.getByText('No published content at /articles/missing-editor-review'),
    ).toBeVisible();
    expect(await (await request.get(publicPath)).text()).not.toContain('Updated public title');
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await expect(review.getByRole('button', { name: 'Confirm publication' })).toBeVisible();
        if (process.env.CAPTURE_EDITOR && width !== 768)
          await page.screenshot({
            animations: 'disabled',
            path: `.local/features-screenshots/review-${theme}-${width}.png`,
          });
      }
    }
    await page.keyboard.press('Escape');
    await expect(review).toBeHidden();
    await expect(page.getByRole('button', { name: 'Publish changes', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm publication' }).click();
    await expect(
      page.getByText('Published. Readers can now see this version on your website.'),
    ).toBeVisible();
    expect(await (await request.get(publicPath)).text()).toContain('Updated public title');
    await page.getByLabel('Article title').fill('My saved work before restore');
    await page.getByRole('button', { name: 'Version history', exact: true }).click();
    const historyDialog = page.getByRole('dialog', { name: 'Version history' });
    await expect(historyDialog).toBeVisible();
    const beforeRestore = (await (
      await page.request.get(`/api/admin/entries/${entry.id}`)
    ).json()) as Entry;
    expect(beforeRestore.content.title).toBe('My saved work before restore');
    expect(beforeRestore.content.series).toBe('Docker notes');
    expect(beforeRestore.content.seriesOrder).toBe(2);
    expect(beforeRestore.content.coverPosition?.x).toBe(99);
    await page.getByLabel('Saved version').selectOption(original.id);
    await expect(
      historyDialog.getByText('Comparison: current draft → selected version'),
    ).toBeVisible();
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1440]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (process.env.CAPTURE_EDITOR && width !== 768)
          await page.screenshot({
            animations: 'disabled',
            path: `.local/features-screenshots/history-${theme}-${width}.png`,
          });
      }
    }
    await historyDialog.getByRole('button', { name: 'Restore as draft' }).click();
    await expect(historyDialog).toBeHidden();
    await expect(page.getByLabel('Article title')).toHaveValue('History original');
    const final = (await (
      await page.request.get(`/api/admin/entries/${entry.id}`)
    ).json()) as Entry;
    expect(final.published?.title).toBe('Updated public title');
    expect(final.content.title).toBe('History original');
    const finalHistory = (await (
      await page.request.get(`/api/admin/history/${entry.id}`)
    ).json()) as { items: EntryRevision[] };
    expect(
      finalHistory.items.some(
        (revision) => revision.content.title === 'My saved work before restore',
      ),
    ).toBe(true);
    expect((await request.get(`/api/admin/history/${entry.id}`)).status()).toBe(401);
    expect(
      (
        await request.post(`/api/admin/entries/${entry.id}/checks`, {
          headers,
          data: { version: final.version },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post(`/api/admin/entries/${entry.id}/checks`, {
          headers,
          data: { version: entry.version },
        })
      ).status(),
    ).toBe(409);
  } finally {
    const latest = (await (
      await page.request.get(`/api/admin/entries/${entry.id}`)
    ).json()) as Entry;
    await page.request.post(`/api/admin/entries/${entry.id}/action`, {
      headers,
      data: { action: 'trash', version: latest.version },
    });
  }
});
