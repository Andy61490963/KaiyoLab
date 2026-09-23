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
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}
test.beforeAll(async ({ request, baseURL }) => {
  const response = await request.get('/setup');
  if (new URL(response.url()).pathname === '/setup') {
    expect(process.env.SETUP_TOKEN, 'A new database requires a one-time setup token').toBeTruthy();
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

test('categories and tags can be created, renamed, and deleted', async ({ page }) => {
  const suffix = Date.now();
  const category = `驗收分類-${suffix}`;
  const renamed = `重新命名-${suffix}`;
  const tag = `驗收標籤-${suffix}`;
  await page.goto('/admin/taxonomies');
  const categories = page
    .locator('section.admin-panel')
    .filter({ has: page.getByRole('heading', { name: 'Category', exact: true }) });
  const tags = page
    .locator('section.admin-panel')
    .filter({ has: page.getByRole('heading', { name: 'Tag', exact: true }) });
  await categories.getByLabel('Category name', { exact: true }).fill(category);
  await categories.getByRole('button', { name: 'Add category', exact: true }).click();
  const originalRow = categories
    .locator('.admin-taxonomy-list > div')
    .filter({ has: page.getByText(category, { exact: true }) });
  await expect(originalRow).toBeVisible();
  await originalRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await categories.getByLabel('Category name', { exact: true }).fill(renamed);
  await categories.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(originalRow).toHaveCount(0);
  const renamedRow = categories
    .locator('.admin-taxonomy-list > div')
    .filter({ has: page.getByText(renamed, { exact: true }) });
  await expect(renamedRow).toBeVisible();
  await tags.getByLabel('Tag name', { exact: true }).fill(tag);
  await tags.getByRole('button', { name: 'Add tag', exact: true }).click();
  const tagRow = tags.locator('.admin-taxonomy-list > div').filter({ hasText: tag });
  await expect(tagRow).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await tagRow.getByRole('button', { name: `Delete tag ${tag}`, exact: true }).click();
  await expect(tagRow).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await renamedRow.getByRole('button', { name: `Delete category ${renamed}`, exact: true }).click();
  await expect(renamedRow).toHaveCount(0);
});

test('media upload, alt text, profile settings, and in-use image protection', async ({
  page,
  baseURL,
}) => {
  const original = await requestJson<SiteSettings>(page.request, baseURL!, '/api/admin/settings');
  const fileName = `後台圖片驗收-${Date.now()}.png`;
  let media: Media | undefined;
  try {
    await page.goto('/admin/media');
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: '不支援的圖片.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
        ),
      });
    await expect(page.getByRole('alert')).toContainText(
      'Only PNG, JPEG, and WebP images are supported.',
    );
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
    await card.getByLabel('Alt text', { exact: true }).fill('供端到端驗證使用的青色方形');
    await card.getByRole('button', { name: 'Save description', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    const uploaded = await requestJson<{ items: Media[] }>(
      page.request,
      baseURL!,
      '/api/admin/media',
    );
    media = uploaded.items.find((item) => item.name === fileName);
    expect(media?.alt).toBe('供端到端驗證使用的青色方形');
    expect(media?.mime).toBe('image/webp');
    await page.goto('/admin/about');
    await page.getByLabel('Display name', { exact: true }).fill('後台驗收站長');
    await page
      .getByLabel('Homepage introduction (Markdown)')
      .fill(
        "# I'm **Andy**\n\nSoftware development notes and personal projects.\n\n[Open-source projects](https://example.com)\n\n<script>window.homeIntroUnsafe = true</script>",
      );
    await page.getByLabel('Short bio', { exact: true }).fill('這是驗收過程中建立的個人簡介。');
    await page
      .getByLabel('About me', { exact: true })
      .fill('# About Me\n\n**This Markdown content should render correctly.**');
    await page.getByRole('button', { name: 'Choose image', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose image' });
    await picker
      .locator('.admin-media-card')
      .filter({ hasText: fileName })
      .getByRole('button', { name: /Choose image/ })
      .click();
    await expect(picker).toHaveCount(0);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();
    const updated = await requestJson<SiteSettings>(page.request, baseURL!, '/api/admin/settings');
    expect(updated.avatar).toBe(media!.url);
    expect(updated.authorName).toBe('後台驗收站長');
    expect(updated.homeIntro).toContain("# I'm **Andy**");
    await page.goto('/');
    await expect(page.getByRole('heading', { name: "I'm Andy" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open-source projects' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(await page.evaluate(() => (window as any).homeIntroUnsafe)).toBeUndefined();
    expect(await page.locator('.home-intro-markdown').innerHTML()).not.toContain('<script');
    expect(await (await page.request.get('/about')).text()).toContain('About Me');
    await page.goto('/admin/media');
    card = page.locator('.admin-media-card').filter({ hasText: fileName });
    await expect(
      card.getByRole('button', { name: `Delete image ${fileName}`, exact: true }),
    ).toBeDisabled();
    await card.locator('summary').click();
    await expect(card.getByText('Site settings / About me', { exact: true })).toBeVisible();
    const rejected = await page.request.delete(`/api/admin/media/${media!.id}`, {
      headers: { Origin: baseURL! },
    });
    expect(rejected.status()).toBe(409);
    await requestJson(page.request, baseURL!, '/api/admin/settings', 'PUT', original);
    await page.reload();
    card = page.locator('.admin-media-card').filter({ hasText: fileName });
    await expect(
      card.getByRole('button', { name: `Delete image ${fileName}`, exact: true }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: `Delete image ${fileName}`, exact: true }).click();
    await expect(card).toHaveCount(0);
    media = undefined;
  } finally {
    await requestJson(page.request, baseURL!, '/api/admin/settings', 'PUT', original);
    if (media)
      await page.request.delete(`/api/admin/media/${media.id}`, { headers: { Origin: baseURL! } });
  }
});

test('failed saves recover and multi-tab conflicts preserve a draft copy', async ({
  page,
  context,
  baseURL,
}) => {
  const created = await requestJson<Entry>(page.request, baseURL!, '/api/admin/entries', 'POST', {
    kind: 'article',
    title: `衝突驗收-${Date.now()}`,
  });
  const route = `/admin/articles/${created.id}`;
  const endpoint = `/api/admin/entries/${created.id}`;
  const firstTitle = '先送出並保留的文章';
  const localTitle = '斷線期間尚未送出的文章';
  await page.goto(route);
  await expect(page.getByLabel('Article title')).toHaveValue(created.content.title);
  await page.route(`**${endpoint}`, (intercepted) =>
    intercepted.request().method() === 'PATCH'
      ? intercepted.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '驗收用暫時離線，請重試。' }),
        })
      : intercepted.continue(),
  );
  await page.getByLabel('Article title').fill(localTitle);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('驗收用暫時離線');
  await expect(page.getByLabel('Article title')).toHaveValue(localTitle);
  await page.unroute(`**${endpoint}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByText('An unsaved local draft was found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore local draft', exact: true }).click();
  await expect(page.getByLabel('Article title')).toHaveValue(localTitle);
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(route);
  await expect(second.getByLabel('Article title')).toHaveValue(localTitle);
  await page.getByLabel('Article title').fill(firstTitle);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const conflictingTitle = '另一個分頁仍在編輯的版本';
  await second.getByLabel('Article title').fill(conflictingTitle);
  await second.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    second.getByText('This content was changed in another tab', { exact: true }),
  ).toBeVisible();
  await expect(second.getByLabel('Article title')).toHaveValue(conflictingTitle);
  const server = await requestJson<Entry>(page.request, baseURL!, endpoint);
  expect(server.content.title).toBe(firstTitle);
  await second.getByRole('button', { name: 'Save as new draft', exact: true }).click();
  await expect(second).not.toHaveURL(route);
  await expect(second.getByLabel('Article title')).toHaveValue(
    `${conflictingTitle} (recovered copy)`,
  );
  const copyId = new URL(second.url()).pathname.split('/').at(-1)!;
  expect(copyId).not.toBe(created.id);
  const copy = await requestJson<Entry>(second.request, baseURL!, `/api/admin/entries/${copyId}`);
  expect(copy.published).toBeNull();
  expect(copy.content.title).toBe(`${conflictingTitle} (recovered copy)`);
  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(
    second.getByText('Moved to trash. You can restore it at any time.', { exact: true }),
  ).toBeVisible();
  await second.getByRole('button', { name: 'Restore content', exact: true }).click();
  await expect(
    second.getByText('Restored as a draft. Review the content before publishing again.', {
      exact: true,
    }),
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
