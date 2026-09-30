import { expect, test, type Page } from '@playwright/test';

async function openExperiment(page: Page, slug: string) {
  await page.goto(`/lab/${slug}`);
  await expect(page.locator('main h1')).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
}

async function openAdvanced(page: Page) {
  const details = page.locator('[data-lab-advanced]');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
}

test('輪播連續循環、鍵盤與減少動態模式保持可操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExperiment(page, 'kinetic-carousel');
  const carousel = page.locator('[data-kinetic-carousel]');
  const stage = page.getByRole('group', { name: 'Kinetic carousel', exact: true });
  await expect(stage).toHaveAttribute('data-settled', 'true');
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expect(page.getByRole('button', { name: 'Start autoplay' })).toBeDisabled();
  for (let index = 1; index <= 7; index++) {
    await page.getByRole('button', { name: 'Next slide', exact: true }).click();
    await expect(carousel).toHaveAttribute('data-active-slide', String(index % 6));
    await expect(stage).toHaveAttribute('data-position', `${index}.0000`);
  }
  await stage.press('Home');
  await expect(carousel).toHaveAttribute('data-active-slide', '0');
  await stage.press('ArrowLeft');
  await expect(carousel).toHaveAttribute('data-active-slide', '5');
  await stage.press('ArrowRight');
  await expect(carousel).toHaveAttribute('data-active-slide', '0');
  await expect(page.locator('[data-kinetic-slide][aria-hidden=false]')).toHaveCount(1);
  for (const image of await page.locator('[data-kinetic-slide] img').all()) {
    expect(
      await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
    ).toBe(true);
  }
});

test('輪播圖像失敗時保留尺寸與導覽，重試能真正重新載入', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/images/lab/kinetic-wave.svg*', (route) => route.abort('failed'));
  await openExperiment(page, 'kinetic-carousel');
  const stage = page.locator('.kinetic-stage');
  await expect(page.getByRole('alert')).toContainText('Some images did not load');
  await expect(page.locator('.kinetic-image-fallback')).toBeVisible();
  const before = await stage.boundingBox();
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(page.locator('[data-kinetic-carousel]')).toHaveAttribute('data-active-slide', '1');
  await page.unroute('**/images/lab/kinetic-wave.svg*');
  await page.getByRole('button', { name: 'Retry images', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await stage.boundingBox())!.height).toBe(before!.height);
  await page.getByRole('button', { name: 'First slide', exact: true }).click();
  expect(
    await page
      .locator('[data-kinetic-slide="0"] img')
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
});

test('滑鼠慣性拖曳、Esc 取消與暫停後不再自動前進', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openExperiment(page, 'kinetic-carousel');
  const carousel = page.locator('[data-kinetic-carousel]');
  const stage = page.locator('.kinetic-stage');
  await expect(page.getByRole('button', { name: 'Pause autoplay' })).toBeEnabled();
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  const x = bounds.x + bounds.width * 0.65;
  const y = bounds.y + bounds.height * 0.48;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - Math.min(200, bounds.width * 0.45), y, { steps: 12 });
  await expect(stage).toHaveAttribute('data-dragging', 'true');
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-settled', 'true');
  const position = Number(await stage.getAttribute('data-position'));
  expect(position).toBeGreaterThan(0);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await stage.focus();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 100, y, { steps: 6 });
  await stage.press('Escape');
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-settled', 'true');
  expect(Number(await stage.getAttribute('data-position'))).toBe(position);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
});

test('流場逐步、種子重建與鍵盤施力可重現且不依賴動畫', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExperiment(page, 'flow-field');
  const field = page.locator('[data-flow-field]');
  const canvas = page.locator('[data-flow-canvas]');
  await expect(canvas).toHaveAttribute('data-steps', '0');
  await expect(field).toHaveAttribute('data-running', 'false');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  const image = () => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  const original = await image();
  await page.getByRole('button', { name: 'Step 0.1 s', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-steps', '12');
  expect(await image()).not.toBe(original);
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Reset field', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-steps', '0');
  expect(await image()).toBe(original);
  await canvas.press('Home');
  await expect(page.locator('.flow-probe > span')).toBeVisible();
  await page.getByRole('button', { name: 'Repel −', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repel −', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await canvas.press('ArrowRight');
  await expect(page.locator('.flow-probe > span')).toBeVisible();
  await canvas.press('Escape');
  await expect(page.locator('.flow-probe > span')).toBeHidden();
  await page.getByLabel('Seed', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Reset field', exact: true }).click();
  await expect(field).toHaveAttribute('data-seed', '12345');
  expect(await image()).not.toBe(original);
  await page.getByLabel('Seed', { exact: true }).fill('bad');
  await page.getByRole('button', { name: 'Reset field', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter an integer from 0 to 999999999');
});

test('減少動態時鍵盤作用力可帶入單步，Esc 或焦點離開實驗區才解除', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExperiment(page, 'flow-field');
  await openAdvanced(page);
  const canvas = page.locator('[data-flow-canvas]');
  const probe = page.locator('.flow-probe > span');
  const step = page.getByRole('button', { name: 'Step 0.1 s', exact: true });
  const reset = page.getByRole('button', { name: 'Reset field', exact: true });
  const image = () => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await expect(canvas).toHaveAttribute('data-steps', '0');
  await step.click();
  await expect(canvas).toHaveAttribute('data-steps', '12');
  const baseline = await image();

  await reset.click();
  await canvas.press('Home');
  await canvas.press('Tab');
  await expect(step).toBeFocused();
  await expect(probe).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-steps', '12');
  expect(await image()).not.toBe(baseline);

  await reset.click();
  await canvas.press('Home');
  await canvas.press('Escape');
  await expect(probe).toBeHidden();
  await canvas.press('Tab');
  await expect(step).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-steps', '12');
  expect(await image()).toBe(baseline);

  await reset.click();
  await canvas.press('Home');
  await canvas.press('Tab');
  await expect(probe).toBeVisible();
  await page.getByRole('link', { name: 'Back to LAB', exact: true }).focus();
  await expect(probe).toBeHidden();
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-steps', '12');
  expect(await image()).toBe(baseline);
});

test('深色流場的實際淡出參數反覆合成後保持品牌背景，不累積成深藍', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('kaiyo-theme', 'dark');
    const samples: { alpha: number; color: string }[] = [];
    (window as any).__flowFadeSamples = samples;
    const original = HTMLCanvasElement.prototype.getContext;
    const wrapped = new WeakSet<CanvasRenderingContext2D>();
    (HTMLCanvasElement.prototype as any).getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const context = (original as Function).apply(this, args) as CanvasRenderingContext2D | null;
      if (
        args[0] === '2d' &&
        context &&
        this.matches('[data-flow-canvas]') &&
        !wrapped.has(context)
      ) {
        wrapped.add(context);
        const fill = context.fillRect.bind(context);
        context.fillRect = (x, y, width, height) => {
          if (
            x === 0 &&
            y === 0 &&
            width > 50 &&
            height > 50 &&
            context.globalAlpha < 1 &&
            samples.length < 12
          ) {
            samples.push({ alpha: context.globalAlpha, color: String(context.fillStyle) });
          }
          fill(x, y, width, height);
        };
      }
      return context;
    };
  });
  await openExperiment(page, 'flow-field');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-flow-canvas]').scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => (window as any).__flowFadeSamples.length))
    .toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pixels = await page.evaluate(() => {
    const background = getComputedStyle(document.querySelector('[data-flow-canvas]')!)
      .getPropertyValue('--flow-paper')
      .trim();
    const samples = (window as any).__flowFadeSamples as { alpha: number; color: string }[];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const context = canvas.getContext('2d', { alpha: false })!;
    context.fillStyle = background;
    context.fillRect(0, 0, 2, 2);
    const expected = [...context.getImageData(0, 0, 1, 1).data];
    for (let iteration = 0; iteration < 2400; iteration++) {
      const sample = samples[iteration % samples.length];
      context.globalAlpha = sample.alpha;
      context.fillStyle = sample.color;
      context.fillRect(0, 0, 2, 2);
    }
    return { expected, actual: [...context.getImageData(0, 0, 1, 1).data] };
  });
  expect(pixels.expected).toEqual([37, 36, 45, 255]);
  expect(
    Math.max(...pixels.actual.map((value, index) => Math.abs(value - pixels.expected[index]))),
  ).toBeLessThanOrEqual(4);
});

test('流場暫停保留軌跡、繼續運行與離開可視區停止模擬', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openExperiment(page, 'flow-field');
  const canvas = page.locator('[data-flow-canvas]');
  const field = page.locator('[data-flow-field]');
  await canvas.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute('data-running', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-steps')))
    .toBeGreaterThan(12);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(field).toHaveAttribute('data-running', 'false');
  const pausedImage = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  const steps = Number(await canvas.getAttribute('data-steps'));
  await page.getByRole('button', { name: 'Repel −', exact: true }).click();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(pausedImage);
  await page.getByRole('button', { name: 'Step 0.1 s', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-steps', String(steps + 12));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(field).toHaveAttribute('data-running', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-steps')))
    .toBeGreaterThan(steps + 12);
  await page.setViewportSize({ width: 1440, height: 600 });
  await openAdvanced(page);
  await page.locator('footer').last().scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute('data-running', 'false');
  const stopped = await canvas.getAttribute('data-steps');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await canvas.getAttribute('data-steps')).toBe(stopped);
  await canvas.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute('data-running', 'true');
});

test('兩種作品在窄螢幕、中英文和明暗主題保持尺寸與操作', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const slug of ['kinetic-carousel', 'flow-field']) {
    for (const width of [390, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await openExperiment(page, slug);
      await expect(
        page.locator(slug === 'flow-field' ? '[data-flow-canvas]' : '.kinetic-stage'),
      ).toHaveAttribute(
        slug === 'flow-field' ? 'data-steps' : 'data-settled',
        slug === 'flow-field' ? '0' : 'true',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if ([390, 1440].includes(width)) {
        await page.getByRole('button', { name: '繁體中文', exact: true }).click();
        if (slug === 'flow-field') await openAdvanced(page);
        await expect(
          page.getByRole('button', {
            name: slug === 'flow-field' ? '重建流場' : '回到第一張',
            exact: true,
          }),
        ).toBeVisible();
        await testInfo.attach(`${slug}-${width}-light`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await page
          .getByRole('button', { name: /深色|dark/i })
          .first()
          .click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await testInfo.attach(`${slug}-${width}-dark`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await page
          .getByRole('button', { name: /淺色|light/i })
          .first()
          .click();
      }
    }
  }
  expect(errors).toEqual([]);
});

test('觸控可拖曳輪播及在流場施力', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
  });
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await openExperiment(page, 'kinetic-carousel');
    const stage = page.locator('.kinetic-stage');
    await stage.scrollIntoViewIfNeeded();
    const box = (await stage.boundingBox())!;
    const x = box.x + box.width * 0.75;
    const y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let index = 1; index <= 10; index++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - index * 16, y }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(stage).toHaveAttribute('data-settled', 'true');
    expect(Number(await stage.getAttribute('data-position'))).toBeGreaterThan(0);
    await openExperiment(page, 'flow-field');
    const canvas = page.locator('[data-flow-canvas]');
    await canvas.scrollIntoViewIfNeeded();
    const fieldBox = (await canvas.boundingBox())!;
    const point = { x: fieldBox.x + fieldBox.width / 2, y: fieldBox.y + fieldBox.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.locator('.flow-probe > span')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x + 40, y: point.y + 30 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.flow-probe > span')).toBeHidden();
    await session.detach();
  } finally {
    await context.close();
  }
});
