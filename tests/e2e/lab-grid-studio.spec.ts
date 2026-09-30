import { expect, test, type Page } from '@playwright/test';

async function openGrid(page: Page) {
  await page.goto('/lab/grid-studio');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.locator('[data-lab-advanced] > summary').click();
  await expect(page.locator('[data-lab-advanced]')).toHaveAttribute('open');
  await expect(page.getByLabel('Preset', { exact: true })).toBeVisible();
}

test('Grid 編輯、鍵盤位置與跨度、切換版型和獨立匯出保持一致', async ({ page }) => {
  await openGrid(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('gallery');
  const block = page.locator('[data-grid-item="image-b"]');
  await block.focus();
  await block.press('ArrowRight');
  await expect(block).toHaveAttribute('data-column', '4');
  await expect(page.locator('.grid-studio-warning')).toContainText('overlapping');
  await block.press('Shift+ArrowLeft');
  await expect(block).toHaveAttribute('data-column-span', '1');
  await block.press('Shift+ArrowRight');
  await expect(block).toHaveAttribute('data-column-span', '2');
  await expect(block).toHaveAttribute('data-column', '3');
  await page.getByLabel('Gap', { exact: true }).fill('24');
  await expect(page.getByLabel('Copyable code')).toHaveValue(/gap: 24px/);
  await page.getByLabel('Columns', { exact: true }).fill('2');
  for (const item of await page.locator('[data-grid-item]').all()) {
    expect(
      Number(await item.getAttribute('data-column')) +
        Number(await item.getAttribute('data-column-span')) -
        1,
    ).toBeLessThanOrEqual(2);
  }
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await expect(page.getByLabel('Selected block', { exact: true })).toHaveValue('block-1');
  await page.getByRole('button', { name: 'Remove selected block', exact: true }).click();
  await expect(page.locator('[data-grid-item="block-1"]')).toHaveCount(0);
  await page.getByLabel('Preset', { exact: true }).selectOption('dashboard');
  await expect(page.getByLabel('Columns', { exact: true })).toHaveValue('6');
  await expect(page.locator('.grid-studio-warning')).toHaveCount(0);
  await page.getByRole('button', { name: 'Full document', exact: true }).click();
  const standalone = await page.getByLabel('Copyable code').inputValue();
  const preview = await page.context().newPage();
  await preview.setViewportSize({ width: 900, height: 800 });
  await preview.setContent(standalone);
  expect(
    await preview.locator('.layout-grid').evaluate((node) => getComputedStyle(node).display),
  ).toBe('grid');
  const desktop = await preview.locator('.layout-item-3').boundingBox();
  expect(desktop!.width).toBeGreaterThan(300);
  await preview.setViewportSize({ width: 390, height: 844 });
  const mobile = await preview.locator('.layout-item-3').boundingBox();
  expect(mobile!.width).toBe(374);
  await expect(preview.locator('.layout-item-3')).toHaveCSS('grid-column-start', 'auto');
  await preview.close();
});

test('Grid 拖曳可定位、Esc 取消與 pointercancel 還原，剪貼簿失敗仍可取得完整檔案', async ({
  page,
}) => {
  await openGrid(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('gallery');
  const studio = page.locator('[data-grid-studio]');
  const block = page.locator('[data-grid-item="image-b"]');
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 1.5, y, { steps: 8 });
  await expect(studio).toHaveAttribute('data-dragging', 'true');
  await expect(block).not.toHaveAttribute('data-column', '3');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(block).toHaveAttribute('data-column', '3');
  await expect(studio).toHaveAttribute('data-dragging', 'false');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 1.5, y, { steps: 8 });
  await block.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(block).toHaveAttribute('data-column', '3');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 1.5, y, { steps: 8 });
  await page.mouse.up();
  await expect(block).not.toHaveAttribute('data-column', '3');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    }),
  );
  await page.getByRole('button', { name: 'Copy full HTML', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText('Clipboard unavailable');
  await expect(page.getByLabel('Copyable code')).toHaveValue(/<!doctype html>/);
  await expect(page.getByLabel('Copyable code')).toBeFocused();
});

test('Grid 手機與桌面預覽、中英文與深色模式不溢出，減少動態仍可操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGrid(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const previewWidth of [390, 768, 1200]) {
      await page.getByRole('button', { name: new RegExp(`${previewWidth}\\s*px$`) }).click();
      await expect(page.locator('.grid-studio-frame')).toHaveAttribute(
        'data-preview-width',
        String(previewWidth),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  }
  await page.getByRole('button', { name: /390\s*px$/ }).click();
  await expect(page.locator('.grid-studio-grid')).toHaveAttribute('data-stacked', 'true');
  await expect(page.locator('[data-grid-item="content"]')).toHaveCSS('grid-column-start', 'auto');
  await page.getByLabel('Selected block', { exact: true }).selectOption('detail');
  await page.getByLabel('Start column', { exact: true }).fill('1');
  await expect(page.locator('[data-grid-item="detail"]')).toHaveAttribute('data-column', '1');
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.getByLabel('起始版型', { exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.getByLabel('可複製的程式碼')).toBeVisible();
});

test('Grid 新版型、程式碼頁籤與新複製請求不接受較早的剪貼簿回饋', async ({ page }) => {
  await page.addInitScript(() => {
    const queue: Array<{ resolve: () => void; reject: () => void }> = [];
    Object.defineProperty(window, '__gridCopyQueue', { value: queue });
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
  await openGrid(page);
  const copy = page.getByRole('button', { name: 'Copy code', exact: true });
  const feedback = page.locator('.grid-studio-status');
  await copy.click();
  await page.getByLabel('Preset', { exact: true }).selectOption('gallery');
  await page.getByLabel('Preset', { exact: true }).selectOption('editorial');
  await page.evaluate(() =>
    (
      window as unknown as { __gridCopyQueue: Array<{ resolve: () => void }> }
    ).__gridCopyQueue[0].resolve(),
  );
  await expect(feedback).not.toContainText('Copied');
  await copy.click();
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { __gridCopyQueue: Array<{ resolve: () => void }> }
    ).__gridCopyQueue[1].resolve(),
  );
  await expect(feedback).not.toContainText('Copied');
  await copy.click();
  await copy.click();
  await page.evaluate(() =>
    (
      window as unknown as { __gridCopyQueue: Array<{ reject: () => void }> }
    ).__gridCopyQueue[3].reject(),
  );
  await expect(feedback).toContainText('Clipboard unavailable');
  await page.evaluate(() =>
    (
      window as unknown as { __gridCopyQueue: Array<{ resolve: () => void }> }
    ).__gridCopyQueue[2].resolve(),
  );
  await expect(feedback).toContainText('Clipboard unavailable');
});
