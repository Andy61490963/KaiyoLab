import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openPlayground(page: Page, tool: 'svg' | 'motion' | 'grid') {
  await page.goto(`/lab/${tool}-studio`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator(`[data-${tool}-studio]`)).toBeVisible();
  await expect(page.locator('[data-lab-advanced]')).not.toHaveAttribute('open');
  await expect(page.locator('[data-lab-advanced] > summary')).toHaveText(
    'Advanced settings & export',
  );
}

test('SVG 首屏可換形狀、填色與下載，展開進階才顯示可用鍵盤操作的節點', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPlayground(page, 'svg');
  const shape = page.locator('[data-svg-shape]');
  const original = await shape.getAttribute('d');
  await expect(page.locator('[data-svg-node]')).toHaveCount(0);
  await expect(page.getByLabel('SVG source', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Try another', exact: true }).click();
  await expect(shape).not.toHaveAttribute('d', original!);
  await page.getByLabel('Fill color', { exact: true }).fill('#4378ab');
  await expect(shape).toHaveAttribute('fill', '#4378ab');
  await page.getByRole('slider', { name: 'Morph progress', exact: true }).fill('50');
  const exportedPath = await shape.getAttribute('d');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toContain(`d="${exportedPath}"`);
  expect(exported).toContain('fill="#4378ab"');
  expect(exported).not.toMatch(/svg-studio|data-svg-node|<script|<circle/);
  await page.locator('[data-lab-advanced] > summary').click();
  await page.getByRole('button', { name: 'Edit shape A', exact: true }).click();
  const node = page.locator('[data-svg-node="0"]');
  const coordinate = page.getByLabel('Node X coordinate', { exact: true });
  const previous = Number(await coordinate.inputValue());
  await node.press('ArrowRight');
  await expect(coordinate).toHaveValue(String(previous + 1));
  await page.locator('[data-lab-advanced] > summary').click();
  await expect(page.locator('[data-svg-node]')).toHaveCount(0);
  await expect(page.getByLabel('SVG source', { exact: true })).toBeHidden();
});

test('動畫首屏預設直接播放，減少動態時仍能用時間軸查看而不需開啟進階', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openPlayground(page, 'motion');
  const studio = page.locator('[data-motion-studio]');
  await expect(page.locator('.motion-graph')).toBeHidden();
  await expect(page.getByLabel('Duration (ms)', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Generated CSS', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Overshoot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Overshoot', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => Number(await studio.getAttribute('data-progress')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await studio.getAttribute('data-progress');
  await page.waitForTimeout(100);
  await expect(studio).toHaveAttribute('data-progress', paused!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Snappy', exact: true }).click();
  await expect(studio).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('slider', { name: 'Timeline', exact: true }).fill('750');
  await expect(studio).toHaveAttribute('data-progress', '0.7500');
  await expect(page.locator('[data-lab-advanced]')).not.toHaveAttribute('open');
  await page.locator('[data-lab-advanced] > summary').click();
  await expect(page.getByLabel('Generated CSS', { exact: true })).toContainText(
    'cubic-bezier(0.22, 1, 0.36, 1)',
  );
});

test('Grid 首屏可套版型、拖拉與切換裝置，進階欄位保留同一份排版', async ({ page }) => {
  await openPlayground(page, 'grid');
  await expect(page.getByLabel('Columns', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Copyable code', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gallery', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const block = page.locator('[data-grid-item="image-b"]');
  await expect(block).toHaveAttribute('data-column', '3');
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - box.width, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(block).not.toHaveAttribute('data-column', '3');
  const column = await block.getAttribute('data-column');
  await page.getByRole('button', { name: /Phone\s*390px$/ }).click();
  await expect(page.locator('.grid-studio-frame')).toHaveAttribute('data-preview-width', '390');
  await expect(page.locator('.grid-studio-grid')).toHaveAttribute('data-stacked', 'true');
  await page.getByRole('button', { name: /Desktop\s*1200px$/ }).click();
  await expect(page.locator('.grid-studio-grid')).toHaveAttribute('data-stacked', 'false');
  await expect(block).toHaveAttribute('data-column', column!);
  await expect(page.locator('[data-lab-advanced]')).not.toHaveAttribute('open');
  await page.locator('[data-lab-advanced] > summary').click();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('gallery');
  await expect(page.getByLabel('Selected block', { exact: true })).toHaveValue('image-b');
  await expect(page.getByLabel('Start column', { exact: true })).toHaveValue(column!);
});

test('三個遊玩首屏在手機平板桌面與雙語明暗主題保留足夠按鈕尺寸且無水平溢出', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const tool of ['svg', 'motion', 'grid'] as const) {
    await openPlayground(page, tool);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        for (const language of ['繁體中文', 'English']) {
          await page.getByRole('button', { name: language, exact: true }).click();
          await expect(page.locator('[data-lab-advanced] > summary')).toHaveText(
            language === '繁體中文' ? '進階設定與匯出' : 'Advanced settings & export',
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          const sizes = await page
            .locator(`[data-${tool}-studio] .lab-button:visible`)
            .evaluateAll((buttons) =>
              buttons.map((button) => {
                const { width, height } = button.getBoundingClientRect();
                return { width, height };
              }),
            );
          expect(sizes.length).toBeGreaterThan(2);
          for (const size of sizes) {
            expect(size.width).toBeGreaterThanOrEqual(44);
            expect(size.height).toBeGreaterThanOrEqual(44);
          }
          await expect(page.locator('[data-lab-advanced]')).not.toHaveAttribute('open');
        }
      }
    }
  }
  expect(pageErrors).toEqual([]);
});
