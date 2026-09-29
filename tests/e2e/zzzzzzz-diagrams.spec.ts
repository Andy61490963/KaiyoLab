import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const flowchart =
  'flowchart TD\n  A[工單下達] --> B{前置條件通過}\n  B -->|是| C[開始作業]\n  B -->|否| D[保留原因並等待處理]';
const sequence =
  'sequenceDiagram\n  participant M as MES\n  participant D as 資料庫\n  M->>D: 比對版本並扣料\n  D-->>M: 已提交';
const fence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``;

async function fixture(request: APIRequestContext, origin: string, body: string) {
  const headers = { Origin: origin };
  const created = await request.post('/api/admin/entries', {
    headers,
    data: { kind: 'article', title: 'MES 圖表驗收' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const entry = (await created.json()) as Entry;
  const saved = await request.patch(`/api/admin/entries/${entry.id}`, {
    headers,
    data: {
      version: entry.version,
      content: { ...entry.content, excerpt: '工單流程與併發控制圖表', body },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return (await saved.json()) as Entry;
}

async function trash(request: APIRequestContext, origin: string, id: string) {
  const current = await request.get(`/api/admin/entries/${id}`);
  expect(current.ok(), await current.text()).toBe(true);
  const entry = (await current.json()) as Entry;
  const removed = await request.post(`/api/admin/entries/${id}/action`, {
    headers: { Origin: origin },
    data: { action: 'trash', version: entry.version },
  });
  expect(removed.ok(), await removed.text()).toBe(true);
}

async function ready(figure: Locator) {
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute('data-diagram-state', 'ready', { timeout: 30000 });
  await expect(figure.locator('[data-diagram-canvas] svg')).toBeVisible();
  await expect(figure.locator('details')).not.toHaveAttribute('open', '');
}

async function setTheme(page: Page, figure: Locator, theme: string) {
  const current = await page.locator('html').getAttribute('data-theme');
  const previousId = await figure.locator('svg').getAttribute('id');
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  if (current !== theme)
    await expect(figure.locator('svg')).not.toHaveAttribute('id', previousId!, { timeout: 30000 });
}

async function keyboardScrollsWideDiagram(figure: Locator) {
  const canvas = figure.locator('[data-diagram-canvas]');
  if (await canvas.evaluate((element) => element.scrollWidth > element.clientWidth + 1)) {
    await canvas.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await canvas.focus();
    await canvas.press('ArrowRight');
    await expect.poll(() => canvas.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await canvas.evaluate((element) => {
      element.scrollLeft = 0;
    });
  }
}

test('中文圖表可在編輯器插入、預覽、發布，明暗與手機版維持可讀', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signInForFixture(page.request, baseURL!);
  const entry = await fixture(
    page.request,
    baseURL!,
    `## 工單流程\n\n${fence(flowchart)}\n\n## 併發寫入\n\n${fence(sequence)}`,
  );
  const publicPath = `/articles/${entry.content.slug}`;
  try {
    expect((await request.get(publicPath)).status()).toBe(404);
    await page.goto(`/admin/articles/${entry.id}`);
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.locator('.cm-content').focus();
    await page.keyboard.press('ControlOrMeta+End');
    await page.getByRole('button', { name: 'Insert flowchart', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('前置條件通過');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Content preview', exact: true });
    const figures = preview.locator('[data-markdown-diagram]');
    await expect(figures).toHaveCount(3);
    for (const figure of await figures.all()) await ready(figure);
    await expect(figures.nth(0).locator('svg')).toContainText('工單下達');
    await expect(figures.nth(1).locator('svg')).toContainText('已提交');

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await figures.first().scrollIntoViewIfNeeded();
        await setTheme(page, figures.first(), theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await expect(figures.first().locator('svg')).toContainText('開始作業');
        await keyboardScrollsWideDiagram(figures.first());
        await page.screenshot({
          path: testInfo.outputPath(`preview-${theme}-${width}.png`),
          animations: 'disabled',
        });
      }
    }
    await page.getByRole('button', { name: 'Publish content', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
    await expect(
      page.getByText('Published. Readers can now see this version on your website.', {
        exact: true,
      }),
    ).toBeVisible();
    const publicResponse = await request.get(publicPath);
    expect(publicResponse.status()).toBe(200);
    expect(await publicResponse.text()).toContain('data-markdown-diagram');
    await page.goto(publicPath);
    const published = page.locator('.article-prose [data-markdown-diagram]');
    await expect(published).toHaveCount(3);
    for (const figure of await published.all()) await ready(figure);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await published.first().scrollIntoViewIfNeeded();
        await setTheme(page, published.first(), theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await expect(published.first().locator('svg')).toContainText('前置條件通過');
        await keyboardScrollsWideDiagram(published.first());
        await expect(published.first().locator('[data-diagram-canvas]')).toHaveAttribute(
          'tabindex',
          '0',
        );
        await page.screenshot({
          path: testInfo.outputPath(`public-${theme}-${width}.png`),
          animations: 'disabled',
        });
      }
    }
    await published.first().locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(published.first().locator('details')).toHaveAttribute('open', '');
    await expect(published.first().locator('code')).toContainText(flowchart);
    expect(errors).toEqual([]);
  } finally {
    await trash(page.request, baseURL!, entry.id);
  }
});

test('惡意設定與語法錯誤安全回退，無 JavaScript 仍可閱讀圖表來源', async ({
  page,
  browser,
  baseURL,
}) => {
  await signInForFixture(page.request, baseURL!);
  const sources = [
    flowchart,
    'flowchart TD\n  A[未關閉的標籤',
    'flowchart TD\n  A-->B\n  click A "javascript:window.__diagramAttack=1"',
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart TD\n  A-->B',
    'flowchart TD\n  A[<img src="https://example.invalid/diagram" onerror="window.__diagramAttack=1">] --> B',
    'flowchart TD; A-->B; click A "https://example.invalid/diagram"',
    'flowchart TD\n  A-->B\n  linkStyle 0 stroke:url(https://example.invalid/diagram.svg)',
  ];
  const entry = await fixture(
    page.request,
    baseURL!,
    sources.map((source, index) => `## 圖表 ${index + 1}\n\n${fence(source)}`).join('\n\n'),
  );
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) external.push(request.url());
  });
  await page.addInitScript(() => {
    (window as unknown as { __diagramAttack: number }).__diagramAttack = 0;
  });
  try {
    const published = await page.request.post(`/api/admin/entries/${entry.id}/action`, {
      headers: { Origin: baseURL! },
      data: { action: 'publish', version: entry.version },
    });
    expect(published.ok(), await published.text()).toBe(true);
    const path = `/articles/${entry.content.slug}`;
    await page.goto(path);
    const figures = page.locator('.article-prose [data-markdown-diagram]');
    await expect(figures).toHaveCount(sources.length);
    await ready(figures.first());
    for (let index = 1; index < sources.length; index++) {
      const figure = figures.nth(index);
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toHaveAttribute('data-diagram-state', 'error');
      await expect(figure.locator('[data-diagram-canvas]')).toBeHidden();
      await expect(figure.locator('[role="status"]')).not.toBeEmpty();
      await expect(figure.locator('details')).toHaveAttribute('open', '');
      await expect(figure.locator('code')).toContainText(sources[index]);
      expect(await figure.locator('script, foreignObject, img, a[href]').count()).toBe(0);
    }
    expect(
      await page.evaluate(() => (window as unknown as { __diagramAttack: number }).__diagramAttack),
    ).toBe(0);
    expect(external).toEqual([]);
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
    try {
      const plain = await context.newPage();
      await plain.goto(path);
      const figure = plain.locator('.article-prose [data-markdown-diagram]').first();
      await expect(figure.locator('details')).toHaveAttribute('open', '');
      await expect(figure.locator('code')).toContainText(flowchart);
      await expect(figure.locator('[data-diagram-canvas]')).toBeHidden();
      expect(
        await plain.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    } finally {
      await context.close();
    }
  } finally {
    await trash(page.request, baseURL!, entry.id);
  }
});

test('替換編輯器預覽會釋放已顯示與尚未顯示圖表的觀察器', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const observed: { kind: 'intersection' | 'resize'; targets: Set<Element> }[] = [];
    const NativeIntersection = window.IntersectionObserver;
    const NativeResize = window.ResizeObserver;
    window.IntersectionObserver = class extends NativeIntersection {
      private targets = new Set<Element>();
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        observed.push({ kind: 'intersection', targets: this.targets });
      }
      observe(target: Element) {
        super.observe(target);
        this.targets.add(target);
      }
      unobserve(target: Element) {
        super.unobserve(target);
        this.targets.delete(target);
      }
      disconnect() {
        super.disconnect();
        this.targets.clear();
      }
    };
    window.ResizeObserver = class extends NativeResize {
      private targets = new Set<Element>();
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        observed.push({ kind: 'resize', targets: this.targets });
      }
      observe(target: Element, options?: ResizeObserverOptions) {
        super.observe(target, options);
        this.targets.add(target);
      }
      unobserve(target: Element) {
        super.unobserve(target);
        this.targets.delete(target);
      }
      disconnect() {
        super.disconnect();
        this.targets.clear();
      }
    };
    Object.assign(window, {
      __diagramObserverCounts: () => {
        const counts = { intersection: 0, resize: 0, detachedIntersection: 0, detachedResize: 0 };
        for (const record of observed) {
          for (const target of record.targets) {
            if (!target.matches('[data-markdown-diagram], [data-diagram-canvas]')) continue;
            counts[record.kind]++;
            if (!target.isConnected)
              counts[record.kind === 'intersection' ? 'detachedIntersection' : 'detachedResize']++;
          }
        }
        return counts;
      },
    });
  });
  const counts = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __diagramObserverCounts: () => {
            intersection: number;
            resize: number;
            detachedIntersection: number;
            detachedResize: number;
          };
        }
      ).__diagramObserverCounts(),
    );
  await signInForFixture(page.request, baseURL!);
  // 第二張圖遠離視窗，涵蓋從未進入 IntersectionObserver 可見集合的清理路徑
  const paragraphs = Array.from(
    { length: 80 },
    (_, index) => `製程檢核 ${index + 1}：確認批次、設備與工單狀態`,
  ).join('\n\n');
  const entry = await fixture(
    page.request,
    baseURL!,
    `${fence(flowchart)}\n\n${paragraphs}\n\n${fence(sequence)}`,
  );
  try {
    await page.goto(`/admin/articles/${entry.id}`);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Content preview', exact: true });
    const figures = preview.locator('[data-markdown-diagram]');
    await expect(figures).toHaveCount(2);
    await ready(figures.first());
    expect(
      await figures
        .last()
        .evaluate((figure) => figure.getBoundingClientRect().top > innerHeight + 400),
    ).toBe(true);
    await expect(figures.last()).not.toHaveAttribute('data-diagram-state', /.+/);
    await expect
      .poll(counts)
      .toEqual({ intersection: 2, resize: 1, detachedIntersection: 0, detachedResize: 0 });
    // 實際修改 Markdown，讓 React 替換整個預覽內容，而非手動解除觀察器
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.locator('.cm-content').fill('## 文字版製程筆記\n\n這個版本已移除兩張流程圖');
    await expect(figures).toHaveCount(0);
    await expect
      .poll(counts)
      .toEqual({ intersection: 0, resize: 0, detachedIntersection: 0, detachedResize: 0 });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  } finally {
    await trash(page.request, baseURL!, entry.id);
  }
});
