import { expect, test } from '@playwright/test';

test('Canvas 無法建立時停用跟隨捲動，章節與鍵盤時間軸仍可操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
        if (contextId === '2d') return null;
        return Reflect.apply(original, this, [contextId, ...args]);
      },
    });
  });
  await page.goto('/lab/liquidity-story');
  await expect(page.getByRole('alert')).toHaveText(
    'Canvas is unavailable. You can still explore the timeline and values below.',
  );
  const follow = page.getByRole('button', { name: 'Follow scroll', exact: true });
  await expect(follow).toBeDisabled();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.story-actions .lab-note')).toHaveText(
    'Canvas unavailable: use the timeline or chapters',
  );
  const slider = page.getByRole('slider', { name: 'Event time' });
  await page.getByRole('button', { name: '05 Halt' }).click();
  await expect(slider).toHaveValue('36');
  await expect(page.locator('.story-stats strong').first()).toHaveText('78.00');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('36.1');
  await expect(page.locator('.story-stats strong').first()).toHaveText('78.00');
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(page.locator('.story-stats strong').first()).toHaveText('100.00');
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByRole('button', { name: '跟隨捲動', exact: true })).toBeDisabled();
  await expect(page.locator('.story-actions .lab-note')).toHaveText(
    'Canvas 無法使用：請使用時間軸或章節操作',
  );
  await page.getByRole('button', { name: '04 衝擊' }).click();
  await expect(page.locator('.story-stats strong').first()).toHaveText('95.60');
  await page.getByRole('button', { name: '重設', exact: true }).click();
  await expect(page.getByRole('slider', { name: '事件時間' })).toHaveValue('0');
});

test('敘事的滑桿、章節、倒轉與重設使用同一時間', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/liquidity-story');
  const canvas = page.locator('.story-canvas-wrap canvas');
  const slider = page.getByRole('slider', { name: 'Event time' });
  await expect(page.getByRole('button', { name: 'Follow scroll', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '05 Halt' }).click();
  await expect(canvas).toHaveAttribute('data-time', '36.000');
  await expect(page.getByRole('heading', { name: 'Halt', exact: true })).toBeVisible();
  await expect(page.locator('.story-stats strong').first()).toHaveText('78.00');
  await slider.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-time', '36.100');
  await expect(page.locator('.story-stats strong').first()).toHaveText('78.00');
  await page.getByRole('button', { name: '02 Withdrawal' }).click();
  const rewind = await page.locator('.story-stats').innerText();
  await page.getByRole('button', { name: '06 Reprice' }).click();
  await page.getByRole('button', { name: '02 Withdrawal' }).click();
  await expect(page.locator('.story-stats')).toHaveText(rewind, { useInnerText: true });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-time', '0.000');
  await expect(slider).toHaveValue('0');
  const frames = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(250);
  await expect(canvas).toHaveAttribute('data-frames', frames!);
});

test('快速捲動可以反向回放，鍵盤切換為手動後不受捲動覆寫', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/lab/liquidity-story');
  const scene = page.locator('.liquidity-story');
  const canvas = page.locator('.story-canvas-wrap canvas');
  const bounds = (await scene.boundingBox())!;
  await page.mouse.move(800, 600);
  await page.mouse.wheel(0, Math.round(bounds.y + 950));
  await expect.poll(async () => Number(await canvas.getAttribute('data-time'))).toBeGreaterThan(10);
  const forward = Number(await canvas.getAttribute('data-time'));
  await page.mouse.wheel(0, -500);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-time')))
    .toBeLessThan(forward);
  await page.getByRole('button', { name: '04 Impact' }).click();
  await expect(canvas).toHaveAttribute('data-time', '27.000');
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  await expect(canvas).toHaveAttribute('data-time', '27.000');
  await page.getByRole('button', { name: 'Follow scroll', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow scroll', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(canvas).not.toHaveAttribute('data-time', '27.000');
});

test('索引與敘事在七種尺寸、明暗及中英文沒有橫向溢出', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1920, 1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const route of ['/lab', '/lab/liquidity-story']) {
        await page.goto(route);
        await page.getByRole('button', { name: '繁體中文', exact: true }).click();
        await expect(page.locator('main h1')).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
        if (route.endsWith('story')) {
          await expect(page).toHaveTitle(/流動性消失的 60 秒/);
          await page.getByRole('button', { name: '04 衝擊' }).click();
          await expect(page.locator('.story-stats strong').first()).toHaveText('95.60');
          await page.locator('.story-stage').scrollIntoViewIfNeeded();
        } else {
          await expect(page.locator('.lab-index-row')).toHaveCount(5);
        }
        await testInfo.attach(`${route.endsWith('story') ? 'story' : 'index'}-${width}-${theme}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await page.getByRole('button', { name: 'English', exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('索引、下一個實驗及回首頁可以來回導覽，停用腳本仍保留技術說明', async ({
  browser,
  page,
  baseURL,
}) => {
  await page.goto('/lab');
  await page.locator('.lab-index-row[href="/lab/liquidity-story"]').click();
  await expect(page).toHaveURL(/\/lab\/liquidity-story$/);
  await page.locator('.lab-next a').last().click();
  await expect(page).toHaveURL(/\/lab\/kinetic-carousel$/);
  await page.goBack();
  await expect(page.locator('.story-canvas-wrap canvas')).toHaveAttribute('data-time', /\d/);
  await page.locator('.lab-breadcrumb a').click();
  await expect(page).toHaveURL(/\/lab$/);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const fallback = await context.newPage();
    await fallback.goto('/lab/liquidity-story');
    await expect(
      fallback.getByText(
        'Enable JavaScript to run this experiment. Technical notes remain available below.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(fallback.getByRole('heading', { name: 'Under the surface' })).toBeVisible();
  } finally {
    await context.close();
  }
});
