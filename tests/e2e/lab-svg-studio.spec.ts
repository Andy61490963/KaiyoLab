import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openStudio(page: Page) {
  await page.goto('/lab/svg-studio');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('[data-svg-studio]')).toBeVisible();
  await page.locator('[data-lab-advanced] > summary').click();
  await expect(page.locator('[data-lab-advanced]')).toHaveAttribute('open');
}

test('SVG 節點可用鍵盤精調、重現種子並產生連續的中間形狀', async ({ page }) => {
  await openStudio(page);
  const shape = page.locator('[data-svg-shape]');
  const original = await shape.getAttribute('d');
  const node = page.locator('[data-svg-node="0"]');
  await node.focus();
  const x = page.getByRole('spinbutton', { name: 'Node X coordinate', exact: true });
  await expect(x).toHaveValue('300');
  await node.press('ArrowRight');
  await expect(x).toHaveValue('301');
  await node.press('Shift+ArrowRight');
  await expect(x).toHaveValue('311');
  expect(await shape.getAttribute('d')).not.toBe(original);
  await page.getByRole('button', { name: 'Regenerate current shape', exact: true }).click();
  await expect(shape).toHaveAttribute('d', original!);
  await page.getByRole('button', { name: 'Edit shape B', exact: true }).click();
  const target = await shape.getAttribute('d');
  expect(target).not.toBe(original);
  const progress = page.getByRole('slider', { name: 'Morph progress', exact: true });
  await progress.fill('50');
  expect(await shape.getAttribute('d')).not.toBe(target);
  expect(await shape.getAttribute('d')).not.toBe(original);
  await expect(x).toBeDisabled();
  await expect(page.locator('[data-svg-node]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit shape A', exact: true }).click();
  await expect(shape).toHaveAttribute('d', original!);
  await page.getByRole('slider', { name: 'Nodes', exact: true }).fill('12');
  await expect(page.locator('[data-svg-node]')).toHaveCount(12);
  await page.getByRole('slider', { name: 'Irregularity', exact: true }).fill('0');
  const regular = await shape.getAttribute('d');
  await page.getByRole('button', { name: 'Edit shape B', exact: true }).click();
  await expect(shape).toHaveAttribute('d', regular!);
});

test('SVG 拖拉會更新路徑、Esc 還原，下載檔案與預覽完全相同', async ({ page }) => {
  await openStudio(page);
  const shape = page.locator('[data-svg-shape]');
  const node = page.locator('[data-svg-node="0"] .svg-studio-node');
  await node.scrollIntoViewIfNeeded();
  const original = await shape.getAttribute('d');
  const bounds = (await node.boundingBox())!;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 35, center.y + 25, { steps: 5 });
  expect(await shape.getAttribute('d')).not.toBe(original);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(shape).toHaveAttribute('d', original!);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 30, center.y + 25, { steps: 5 });
  await page.mouse.up();
  expect(await shape.getAttribute('d')).not.toBe(original);
  const source = await page.getByRole('textbox', { name: 'SVG source', exact: true }).inputValue();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('kaiyo-shape.svg');
  expect(await readFile((await download.path())!, 'utf8')).toBe(source);
  const validation = await page.evaluate((svg) => {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return {
      error: !!document.querySelector('parsererror'),
      count: document.querySelectorAll('path').length,
      namespace: document.documentElement.namespaceURI,
    };
  }, source);
  expect(validation).toEqual({ error: false, count: 1, namespace: 'http://www.w3.org/2000/svg' });
  await expect(page.locator('.svg-studio-feedback')).toHaveText('SVG download prepared');
});

test('SVG 變形可暫停，減少動態使用手動進度，複製失敗有退路', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openStudio(page);
  const shape = page.locator('[data-svg-shape]');
  const original = await shape.getAttribute('d');
  await page.getByRole('button', { name: 'Play morph', exact: true }).click();
  await expect(shape).not.toHaveAttribute('d', original!);
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Pause morph', exact: true }).click();
  const paused = await shape.getAttribute('d');
  await page.waitForTimeout(150);
  await expect(shape).toHaveAttribute('d', paused!);
  await page.getByRole('button', { name: 'Copy SVG', exact: true }).click();
  await expect(page.locator('.svg-studio-feedback')).toContainText('Clipboard access was denied');
  await expect(page.getByRole('textbox', { name: 'SVG source', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play morph', exact: true })).toBeDisabled();
  await page.getByRole('slider', { name: 'Morph progress', exact: true }).fill('75');
  await expect(page.locator('[data-svg-blend]')).toHaveText('75%');
});

test('SVG 工具在明暗、中英與各螢幕尺寸無水平溢出且可複製有效原碼', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openStudio(page);
  await page.getByRole('button', { name: 'Copy SVG', exact: true }).click();
  await expect(page.locator('.svg-studio-feedback')).toHaveText('SVG copied');
  // Windows 原生剪貼簿會將 LF 轉成 CRLF，僅正規化換行，仍逐字驗證實際內容
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const source = await page.getByRole('textbox', { name: 'SVG source', exact: true }).inputValue();
  expect(clipboard.replace(/\r\n/g, '\n')).toBe(source.replace(/\r\n/g, '\n'));
  for (const width of [1920, 1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Edit shape A', exact: true })).toBeVisible();
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('button', { name: '編輯形狀 A', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: '節點 X 座標', exact: true }).fill('330');
  await expect(page.getByRole('spinbutton', { name: '節點 X 座標', exact: true })).toHaveValue(
    '330',
  );
});

test('SVG 手機觸控拖拉節點不捲動畫布，座標欄仍可做精確編輯', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await openStudio(page);
    const node = page.locator('[data-svg-node="0"] .svg-studio-node');
    await node.scrollIntoViewIfNeeded();
    const box = (await node.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const scrollY = await page.evaluate(() => window.scrollY);
    const before = await page.locator('[data-svg-shape]').getAttribute('d');
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 30, y: y + 20 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-svg-shape]')).not.toHaveAttribute('d', before!);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await page.getByRole('spinbutton', { name: 'Node X coordinate', exact: true }).fill('345');
    await expect(
      page.getByRole('spinbutton', { name: 'Node X coordinate', exact: true }),
    ).toHaveValue('345');
    await session.detach();
  } finally {
    await context.close();
  }
});

test('SVG 回程暫停與離屏後繼續播放，方向不會被重設', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openStudio(page);
  const progress = page.getByRole('slider', { name: 'Morph progress', exact: true });
  const amount = async () => Number(await progress.inputValue());
  await page.getByRole('button', { name: 'Edit shape B', exact: true }).click();
  await page.getByRole('button', { name: 'Play morph', exact: true }).click();
  await expect.poll(amount, { timeout: 2000 }).toBeLessThan(85);
  await page.getByRole('button', { name: 'Pause morph', exact: true }).click();
  const paused = await amount();
  await page.getByRole('button', { name: 'Play morph', exact: true }).click();
  await expect.poll(amount, { timeout: 1000 }).toBeLessThan(paused - 5);
  await page.getByRole('button', { name: 'Pause morph', exact: true }).click();

  await page.getByRole('button', { name: 'Edit shape B', exact: true }).click();
  await page.getByRole('button', { name: 'Play morph', exact: true }).click();
  await expect.poll(amount, { timeout: 2000 }).toBeLessThan(85);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(
      async () =>
        (await page.locator('.svg-studio-canvas').boundingBox())!.y +
        (await page.locator('.svg-studio-canvas').boundingBox())!.height,
    )
    .toBeLessThan(0);
  await page.waitForTimeout(100);
  const offscreen = await amount();
  await page.waitForTimeout(120);
  expect(await amount()).toBe(offscreen);
  await page.locator('.svg-studio-canvas').scrollIntoViewIfNeeded();
  await expect.poll(amount, { timeout: 1000 }).toBeLessThan(offscreen - 5);
  await page.getByRole('button', { name: 'Pause morph', exact: true }).click();
});

test('SVG 第二根手指不會搶走或結束目前節點拖曳', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await openStudio(page);
    const first = page.locator('[data-svg-node="0"]');
    const second = page.locator('[data-svg-node="2"]');
    await page.locator('.svg-studio-canvas').scrollIntoViewIfNeeded();
    const a = (await first.locator('.svg-studio-node').boundingBox())!;
    const b = (await second.locator('.svg-studio-node').boundingBox())!;
    const firstPoint = { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 1 };
    const secondPoint = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 };
    const originalSecond = await second.getAttribute('transform');
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [firstPoint],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...firstPoint, x: firstPoint.x + 10 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...firstPoint, x: firstPoint.x + 10 }, secondPoint],
    });
    const before = await first.getAttribute('transform');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { ...firstPoint, x: firstPoint.x + 20 },
        { ...secondPoint, x: secondPoint.x - 15 },
      ],
    });
    await expect(first).not.toHaveAttribute('transform', before!);
    await expect(second).toHaveAttribute('transform', originalSecond!);
    // CDP touchEnd 列出要放開的接觸點，這裡只抬起第二指，第一指繼續拖曳
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ ...secondPoint, x: secondPoint.x - 15 }],
    });
    const continued = await first.getAttribute('transform');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...firstPoint, x: firstPoint.x + 40 }],
    });
    await expect(first).not.toHaveAttribute('transform', continued!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } finally {
    await context.close();
  }
});

test('SVG 複製請求較晚完成時不覆蓋更新或較新請求的回饋', async ({ page }) => {
  await page.addInitScript(() => {
    const queue: Array<{ resolve: () => void; reject: () => void }> = [];
    Object.defineProperty(window, '__svgCopyQueue', { value: queue });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve, reject) =>
            queue.push({ resolve, reject: () => reject(new Error('denied')) }),
          ),
      },
    });
  });
  await openStudio(page);
  const copy = page.getByRole('button', { name: 'Copy SVG', exact: true });
  const feedback = page.locator('.svg-studio-feedback');
  await copy.click();
  await page.getByRole('button', { name: 'Edit shape B', exact: true }).click();
  await page.getByRole('button', { name: 'Edit shape A', exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { __svgCopyQueue: Array<{ resolve: () => void }> }
    ).__svgCopyQueue[0].resolve(),
  );
  await expect(feedback).not.toHaveText('SVG copied');
  await copy.click();
  await copy.click();
  await page.evaluate(() =>
    (
      window as unknown as { __svgCopyQueue: Array<{ reject: () => void }> }
    ).__svgCopyQueue[2].reject(),
  );
  await expect(feedback).toContainText('Clipboard access was denied');
  await page.evaluate(() =>
    (
      window as unknown as { __svgCopyQueue: Array<{ resolve: () => void }> }
    ).__svgCopyQueue[1].resolve(),
  );
  await expect(feedback).toContainText('Clipboard access was denied');
});
