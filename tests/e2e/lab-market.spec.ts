import { expect, test, type Page } from '@playwright/test';

async function openMarket(page: Page) {
  await page.addInitScript(() => localStorage.setItem('kaiyo-ui-language', 'en'));
  await page.goto('/lab/market-replay');
  const lab = page.getByTestId('market-lab');
  await expect(lab).toBeVisible();
  await expect(lab).toHaveAttribute('data-visible', 'true');
  await expect(lab).toHaveAttribute('data-running', 'false');
  await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  return lab;
}

async function state(page: Page) {
  return page.getByTestId('market-lab').evaluate((element) => ({
    cursor: element.getAttribute('data-cursor'),
    events: element.getAttribute('data-events'),
    last: element.querySelector('[data-testid="market-last-price"]')?.textContent,
    volume: element.querySelector('[data-testid="market-volume"]')?.textContent,
    book: element.querySelector('.market-book')?.textContent,
    indicators: element.querySelector('.market-main-panel .market-indicators')?.textContent,
    trades: element.querySelector('.market-trades')?.textContent,
    chart: element.querySelector('.market-chart-surface svg')?.innerHTML,
  }));
}

test('撮合回放共用游標，重播後圖表、委託簿、逐筆與指標完全一致', async ({ page }) => {
  const lab = await openMarket(page);
  const original = await state(page);
  const slider = lab.getByRole('slider', { name: 'Replay cursor' });
  await slider.fill('0');
  await expect(lab).toHaveAttribute('data-cursor', '0');
  await expect(lab.getByTestId('market-volume')).toHaveText('0');
  await expect(lab.getByText('No fills yet', { exact: true })).toBeVisible();
  await lab.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(lab).toHaveAttribute('data-cursor', '1');
  await slider.fill(original.cursor!);
  expect(await state(page)).toEqual(original);
  await lab.getByRole('combobox', { name: 'Playback speed' }).selectOption('10');
  await lab.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await lab.getAttribute('data-cursor')))
    .toBeGreaterThan(Number(original.cursor) + 10);
  await lab.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await state(page);
  await page.waitForTimeout(300);
  expect(await state(page)).toEqual(paused);
  await slider.fill(original.cursor!);
  expect(await state(page)).toEqual(original);
});

test('六種固定種子情境可重現，自訂限價、市價與取消保留分支歷史', async ({ page }) => {
  const lab = await openMarket(page);
  const scenario = lab.getByRole('combobox', { name: 'Scenario' });
  const fingerprints = new Set<string>();
  for (const value of ['bull', 'bear', 'sideways', 'volatile', 'crash', 'recovery']) {
    await scenario.selectOption(value);
    await expect(scenario).toHaveValue(value);
    const first = await state(page);
    await lab.getByRole('button', { name: 'Regenerate', exact: true }).click();
    expect(await state(page)).toEqual(first);
    fingerprints.add(JSON.stringify(first));
  }
  expect(fingerprints.size).toBe(6);

  await lab.getByRole('button', { name: 'Reset', exact: true }).click();
  await lab.getByLabel('Limit price (USD)', { exact: true }).fill('100.00');
  await lab.getByLabel('Quantity', { exact: true }).fill('12');
  await lab.getByRole('button', { name: 'Branch & submit', exact: true }).click();
  await expect(lab.locator('.market-feedback[role="status"]')).toContainText(
    'filled 0 · resting 12 · cancelled 0',
  );
  await expect(lab).toHaveAttribute('data-events', '1');
  await lab.getByLabel('Order type', { exact: true }).selectOption('market');
  await lab.getByLabel('Side', { exact: true }).selectOption('sell');
  await lab.getByLabel('Quantity', { exact: true }).fill('5');
  await lab.getByRole('button', { name: 'Branch & submit', exact: true }).click();
  await expect(lab.locator('.market-feedback[role="status"]')).toContainText(
    'filled 5 · resting 0 · cancelled 0',
  );
  await expect(lab.getByTestId('market-volume')).toHaveText('5');
  await expect(lab.getByTestId('market-last-price')).toHaveText('100.00');
  await lab.getByLabel('Order type', { exact: true }).selectOption('cancel');
  await lab.getByLabel('Resting order', { exact: true }).selectOption('u1');
  await lab.getByRole('button', { name: 'Branch & submit', exact: true }).click();
  await expect(lab.locator('.market-feedback[role="status"]')).toContainText(
    'filled 0 · resting 0 · cancelled 7',
  );
  const final = await state(page);
  await lab.getByRole('slider', { name: 'Replay cursor' }).fill('0');
  await lab.getByRole('slider', { name: 'Replay cursor' }).fill('3');
  expect(await state(page)).toEqual(final);
});

test('壓力測試有進度與可停止操作，隱藏分頁停止工作且不改回放狀態', async ({ page }) => {
  const lab = await openMarket(page);
  const original = await state(page);
  await lab.getByRole('button', { name: 'Run benchmark', exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (await lab.getByTestId('market-benchmark-progress').textContent())!
          .split(' / ')[0]
          .replaceAll(',', ''),
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(60);
  const hiddenProgress = await lab.getByTestId('market-benchmark-progress').textContent();
  await page.waitForTimeout(250);
  await expect(lab.getByTestId('market-benchmark-progress')).toHaveText(hiddenProgress!);
  expect(await state(page)).toEqual(original);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(async () => await lab.getByTestId('market-benchmark-progress').textContent())
    .not.toBe(hiddenProgress);
  await lab.getByRole('button', { name: 'Stop benchmark', exact: true }).click();
  const stopped = await lab.getByTestId('market-benchmark-progress').textContent();
  await page.waitForTimeout(200);
  await expect(lab.getByTestId('market-benchmark-progress')).toHaveText(stopped!);
  expect(await state(page)).toEqual(original);
});

test('行動版明暗、中文與減少動態仍可鍵盤回放，頁面沒有水平溢出', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lab = await openMarket(page);
  await expect(lab).toHaveAttribute('data-motion', 'reduced');
  for (const width of [390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    }
  }
  await page.evaluate(() => (document.documentElement.dataset.uiLanguage = 'zh-TW'));
  await expect(lab.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await lab.getByRole('button', { name: '回到起點', exact: true }).click();
  const slider = lab.getByRole('slider', { name: '事件回放游標' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(lab).toHaveAttribute('data-cursor', '1');
  await expect(slider).toBeFocused();
  await lab.getByRole('button', { name: '單步', exact: true }).click();
  await expect(lab).toHaveAttribute('data-cursor', '2');
});
