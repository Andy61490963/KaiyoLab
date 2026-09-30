import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import sharp from 'sharp';
import type { Entry, EntryKind, Media } from '../../src/lib/types';
import { animatedGifFixture, readAnimationFrames } from '../helpers/animated-image';
import { signInForFixture } from './helpers/auth';

const prefix = `GIF動畫驗收-${Date.now()}`;
const entries = new Map<string, EntryKind>();
const pictures = new Map<string, string>();
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;

async function json<T>(request: APIRequestContext, route: string): Promise<T> {
  const response = await request.get(route);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function createEntry(request: APIRequestContext, origin: string, kind: EntryKind) {
  const response = await request.post('/api/admin/entries', {
    headers: { Origin: origin },
    data: { kind, title: `${prefix}-${kind}` },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const entry = (await response.json()) as Entry;
  entries.set(entry.id, kind);
  return entry;
}

async function deleteEntry(request: APIRequestContext, origin: string, id: string) {
  expect(entries.has(id)).toBe(true);
  const response = await request.get(`/api/admin/entries/${id}`);
  if (response.status() === 404) return;
  expect(response.ok(), await response.text()).toBe(true);
  let entry = (await response.json()) as Entry;
  expect(entry.kind).toBe(entries.get(id));
  expect(entry.content.title.startsWith(prefix)).toBe(true);
  if (!entry.deletedAt) {
    const trash = await request.post(`/api/admin/entries/${id}/action`, {
      headers: { Origin: origin },
      data: { version: entry.version, action: 'trash' },
    });
    expect(trash.ok(), await trash.text()).toBe(true);
    entry = await trash.json();
  }
  const deleted = await request.delete(`/api/admin/entries/${id}`, {
    headers: { Origin: origin },
    data: { version: entry.version },
  });
  expect(deleted.ok(), await deleted.text()).toBe(true);
}

async function findPicture(request: APIRequestContext, name: string) {
  const result = await json<{ items: Media[] }>(
    request,
    `/api/admin/media?q=${encodeURIComponent(name)}`,
  );
  const media = result.items.find((item) => item.name === name);
  expect(media, '媒體庫應包含本測試上傳的動畫').toBeTruthy();
  pictures.set(media!.id, name);
  return media!;
}

async function chooseImage(page: Page, name: string) {
  const picker = page.getByRole('dialog', { name: 'Choose image', exact: true });
  await expect(picker).toBeVisible();
  await picker
    .locator('.admin-media-card')
    .filter({ hasText: name })
    .getByRole('button', { name: `Choose image ${name}`, exact: true })
    .click();
  await expect(picker).toHaveCount(0);
}

async function expectAnimation(response: APIResponse, width: number, height: number) {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/webp');
  const { metadata, frames } = await readAnimationFrames(await response.body());
  expect(metadata).toMatchObject({
    width,
    pageHeight: height,
    pages: 2,
    loop: 0,
    delay: [120, 240],
  });
  expect(frames[0].center[0]).toBeGreaterThan(frames[0].center[2] + 150);
  expect(frames[1].center[2]).toBeGreaterThan(frames[1].center[0] + 150);
}

async function expectPlaying(image: Locator) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((element: HTMLImageElement) => element.decode());
  const observed = new Set<string>();
  // 直接取瀏覽器實際顯示的中心像素，證明畫面持續切換，而非只驗證副檔名或檔頭
  await expect
    .poll(
      async () => {
        const screenshot = await image.screenshot({ animations: 'allow' });
        const { data, info } = await sharp(screenshot)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const center =
          (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
        if (data[center] > data[center + 2] + 100) observed.add('red');
        if (data[center + 2] > data[center] + 100) observed.add('blue');
        return observed.size;
      },
      { intervals: [70, 130, 190, 230] },
    )
    .toBe(2);
}

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    cookies = await context.cookies();
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test.afterAll(async ({ browser, baseURL }) => {
  if (!cookies) return;
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  try {
    // 僅處理本檔建立並記錄的 ID，再以名稱前綴核對，避免移除其他驗收內容
    for (const id of entries.keys()) await deleteEntry(context.request, baseURL!, id);
    for (const [id, name] of pictures) {
      expect(name.startsWith(prefix)).toBe(true);
      const media = await json<{ items: Media[] }>(
        context.request,
        `/api/admin/media?q=${encodeURIComponent(name)}`,
      );
      const current = media.items.find((item) => item.id === id);
      if (!current) continue;
      expect(current.name).toBe(name);
      expect(current.usedBy).toHaveLength(0);
      const response = await context.request.delete(`/api/admin/media/${id}`, {
        headers: { Origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('媒體庫上傳 GIF 後，文章與作品的封面、正文及公開縮圖都繼續播放', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const name = `${prefix}-紅藍動畫.gif`;
  const alt = '紅藍兩幀交替的動畫';
  const buffer = await animatedGifFixture({ width: 640, height: 360, loop: 0 });
  await page.goto('/admin/media');
  await page.getByLabel('Upload image file', { exact: true }).setInputFiles({
    name,
    mimeType: 'image/gif',
    buffer,
  });
  let card = page.locator('.admin-media-card').filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card).toContainText('640 × 360');
  const picture = await findPicture(page.request, name);
  expect(picture.mime).toBe('image/webp');
  await card.getByLabel('Alt text', { exact: true }).fill(alt);
  await card.getByRole('button', { name: 'Save description', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await expectPlaying(card.locator('img'));
  expect((await request.get(picture.url)).status()).toBe(404);
  expect((await request.get(`${picture.url}?w=480`)).status()).toBe(404);

  const created: Entry[] = [];
  for (const kind of ['article', 'project'] as const) {
    const entry = await createEntry(page.request, baseURL!, kind);
    created.push(entry);
    const collection = kind === 'article' ? 'articles' : 'projects';
    await page.goto(`/admin/${collection}/${entry.id}`);
    const editor = page.locator('.cm-content[contenteditable=true]');
    await expect(editor).toBeVisible();
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('# 動畫流程\n\n');
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    await chooseImage(page, name);
    await expect(editor).toContainText(`![${alt}](${picture.url})`);
    await page.getByRole('button', { name: 'Choose cover image', exact: true }).click();
    await chooseImage(page, name);
    await expect(
      page.getByRole('button', { name: 'Change cover image', exact: true }).locator('img'),
    ).toHaveAttribute('src', picture.url);
    await page.getByLabel('Summary', { exact: true }).fill('GIF 封面與內文動畫驗收');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect
      .poll(async () => {
        const saved = await json<Entry>(page.request, `/api/admin/entries/${entry.id}`);
        return (
          saved.content.cover === picture.url &&
          saved.content.body.includes(`![${alt}](${picture.url})`)
        );
      })
      .toBe(true);
    expect((await request.get(`/${collection}/${entry.content.slug}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Publish content', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Review before publishing', exact: true })
      .getByRole('button', { name: 'Confirm publication', exact: true })
      .click();
    await expect(
      page.getByText('Published. Readers can now see this version on your website.', {
        exact: true,
      }),
    ).toBeVisible();
  }

  await expectAnimation(await request.get(picture.url), 640, 360);
  for (const width of [480, 960, 1600]) {
    const actualWidth = Math.min(width, 640);
    await expectAnimation(
      await request.get(`${picture.url}?w=${width}`),
      actualWidth,
      (actualWidth * 360) / 640,
    );
  }
  const guest = await browser.newContext({ baseURL });
  try {
    const reader = await guest.newPage();
    for (const entry of created) {
      const collection = entry.kind === 'article' ? 'articles' : 'projects';
      for (const width of [375, 768, 1440]) {
        await reader.setViewportSize({ width, height: 1000 });
        await reader.goto(`/${collection}/${entry.content.slug}`);
        const cover = reader.locator(`.${entry.kind}-cover img`);
        const body = reader.locator(`.prose img[src="${picture.url}"]`);
        await expect(cover).toBeVisible();
        await expect(cover).toHaveAttribute('srcset', /\?w=480 480w/);
        await expect(body).toHaveAttribute('src', picture.url);
        await body.evaluate((element: HTMLImageElement) => element.decode());
        expect(
          await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (width === 375) {
          await expectPlaying(cover);
          await expectPlaying(body);
        }
      }
    }
  } finally {
    await guest.close();
  }
  await page.goto('/admin/media');
  card = page.locator('.admin-media-card').filter({ hasText: name });
  await expect(
    card.getByRole('button', { name: `Delete image ${name}`, exact: true }),
  ).toBeDisabled();
  await card.locator('summary').click();
  for (const entry of created)
    await expect(
      card.getByText(`${entry.content.title} (published)`, { exact: true }),
    ).toBeVisible();
  expect(
    (
      await page.request.delete(`/api/admin/media/${picture.id}`, { headers: { Origin: baseURL! } })
    ).status(),
  ).toBe(409);
  for (const entry of created) await deleteEntry(page.request, baseURL!, entry.id);
  await page.reload();
  card = page.locator('.admin-media-card').filter({ hasText: name });
  const remove = card.getByRole('button', { name: `Delete image ${name}`, exact: true });
  await expect(remove).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await remove.click();
  await expect(card).toHaveCount(0);
  expect((await request.get(`${picture.url}?w=480`)).status()).toBe(404);
});

test('壞 GIF 顯示具體錯誤後仍可上傳，媒體庫中英文與手機版可操作', async ({ page }) => {
  await page.goto('/admin/media');
  await page.getByLabel('Upload image file', { exact: true }).setInputFiles({
    name: `${prefix}-損壞.gif`,
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a-not-an-image'),
  });
  await expect(page.locator('.admin-upload-queue')).toContainText(
    'The image is invalid or could not be processed within 15 seconds.',
  );
  await expect(page.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
  const name = `${prefix}-修正後.gif`;
  await page.getByLabel('Upload image file', { exact: true }).setInputFiles({
    name,
    mimeType: 'image/gif',
    buffer: await animatedGifFixture({ loop: 0 }),
  });
  const card = page.locator('.admin-media-card').filter({ hasText: name });
  await expect(card).toBeVisible();
  await findPicture(page.request, name);
  for (const language of ['zh-TW', 'en'] as const) {
    await page
      .getByRole('button', { name: language === 'zh-TW' ? '繁體中文' : 'English', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        localStorage.setItem('kaiyo-theme', value);
      }, theme);
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(card).toBeVisible();
        const upload = page.getByRole('button', {
          name: language === 'zh-TW' ? '上傳圖片' : 'Upload image',
          exact: true,
        });
        await upload.focus();
        await expect(upload).toBeFocused();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      }
    }
  }
});
