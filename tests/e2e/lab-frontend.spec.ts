import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const tools = ['motion-studio', 'grid-studio', 'svg-studio', 'kinetic-carousel', 'flow-field'];

test('五工具在375、768、1440px明暗及中英文保持可讀且沒有執行錯誤', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const slug of ['', ...tools]) {
      await page.goto(slug ? `/lab/${slug}` : '/lab');
      for (const language of ['繁體中文', 'English']) {
        await page.getByRole('button', { name: language, exact: true }).click();
        for (const theme of ['dark', 'light']) {
          await page.evaluate(
            (theme) => document.documentElement.setAttribute('data-theme', theme),
            theme,
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${slug} ${width} ${language} ${theme}`,
          ).toBe(true);
          await expect(page.locator('main h1')).toBeVisible();
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test('前端工具入口、下一頁、sitemap與舊連結轉址保持一致', async ({ page, request }) => {
  await page.goto('/lab');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const links = page.locator('.lab-index-row');
  await expect(links).toHaveCount(5);
  expect(
    await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
  ).toEqual(tools.map((slug) => `/lab/${slug}`));
  for (let i = 0; i < tools.length; i++) {
    await page.goto(`/lab/${tools[i]}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('.lab-next a').last()).toHaveAttribute(
      'href',
      `/lab/${tools[(i + 1) % tools.length]}`,
    );
    expect(await page.locator('.lab-demo').innerText()).not.toMatch(/NaN|undefined/);
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const slug of tools) expect(sitemap).toContain(`/lab/${slug}</loc>`);
  for (const [old, next] of [
    ['market-replay', tools[0]],
    ['risk-simulator', tools[1]],
    ['liquidity-story', tools[2]],
  ]) {
    const response = await request.get(`/lab/${old}`, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`/lab/${next}`);
    expect(sitemap).not.toContain(`/lab/${old}`);
  }
});

test('輪播參數改動畫面與匯出，複製失敗可重試且舊回應不能宣稱新版本已複製', async ({ page }) => {
  await page.goto('/lab/kinetic-carousel');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('Perspective', { exact: true }).fill('1200');
  await expect(page.locator('.kinetic-stage')).toHaveCSS('perspective', '1200px');
  const source = page.getByLabel('Carousel renderer source', { exact: true });
  await expect(source).toHaveValue(/"perspective": 1200/);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    }),
  );
  const panel = page.getByRole('region', { name: 'Carousel renderer', exact: true });
  await panel.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('select the source');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) =>
          new Promise<void>((resolve) => {
            (window as any).__copiedSource = text;
            (window as any).__resolveCopy = resolve;
          }),
      },
    }),
  );
  await panel.getByRole('button', { name: 'Copy code', exact: true }).click();
  await page.getByLabel('Perspective', { exact: true }).fill('1400');
  await page.evaluate(() => (window as any).__resolveCopy());
  await expect(panel.getByRole('status')).toContainText('Source updates');
  expect(await page.evaluate(() => (window as any).__copiedSource)).toContain(
    '"perspective": 1200',
  );
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download file', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('carousel-renderer.js');
  expect(await readFile((await download.path())!, 'utf8')).toContain('"perspective": 1400');
  await page.getByRole('button', { name: 'Reset appearance', exact: true }).click();
  await expect(source).toHaveValue(/"perspective": 950/);
});

test('粒子工具匯出目前PNG與設定，配色及手機粒子限制實際套用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/flow-field');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const canvas = page.locator('[data-flow-canvas]');
  await expect(canvas).toHaveAttribute('data-steps', '0');
  await page.getByLabel('Particle limit', { exact: true }).fill('600');
  await expect(page.locator('.flow-strip output').first()).toHaveText('600');
  await page.getByLabel('Background palette', { exact: true }).selectOption('mono');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(
    await canvas.evaluate((node) => {
      const style = getComputedStyle(node);
      return (
        style.getPropertyValue('--flow-accent').trim() ===
        style.getPropertyValue('--flow-ink').trim()
      );
    }),
  ).toBe(true);
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download background PNG', exact: true }).click();
  const image = await readFile((await (await png).path())!);
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const size = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
  }));
  expect(image.readUInt32BE(16)).toBe(size.width);
  expect(image.readUInt32BE(20)).toBe(size.height);
  const settings = page.waitForEvent('download');
  await page
    .getByRole('region', { name: 'Background settings JSON', exact: true })
    .getByRole('button', { name: 'Download file', exact: true })
    .click();
  const json = JSON.parse(await readFile((await (await settings).path())!, 'utf8'));
  expect(json).toMatchObject({ particleLimit: 600, palette: 'mono' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.flow-strip output').first()).toHaveText('480');
});

test('未啟用JavaScript仍有工具說明與返回導覽', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const slug of tools) {
      await page.goto(`/lab/${slug}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('noscript .lab-loading')).toBeVisible();
      await expect(page.locator('.lab-technical article')).toHaveCount(3);
      await expect(page.locator('.lab-next a').first()).toHaveAttribute('href', '/lab');
    }
  } finally {
    await context.close();
  }
});
