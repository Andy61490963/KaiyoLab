import { expect, test, type Page } from '@playwright/test';

async function openStudio(page: Page) {
  await page.goto('/lab/motion-studio');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('[data-motion-studio]')).toBeVisible();
}

test('動畫曲線支援驗證、預設、鍵盤調整、時間軸與可實際執行的 CSS', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStudio(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByLabel('P1 x', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Apply values' }).click();
  await expect(page.getByRole('alert')).toContainText('last valid settings');
  await expect(page.getByLabel('Generated CSS', { exact: true })).toContainText(
    'cubic-bezier(0.25, 0.1, 0.25, 1)',
  );
  await page.getByLabel('P1 x', { exact: true }).fill('0.3');
  await page.getByLabel('Duration (ms)', { exact: true }).fill('1600');
  await page.getByRole('button', { name: 'Apply values' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Control point 1', exact: true }).press('ArrowRight');
  await expect(page.getByLabel('P1 x', { exact: true })).toHaveValue('0.31');
  await page.getByRole('button', { name: 'Overshoot', exact: true }).click();
  const timeline = page.getByRole('slider', { name: 'Timeline', exact: true });
  await timeline.fill('650');
  await expect(page.locator('[data-motion-studio]')).toHaveAttribute('data-progress', '0.6500');
  const output = Number(await page.locator('.motion-readout span output').textContent());
  expect(output).toBeGreaterThan(1);
  // 匯出在獨立頁面驗證，避免被主站的全域減少動態樣式覆蓋
  const css = (await page.getByLabel('Generated CSS', { exact: true }).textContent())!;
  const standalone = await page.context().newPage();
  try {
    await standalone.emulateMedia({ reducedMotion: 'no-preference' });
    await standalone.setContent(
      `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>動畫匯出驗證</title><style>${css}</style></head><body><div class="motion-demo">預覽</div></body></html>`,
    );
    const demo = standalone.locator('.motion-demo');
    await expect.poll(() => demo.evaluate((element) => element.getAnimations().length)).toBe(1);
    const browserOutput = await demo.evaluate((element, time) => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = time;
      return new DOMMatrix(getComputedStyle(element).transform).m41 / 240;
    }, 1600 * 0.65);
    expect(browserOutput).toBeCloseTo(output, 3);
    await standalone.emulateMedia({ reducedMotion: 'reduce' });
    await expect(demo).toHaveCSS('animation-name', 'none');
    expect(
      await demo.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41),
    ).toBe(240);
  } finally {
    await standalone.close();
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('[data-motion-studio]')).toHaveAttribute('data-progress', '0.0000');
});

test('曲線可拖曳與取消，播放暫停不會繼續變動，剪貼簿失敗保留可複製內容', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('blocked')) },
      configurable: true,
    });
  });
  await openStudio(page);
  const handle = page.locator('[data-motion-handle="0"]');
  await handle.scrollIntoViewIfNeeded();
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 45, y - 30, { steps: 5 });
  await expect(page.getByLabel('P1 x', { exact: true })).not.toHaveValue('0.25');
  await handle.press('Escape');
  await page.mouse.up();
  await expect(page.getByLabel('P1 x', { exact: true })).toHaveValue('0.25');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('[data-motion-studio]')).toHaveAttribute('data-playing', 'true');
  await expect
    .poll(async () =>
      Number(await page.locator('[data-motion-studio]').getAttribute('data-progress')),
    )
    .toBeGreaterThan(0.03);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const stopped = await page.locator('[data-motion-studio]').getAttribute('data-progress');
  await page.waitForTimeout(150);
  await expect(page.locator('[data-motion-studio]')).toHaveAttribute('data-progress', stopped!);
  await page.getByRole('button', { name: 'Copy CSS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Clipboard unavailable' })).toBeVisible();
  await expect(page.getByLabel('Generated CSS', { exact: true })).toContainText('@keyframes move');
});

test('手機尺寸、中英明暗與減少動態模式沒有水平溢出', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStudio(page);
  for (const width of [1920, 1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.motion-graph')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('button', { name: '套用數值', exact: true })).toBeVisible();
  await page.locator('html').evaluate((element) => {
    element.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByRole('slider', { name: '時間進度', exact: true })).toBeEnabled();
});

test('CSS 複製成功會寫入完整內容，極端曲線仍維持版面寬度', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  await page.getByLabel('P1 y', { exact: true }).fill('1.5');
  await page.getByLabel('P2 y', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'Apply values' }).click();
  await page.getByRole('slider', { name: 'Timeline', exact: true }).fill('700');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Copy CSS', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'CSS copied' })).toBeVisible();
  const css = await page.getByLabel('Generated CSS', { exact: true }).textContent();
  // Windows 系統剪貼簿轉成 CRLF，僅正規化換行，保留其他字元的完整比對
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.replace(/\r\n/g, '\n')).toBe(css!.replace(/\r\n/g, '\n'));
});

test('CSS 過期複製回饋不會覆蓋曲線更新、重設或新的複製請求', async ({ page }) => {
  await page.addInitScript(() => {
    const queue: Array<{ resolve: () => void; reject: () => void }> = [];
    Object.defineProperty(window, '__motionCopyQueue', { value: queue });
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
  const copy = page.getByRole('button', { name: 'Copy CSS', exact: true });
  const feedback = page.locator('.motion-export [role="status"]');
  await copy.click();
  await page.getByRole('button', { name: 'Linear', exact: true }).click();
  await page.getByRole('button', { name: 'Ease', exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { __motionCopyQueue: Array<{ resolve: () => void }> }
    ).__motionCopyQueue[0].resolve(),
  );
  await expect(feedback).not.toHaveText('CSS copied');
  await copy.click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { __motionCopyQueue: Array<{ resolve: () => void }> }
    ).__motionCopyQueue[1].resolve(),
  );
  await expect(feedback).not.toHaveText('CSS copied');
  await copy.click();
  await copy.click();
  await page.evaluate(() =>
    (
      window as unknown as { __motionCopyQueue: Array<{ reject: () => void }> }
    ).__motionCopyQueue[3].reject(),
  );
  await expect(feedback).toContainText('Clipboard unavailable');
  await page.evaluate(() =>
    (
      window as unknown as { __motionCopyQueue: Array<{ resolve: () => void }> }
    ).__motionCopyQueue[2].resolve(),
  );
  await expect(feedback).toContainText('Clipboard unavailable');
});

test('手機真實觸控可持續拖曳控制點，第二指不會搶走狀態，Esc 與取消可還原', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await openStudio(page);
    const studio = page.locator('[data-motion-studio]');
    const first = page.locator('[data-motion-handle="0"]');
    const second = page.locator('[data-motion-handle="1"]');
    await first.scrollIntoViewIfNeeded();
    await expect(page.locator('.motion-graph')).toHaveCSS('touch-action', 'none');
    const center = async (index: number, id: number) => {
      const box = (await page.locator(`[data-motion-handle="${index}"]`).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
    };
    const touch = await context.newCDPSession(page);
    const start = await center(0, 10);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 6; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...start, x: start.x + step * 9, y: start.y - step * 6 }],
      });
    }
    await expect(studio).toHaveAttribute('data-dragging', 'true');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(studio).toHaveAttribute('data-dragging', 'false');
    expect(Number(await page.getByLabel('P1 x', { exact: true }).inputValue())).toBeGreaterThan(
      0.4,
    );
    expect(Number(await page.getByLabel('P1 y', { exact: true }).inputValue())).toBeGreaterThan(
      0.3,
    );

    const previousX = await page.getByLabel('P1 x', { exact: true }).inputValue();
    const previousY = await page.getByLabel('P1 y', { exact: true }).inputValue();
    const primary = await center(0, 20);
    const other = await center(1, 21);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [primary] });
    const moved = { ...primary, x: primary.x + 20, y: primary.y - 12 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [moved, other],
    });
    // CDP 列出此刻放開的接觸點，第一指仍保持按下
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [other] });
    await expect(studio).toHaveAttribute('data-dragging', 'true');
    // 非作用中 pointer 的取消／失去 capture 不得取消第一指
    await second.dispatchEvent('pointercancel', { pointerId: 999 });
    await second.dispatchEvent('lostpointercapture', { pointerId: 999 });
    await expect(studio).toHaveAttribute('data-dragging', 'true');
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...moved, x: moved.x + 20 }],
    });
    await expect(page.getByLabel('P1 x', { exact: true })).not.toHaveValue(previousX);
    await expect(page.getByLabel('P2 x', { exact: true })).toHaveValue('0.25');
    await expect(page.getByLabel('P2 y', { exact: true })).toHaveValue('1');
    await page.keyboard.press('Escape');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByLabel('P1 x', { exact: true })).toHaveValue(previousX);
    await expect(page.getByLabel('P1 y', { exact: true })).toHaveValue(previousY);
    await expect(studio).toHaveAttribute('data-dragging', 'false');

    const cancelled = await center(0, 30);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cancelled] });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...cancelled, x: cancelled.x + 30 }],
    });
    await expect(page.getByLabel('P1 x', { exact: true })).not.toHaveValue(previousX);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.getByLabel('P1 x', { exact: true })).toHaveValue(previousX);
    await expect(page.getByLabel('P1 y', { exact: true })).toHaveValue(previousY);
    await expect(studio).toHaveAttribute('data-dragging', 'false');
  } finally {
    await context.close();
  }
});
