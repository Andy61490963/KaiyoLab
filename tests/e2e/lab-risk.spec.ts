import { expect, test, type Page } from '@playwright/test';

const route = '/lab/risk-simulator';
const lab = (page: Page) => page.locator('[data-risk-lab]');
const complete = async (page: Page) => {
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'complete', { timeout: 30_000 });
  await expect(page.locator('[data-risk-results]')).toBeVisible();
};

test('10,000 條路徑可重現，配置、狀態、相關性與網格配置真正改變結果', async ({ page }) => {
  await page.goto(route);
  await complete(page);
  await page.locator('.risk-audit summary').click();
  await expect(page.locator('[data-risk-completed]')).toHaveText('10,000 × 252');
  const initial = await page.locator('[data-risk-var]').textContent();
  const initialFan = await page.locator('.risk-fan .risk-median').getAttribute('d');
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await expect(lab(page)).not.toHaveAttribute('data-risk-status', 'complete');
  await complete(page);
  await expect(page.locator('[data-risk-var]')).toHaveText(initial!);
  await expect(page.locator('.risk-fan .risk-median')).toHaveAttribute('d', initialFan!);
  await page.getByRole('button', { name: '12 paths', exact: true }).click();
  await expect(page.locator('.risk-fan .risk-sample')).toHaveCount(12);
  const inspect = page.getByRole('slider', { name: 'Inspect trading day', exact: true });
  await inspect.focus();
  await inspect.press('Home');
  await expect(page.locator('.risk-quantiles dd')).toHaveText([
    '100.0',
    '100.0',
    '100.0',
    '100.0',
    '100.0',
  ]);
  await inspect.press('End');
  await expect(inspect).toBeFocused();
  await page.getByRole('slider', { name: 'Equity allocation', exact: true }).press('End');
  await expect(page.locator('.risk-weight output')).toHaveText(['100%', '0%', '0%']);
  await complete(page);
  await expect(page.locator('[data-risk-var]')).not.toHaveText(initial!);
  await page.getByLabel('Regime assumption', { exact: true }).selectOption('stress');
  await complete(page);
  expect(Number.parseFloat((await page.locator('[data-risk-var]').textContent())!)).toBeGreaterThan(
    30,
  );
  await page.getByRole('button', { name: 'Use grid minimum volatility', exact: true }).click();
  await complete(page);
  const allocations = await page.locator('.risk-weight output').allTextContents();
  expect(allocations.reduce((sum, value) => sum + Number.parseFloat(value), 0)).toBe(100);
  expect(allocations).not.toEqual(['100%', '0%', '0%']);
  await page.getByRole('slider', { name: 'Equity / Bonds correlation', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Equity / Gold correlation', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Bonds / Gold correlation', exact: true }).press('Home');
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'invalid');
  await expect(page.getByRole('alert')).toContainText('positive semidefinite');
  await expect(page.getByRole('button', { name: 'Run again', exact: true })).toBeDisabled();
  await expect(page.locator('[data-risk-results]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await complete(page);
  await expect(page.locator('[data-risk-var]')).toHaveText(initial!);
});

test('Worker 可取消、失敗重試、隱藏停止，快速修改不會套用舊種子的結果', async ({ page }) => {
  // 在真正 Worker 上記錄生命週期，不用假的成功回應替代背景運算
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const active = new Set<Worker>();
    (window as any).__riskWorkers = { active: () => active.size, created: 0 };
    window.Worker = class extends OriginalWorker {
      private tracked: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.tracked = String(url).includes('risk.worker');
        if (this.tracked) {
          active.add(this);
          (window as any).__riskWorkers.created++;
        }
      }
      terminate() {
        if (this.tracked) active.delete(this);
        super.terminate();
      }
    };
  });
  let failed = false;
  await page.route(/risk\.worker.*\.js/, async (intercepted) => {
    if (!failed) {
      failed = true;
      await intercepted.abort('failed');
    } else await intercepted.continue();
  });
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'error');
  await expect(page.getByRole('alert')).toContainText('Retry or reset');
  await page.getByRole('button', { name: 'Retry simulation', exact: true }).click();
  await complete(page);
  await expect.poll(() => page.evaluate(() => (window as any).__riskWorkers.active())).toBe(0);
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'cancelled');
  await expect.poll(() => page.evaluate(() => (window as any).__riskWorkers.active())).toBe(0);
  const seed = page.getByLabel('Random seed', { exact: true });
  await seed.fill('41');
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'running');
  for (const value of ['42', '43', '44']) await seed.fill(value);
  await complete(page);
  await expect(lab(page)).toHaveAttribute('data-risk-seed', '44');
  await seed.fill('123');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'hidden');
  await expect.poll(() => page.evaluate(() => (window as any).__riskWorkers.active())).toBe(0);
  await page.evaluate(() => {
    delete (document as any).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await complete(page);
  await expect(lab(page)).toHaveAttribute('data-risk-seed', '123');
  const before = await page.evaluate(() => (window as any).__riskWorkers.created);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'complete');
  await page.evaluate(() => {
    delete (document as any).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'complete');
  expect(await page.evaluate(() => (window as any).__riskWorkers.created)).toBe(before);
  await seed.fill('');
  await expect(lab(page)).toHaveAttribute('data-risk-status', 'invalid');
  await expect(page.getByRole('alert')).toContainText('integer');
});

test('中英文、明暗與減少動態下，390 至 1920px 的參數和圖表維持可操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  await complete(page);
  for (const language of ['en', 'zh-TW']) {
    await page
      .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
      .click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        localStorage.setItem('kaiyo-theme', value);
      }, theme);
      for (const width of [1920, 1440, 1280, 1024, 768, 430, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(page.locator('[data-risk-results]')).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${language}/${theme}/${width}`,
        ).toBe(true);
        const slider = page.getByRole('slider', {
          name: language === 'en' ? 'Inspect trading day' : '檢視交易日',
          exact: true,
        });
        await slider.focus();
        await slider.press('Home');
        await expect(slider).toBeFocused();
        await expect(page.locator('.risk-quantiles dd')).toHaveText([
          '100.0',
          '100.0',
          '100.0',
          '100.0',
          '100.0',
        ]);
        await slider.press('End');
      }
    }
  }
});
