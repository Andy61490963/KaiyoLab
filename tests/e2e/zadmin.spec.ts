import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import type { Entry, Media, SiteSettings } from '../../src/lib/types';

const email = process.env.E2E_EMAIL || 'e2e@example.test';
const password = process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026';
async function requestJson<T>(
  client: APIRequestContext,
  baseURL: string,
  route: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await client.fetch(route, { method, data, headers: { Origin: baseURL } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<T>;
}
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('電子郵件').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByRole('button', { name: '進入工作空間' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '歡迎回到你的創作宇宙' })).toBeVisible();
}
test.beforeAll(async ({ request, baseURL }) => {
  const response = await request.get('/setup');
  if (new URL(response.url()).pathname === '/setup') {
    expect(process.env.SETUP_TOKEN, '全新測試資料庫需要一次性初始化碼').toBeTruthy();
    const setup = await request.post('/api/setup', {
      headers: { Origin: baseURL! },
      data: {
        token: process.env.SETUP_TOKEN,
        email,
        password,
        name: 'Kaiyo',
        siteName: 'KaiyoLab',
      },
    });
    expect([200, 409]).toContain(setup.status());
  }
});
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('分類與標籤可新增、改名與刪除', async ({ page }) => {
  const suffix = Date.now();
  const category = `驗收分類-${suffix}`;
  const renamed = `重新命名-${suffix}`;
  const tag = `驗收標籤-${suffix}`;
  await page.goto('/admin/taxonomies');
  const categories = page
    .locator('section.admin-panel')
    .filter({ has: page.getByRole('heading', { name: '分類', exact: true }) });
  const tags = page
    .locator('section.admin-panel')
    .filter({ has: page.getByRole('heading', { name: '標籤', exact: true }) });
  await categories.getByLabel('分類名稱', { exact: true }).fill(category);
  await categories.getByRole('button', { name: '新增分類', exact: true }).click();
  const originalRow = categories
    .locator('.admin-taxonomy-list > div')
    .filter({ has: page.getByText(category, { exact: true }) });
  await expect(originalRow).toBeVisible();
  await originalRow.getByRole('button', { name: '編輯', exact: true }).click();
  await categories.getByLabel('分類名稱', { exact: true }).fill(renamed);
  await categories.getByRole('button', { name: '儲存修改', exact: true }).click();
  await expect(originalRow).toHaveCount(0);
  const renamedRow = categories
    .locator('.admin-taxonomy-list > div')
    .filter({ has: page.getByText(renamed, { exact: true }) });
  await expect(renamedRow).toBeVisible();
  await tags.getByLabel('標籤名稱', { exact: true }).fill(tag);
  await tags.getByRole('button', { name: '新增標籤', exact: true }).click();
  const tagRow = tags.locator('.admin-taxonomy-list > div').filter({ hasText: tag });
  await expect(tagRow).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await tagRow.getByRole('button', { name: `刪除標籤 ${tag}`, exact: true }).click();
  await expect(tagRow).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await renamedRow.getByRole('button', { name: `刪除分類 ${renamed}`, exact: true }).click();
  await expect(renamedRow).toHaveCount(0);
});

test('媒體上傳、替代文字、個人設定與使用中圖片保護', async ({ page, baseURL }) => {
  const original = await requestJson<SiteSettings>(page.request, baseURL!, '/api/admin/settings');
  const fileName = `後台圖片驗收-${Date.now()}.png`;
  let media: Media | undefined;
  try {
    await page.goto('/admin/media');
    await page.locator('input[type=file]').setInputFiles({
      name: '不支援的圖片.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      ),
    });
    await expect(page.getByRole('alert')).toContainText('支援 PNG、JPEG 與 WebP 圖片。');
    const buffer = await sharp({
      create: { width: 96, height: 96, channels: 3, background: '#74e2ce' },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: fileName, mimeType: 'image/png', buffer });
    let card = page.locator('.admin-media-card').filter({ hasText: fileName });
    await expect(card).toBeVisible();
    await card.getByLabel('替代文字', { exact: true }).fill('供端到端驗證使用的青色方形');
    await card.getByRole('button', { name: '儲存描述', exact: true }).click();
    await expect(card.getByRole('button', { name: '已儲存', exact: true })).toBeVisible();
    const uploaded = await requestJson<{ items: Media[] }>(
      page.request,
      baseURL!,
      '/api/admin/media',
    );
    media = uploaded.items.find((item) => item.name === fileName);
    expect(media?.alt).toBe('供端到端驗證使用的青色方形');
    expect(media?.mime).toBe('image/webp');
    await page.goto('/admin/about');
    await page.getByLabel('顯示名稱', { exact: true }).fill('後台驗收站長');
    await page.getByLabel('個人簡介', { exact: true }).fill('這是驗收過程中建立的個人簡介。');
    await page
      .getByLabel('關於我', { exact: true })
      .fill('## 驗收個人頁\n\n**這段文字應正確呈現。**');
    await page.getByRole('button', { name: '選擇圖片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '選擇圖片' });
    await picker
      .locator('.admin-media-card')
      .filter({ hasText: fileName })
      .getByRole('button', { name: /選擇圖片/ })
      .click();
    await expect(picker).toHaveCount(0);
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已儲存送出的設定');
    const updated = await requestJson<SiteSettings>(page.request, baseURL!, '/api/admin/settings');
    expect(updated.avatar).toBe(media!.url);
    expect(updated.authorName).toBe('後台驗收站長');
    const about = await page.request.get('/about');
    expect(await about.text()).toContain('驗收個人頁');
    await page.goto('/admin/media');
    card = page.locator('.admin-media-card').filter({ hasText: fileName });
    await expect(
      card.getByRole('button', { name: `刪除圖片 ${fileName}`, exact: true }),
    ).toBeDisabled();
    await card.locator('summary').click();
    await expect(card.getByText('網站設定／關於我', { exact: true })).toBeVisible();
    const rejected = await page.request.delete(`/api/admin/media/${media!.id}`, {
      headers: { Origin: baseURL! },
    });
    expect(rejected.status()).toBe(409);
    await requestJson(page.request, baseURL!, '/api/admin/settings', 'PUT', original);
    await page.reload();
    card = page.locator('.admin-media-card').filter({ hasText: fileName });
    await expect(
      card.getByRole('button', { name: `刪除圖片 ${fileName}`, exact: true }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: `刪除圖片 ${fileName}`, exact: true }).click();
    await expect(card).toHaveCount(0);
    media = undefined;
  } finally {
    await requestJson(page.request, baseURL!, '/api/admin/settings', 'PUT', original);
    if (media)
      await page.request.delete(`/api/admin/media/${media.id}`, { headers: { Origin: baseURL! } });
  }
});

test('儲存失敗可復原，多分頁衝突保留輸入且可另存新草稿', async ({ page, context, baseURL }) => {
  const created = await requestJson<Entry>(page.request, baseURL!, '/api/admin/entries', 'POST', {
    kind: 'article',
    title: `衝突驗收-${Date.now()}`,
  });
  const route = `/admin/articles/${created.id}`;
  const endpoint = `/api/admin/entries/${created.id}`;
  const firstTitle = '先送出並保留的文章';
  const localTitle = '斷線期間尚未送出的文章';
  await page.goto(route);
  await expect(page.getByLabel('文章標題')).toHaveValue(created.content.title);
  await page.route(`**${endpoint}`, (intercepted) =>
    intercepted.request().method() === 'PATCH'
      ? intercepted.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '驗收用暫時離線，請重試。' }),
        })
      : intercepted.continue(),
  );
  await page.getByLabel('文章標題').fill(localTitle);
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('驗收用暫時離線');
  await expect(page.getByLabel('文章標題')).toHaveValue(localTitle);
  await page.unroute(`**${endpoint}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByText('發現尚未送出的本機草稿', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢復本機內容', exact: true }).click();
  await expect(page.getByLabel('文章標題')).toHaveValue(localTitle);
  await expect(page.getByText('所有變更已儲存', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(route);
  await expect(second.getByLabel('文章標題')).toHaveValue(localTitle);
  await page.getByLabel('文章標題').fill(firstTitle);
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
  await expect(page.getByText('所有變更已儲存', { exact: true })).toBeVisible();
  const conflictingTitle = '另一個分頁仍在編輯的版本';
  await second.getByLabel('文章標題').fill(conflictingTitle);
  await second.getByRole('button', { name: '儲存草稿', exact: true }).click();
  await expect(second.getByText('這份內容已在其他分頁修改', { exact: true })).toBeVisible();
  await expect(second.getByLabel('文章標題')).toHaveValue(conflictingTitle);
  const server = await requestJson<Entry>(page.request, baseURL!, endpoint);
  expect(server.content.title).toBe(firstTitle);
  await second.getByRole('button', { name: '另存新草稿', exact: true }).click();
  await expect(second).not.toHaveURL(route);
  await expect(second.getByLabel('文章標題')).toHaveValue(`${conflictingTitle}（復原副本）`);
  const copyId = new URL(second.url()).pathname.split('/').at(-1)!;
  expect(copyId).not.toBe(created.id);
  const copy = await requestJson<Entry>(second.request, baseURL!, `/api/admin/entries/${copyId}`);
  expect(copy.published).toBeNull();
  expect(copy.content.title).toBe(`${conflictingTitle}（復原副本）`);
  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: '移至垃圾桶', exact: true }).click();
  await expect(second.getByText('已移至垃圾桶，可以隨時還原。', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: '還原內容', exact: true }).click();
  await expect(
    second.getByText('已還原為草稿，確認內容後即可重新發布。', { exact: true }),
  ).toBeVisible();
  for (const id of [created.id, copyId]) {
    const latest = await requestJson<Entry>(page.request, baseURL!, `/api/admin/entries/${id}`);
    await requestJson(page.request, baseURL!, `/api/admin/entries/${id}/action`, 'POST', {
      action: 'trash',
      version: latest.version,
    });
  }
  await second.close();
});
