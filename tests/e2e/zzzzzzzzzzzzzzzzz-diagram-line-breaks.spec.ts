import { test, expect, type APIRequestContext, type Locator } from '@playwright/test';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';
import { diagramFence, guidFlowchart, lineBreakDiagrams } from '../fixtures/diagram-line-breaks';

const prefix = `換行圖表驗收-${Date.now()}`;

async function current(request: APIRequestContext, id: string): Promise<Entry> {
  const response = await request.get(`/api/admin/entries/${id}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function fixture(request: APIRequestContext, origin: string, body: string): Promise<Entry> {
  const headers = { Origin: origin };
  const created = await request.post('/api/admin/entries', {
    headers, data: { kind: 'article', title: prefix },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const entry = (await created.json()) as Entry;
  const saved = await request.patch(`/api/admin/entries/${entry.id}`, {
    headers,
    data: { version: entry.version, content: { ...entry.content, excerpt: '換行相容性驗收', body } },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return saved.json();
}

async function trash(request: APIRequestContext, origin: string, id: string) {
  const entry = await current(request, id);
  expect(entry.content.title).toBe(prefix);
  const response = await request.post(`/api/admin/entries/${id}/action`, {
    headers: { Origin: origin }, data: { action: 'trash', version: entry.version },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function ready(figure: Locator) {
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute('data-diagram-state', 'ready', { timeout: 30000 });
  await expect(figure.locator('[data-diagram-canvas] svg')).toBeVisible();
  await expect(figure.locator('[data-diagram-status]')).toBeEmpty();
  await expect(figure.locator('svg foreignObject, svg image, svg script, svg a, svg [onload], svg [onclick]')).toHaveCount(0);
}

async function expectGuidLineBreaks(figure: Locator) {
  for (const instance of ['A', 'B', 'C']) {
    const node = figure.locator('svg .node').filter({ hasText: `MES Instance ${instance}` });
    await expect(node).toHaveCount(1);
    await expect(node).toContainText('Guid.NewGuid');
    // Assert actual SVG line layout, not just an error-free render or two joined strings.
    const rows = await node.evaluate((element, label) => {
      const spans = Array.from(element.querySelectorAll('tspan'));
      return [label, 'Guid.NewGuid'].map((text) =>
        spans.find((span) => span.textContent === text)?.getBBox().y ?? null,
      );
    }, `MES Instance ${instance}`);
    expect(rows[0]).not.toBeNull();
    expect(rows[1]).not.toBeNull();
    expect(rows[1]!).toBeGreaterThan(rows[0]!);
  }
}

test('既有 br 換行原文可預覽及發布，手機明暗與無 JavaScript 均保留內容', async ({
  page, request, browser, baseURL,
}) => {
  await signInForFixture(page.request, baseURL!);
  const body = lineBreakDiagrams.map(diagramFence).join('\n\n');
  const entry = await fixture(page.request, baseURL!, body);
  const path = `/articles/${entry.content.slug}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`/admin/articles/${entry.id}`);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Content preview', exact: true });
    const previews = preview.locator('[data-markdown-diagram]');
    await expect(previews).toHaveCount(lineBreakDiagrams.length);
    for (const figure of await previews.all()) await ready(figure);
    await expectGuidLineBreaks(previews.first());
    expect((await request.get(path)).status()).toBe(404);
    expect((await current(page.request, entry.id)).content.body).toBe(body);

    await page.getByRole('button', { name: 'Publish content', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
    await expect.poll(async () => (await current(page.request, entry.id)).published?.body).toBe(body);
    const published = await current(page.request, entry.id);
    await page.goto(path);
    const figures = page.locator('.article-prose [data-markdown-diagram]');
    await expect(figures).toHaveCount(lineBreakDiagrams.length);
    for (const figure of await figures.all()) await ready(figure);

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        const oldTheme = await page.locator('html').getAttribute('data-theme');
        const previousId = await figures.first().locator('svg').getAttribute('id');
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        if (oldTheme !== theme)
          await expect(figures.first().locator('svg')).not.toHaveAttribute('id', previousId!);
        for (const figure of await figures.all()) await ready(figure);
        await expectGuidLineBreaks(figures.first());
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
    }
    await figures.first().locator('summary').click();
    await expect(figures.first().locator('[data-diagram-source] code')).toContainText(guidFlowchart);
    expect(await current(page.request, entry.id)).toEqual(published);
    expect(errors).toEqual([]);

    const plainContext = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const plain = await plainContext.newPage();
      await plain.goto(path);
      const figure = plain.locator('.article-prose [data-markdown-diagram]').first();
      await expect(figure.locator('details')).toHaveAttribute('open', '');
      await expect(figure.locator('[data-diagram-source] code')).toContainText(guidFlowchart);
      await expect(figure.locator('[data-diagram-source] br')).toHaveCount(0);
    } finally {
      await plainContext.close();
    }
  } finally {
    await trash(page.request, baseURL!, entry.id);
  }
});

test('br 例外不放行 HTML 屬性或腳本，壞圖表不影響下一張合法圖表', async ({ page, baseURL }) => {
  await signInForFixture(page.request, baseURL!);
  const sources = [
    'flowchart TB\n A[<br onclick="window.__breakAttack=1">] --> B',
    'flowchart TB\n A[<br style="background:url(https://example.invalid/break)">] --> B',
    'flowchart TB\n A[<br/><img src="https://example.invalid/break" onerror="window.__breakAttack=1">] --> B',
    'flowchart TB\n A[unclosed<br/>label',
    guidFlowchart,
  ];
  const entry = await fixture(page.request, baseURL!, sources.map(diagramFence).join('\n\n'));
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) external.push(request.url());
  });
  await page.addInitScript(() => { Object.assign(window, { __breakAttack: 0 }); });
  try {
    const published = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
      headers: { Origin: baseURL! }, data: { action: 'publish', version: entry.version },
    });
    expect(published.ok(), await published.text()).toBe(true);
    await page.goto(`/articles/${entry.content.slug}`);
    const figures = page.locator('.article-prose [data-markdown-diagram]');
    await expect(figures).toHaveCount(sources.length);
    for (let index = 0; index < sources.length - 1; index++) {
      const figure = figures.nth(index);
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toHaveAttribute('data-diagram-state', 'error');
      await expect(figure.locator('[data-diagram-canvas]')).toBeHidden();
      await expect(figure.locator('[data-diagram-source] code')).toContainText(sources[index]);
      await expect(figure.locator('script, img, foreignObject, a[href]')).toHaveCount(0);
    }
    await ready(figures.last());
    await expectGuidLineBreaks(figures.last());
    expect(await page.evaluate(() => (window as unknown as { __breakAttack: number }).__breakAttack)).toBe(0);
    expect(external).toEqual([]);
  } finally {
    await trash(page.request, baseURL!, entry.id);
  }
});
