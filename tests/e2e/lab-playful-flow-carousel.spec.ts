import { expect, test, type Page } from '@playwright/test';

async function openTool(page: Page, slug: string) {
  await page.goto(`/lab/${slug}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
}

test('粒子風格確實改變畫面，換一張與 PNG 不需打開進階，JSON 保留完整設定', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTool(page, 'flow-field');
  const tool = page.locator('[data-flow-field]');
  const canvas = page.locator('[data-flow-canvas]');
  const advanced = page.locator('[data-lab-advanced]');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.getByRole('slider', { name: 'Particle limit' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Download background PNG' })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-steps', '0');
  const original = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  for (const [look, palette, seed] of [
    ['Ocean ripples', 'ocean', '238'],
    ['Ink sketch', 'mono', '903'],
  ] as const) {
    const button = page.getByRole('button', { name: look, exact: true });
    await button.focus();
    await button.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toBeFocused();
    await expect(tool).toHaveAttribute('data-seed', seed);
    await expect(canvas).toHaveAttribute('data-palette', palette);
    await expect
      .poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
      .not.toBe(original);
    await expect(tool).toHaveAttribute('data-running', 'false');
  }
  await page.getByRole('button', { name: 'Shuffle background', exact: true }).click();
  await expect(tool).not.toHaveAttribute('data-seed', '903');
  const nextSeed = await tool.getAttribute('data-seed');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download background PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(`particle-background-${nextSeed}.png`);
  await expect(advanced).not.toHaveAttribute('open', '');
  await advanced.locator('summary').focus();
  await advanced.locator('summary').press('Enter');
  await expect(advanced).toHaveAttribute('open', '');
  const source = page.getByRole('textbox', { name: 'Background settings JSON source' });
  expect(JSON.parse(await source.inputValue())).toMatchObject({
    seed: Number(nextSeed),
    palette: 'mono',
    particleLimit: 300,
    speed: 1.8,
  });
  await page.getByRole('slider', { name: 'Particle limit' }).fill('500');
  await expect.poll(async () => JSON.parse(await source.inputValue()).particleLimit).toBe(500);
  await advanced.locator('summary').click();
  await page.getByRole('button', { name: 'Berry threads', exact: true }).click();
  await expect(tool).toHaveAttribute('data-seed', '731');
  await expect(canvas).toHaveAttribute('data-palette', 'brand');
});

test('輪播三種外觀直接改變預覽，六個參數與程式仍能在進階同步修改', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openTool(page, 'kinetic-carousel');
  const advanced = page.locator('[data-lab-advanced]');
  const stage = page.locator('.kinetic-stage');
  const side = page.locator('[data-kinetic-slide="1"]');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.getByRole('slider', { name: 'Perspective', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Flat', exact: true }).click();
  await expect(stage).toHaveCSS('perspective', '1800px');
  const flat = await side.getAttribute('style');
  await page.getByRole('button', { name: 'Tilted', exact: true }).click();
  await expect(stage).toHaveCSS('perspective', '650px');
  await expect.poll(() => side.getAttribute('style')).not.toBe(flat);
  await expect(page.getByRole('button', { name: 'Tilted', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Depth', exact: true }).click();
  await expect(stage).toHaveCSS('perspective', '950px');
  await advanced.locator('summary').click();
  await expect(advanced.getByRole('slider')).toHaveCount(6);
  await page.getByRole('slider', { name: 'Perspective', exact: true }).fill('1200');
  await expect(stage).toHaveCSS('perspective', '1200px');
  await expect(page.getByRole('button', { name: 'Depth', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('textbox', { name: 'Carousel renderer source' })).toHaveValue(
    /"perspective": 1200/,
  );
  await page.getByRole('button', { name: 'Reset appearance', exact: true }).click();
  await expect(stage).toHaveCSS('perspective', '950px');
  await advanced.locator('summary').click();
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(page.locator('[data-kinetic-carousel]')).toHaveAttribute('data-active-slide', '1');
});

test('手機中英文明暗下入門與進階可由鍵盤開關，動作按鈕至少 44px', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const slug of ['flow-field', 'kinetic-carousel']) {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openTool(page, slug);
      for (const language of ['繁體中文', 'English']) {
        await page.getByRole('button', { name: language, exact: true }).click();
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
          const root = page.locator(
            slug === 'flow-field' ? '[data-flow-field]' : '[data-kinetic-carousel]',
          );
          for (const button of await root.getByRole('button').all()) {
            if (!(await button.isVisible())) continue;
            const box = await button.boundingBox();
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          const advanced = page.locator('[data-lab-advanced]');
          await advanced.locator('summary').focus();
          await page.keyboard.press('Enter');
          await expect(advanced).toHaveAttribute('open', '');
          await expect(advanced.getByRole('textbox').last()).toBeVisible();
          await page.keyboard.press('Enter');
          await expect(advanced).not.toHaveAttribute('open', '');
        }
      }
    }
  }
});
