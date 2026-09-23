import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { Entry, Media, SiteSettings } from '../../src/lib/types';
let state: Awaited<ReturnType<BrowserContext['storageState']>>;
let editorEntry: Entry;
let image: Media;

// Reuse one session rather than bypassing the production sign-in rate limit.
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const response = await context.request.post('/api/auth/sign-in/email', {
      headers: { Origin: baseURL! },
      data: {
        email: process.env.E2E_EMAIL || 'e2e@example.test',
        password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026',
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    state = await context.storageState();
    const created = await context.request.post('/api/admin/entries', {
      headers: { Origin: baseURL! },
      data: { kind: 'article', title: 'Building reliable software' },
    });
    expect(created.ok()).toBe(true);
    editorEntry = (await created.json()) as Entry;
    const saved = await context.request.patch(`/api/admin/entries/${editorEntry.id}`, {
      headers: { Origin: baseURL! },
      data: {
        version: editorEntry.version,
        content: {
          ...editorEntry.content,
          excerpt: 'Notes on clear boundaries, useful tests, and small changes.',
          body: '# Building reliable software\n\nGood software starts with clear boundaries and small, deliberate changes.\n\n## Start with the behavior\n\n- Keep a useful regression test.\n- Make one change at a time.\n- Review the result on a real screen.\n\n```csharp\npublic sealed record Note(string Title, string Body);\n```',
        },
      },
    });
    expect(saved.ok()).toBe(true);
    editorEntry = (await saved.json()) as Entry;
    const png = await sharp({
      create: { width: 96, height: 64, channels: 3, background: '#e9dfc9' },
    })
      .png()
      .toBuffer();
    const uploaded = await context.request.post('/api/admin/media', {
      headers: { Origin: baseURL! },
      multipart: {
        file: { name: 'editorial-sample.png', mimeType: 'image/png', buffer: png },
        alt: 'A neutral sample image for UI tests',
      },
    });
    expect(uploaded.ok()).toBe(true);
    image = (await uploaded.json()) as Media;
  } finally {
    await context.close();
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(state.cookies);
});
test.afterAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: state });
  try {
    if (image)
      await context.request.delete(`/api/admin/media/${image.id}`, {
        headers: { Origin: baseURL! },
      });
    if (editorEntry) {
      const response = await context.request.get(`/api/admin/entries/${editorEntry.id}`);
      const latest = (await response.json()) as Entry;
      await context.request.post(`/api/admin/entries/${latest.id}/action`, {
        headers: { Origin: baseURL! },
        data: { action: 'trash', version: latest.version },
      });
    }
  } finally {
    await context.close();
  }
});
async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.admin-loading')).toHaveCount(0);
}

test('English admin screens fit five widths in both themes', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const routes = [
    '/admin',
    '/admin/articles',
    '/admin/projects',
    '/admin/media',
    '/admin/taxonomies',
    '/admin/about',
    '/admin/settings',
    `/admin/articles/${editorEntry.id}`,
  ];
  await page.goto('/admin');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('kaiyo-theme', value), theme);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await ready(page, route);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${route} ${width}px ${theme}`,
        ).toBe(true);
        if (
          [375, 1440].includes(width) &&
          ['/admin', '/admin/media', '/admin/about', `/admin/articles/${editorEntry.id}`].includes(
            route,
          )
        ) {
          const name = route.endsWith(editorEntry.id)
            ? 'editor'
            : route === '/admin'
              ? 'overview'
              : route.split('/').at(-1);
          await testInfo.attach(`admin-${name}-${theme}-${width}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
        }
      }
    }
  }
  expect(errors).toEqual([]);
  const guest = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 } });
  try {
    const login = await guest.newPage();
    await login.goto('/login');
    await expect(login.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(login.locator('html')).toHaveAttribute('lang', 'en');
    expect(await login.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await testInfo.attach('login-mobile', {
      body: await login.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  } finally {
    await guest.close();
  }
});

test('mobile navigation returns focus and closes when resized', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page, '/admin');
  const trigger = page.getByRole('button', { name: 'Open admin menu', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Admin menu', exact: true });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
});

test('filters persist in the URL and dashboard links cover both content kinds', async ({
  page,
}) => {
  await ready(page, '/admin/articles?q=reliable&status=draft');
  await expect(page.getByRole('searchbox', { name: 'Search articles' })).toHaveValue('reliable');
  await expect(page.getByRole('button', { name: 'Draft', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);
  await page.getByRole('searchbox', { name: 'Search articles' }).fill('unmatched-search-term');
  await expect(page).toHaveURL(/q=unmatched-search-term/);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search articles' })).toHaveValue(
    'unmatched-search-term',
  );
  await ready(page, '/admin');
  for (const [title, status] of [
    ['Drafts', 'draft'],
    ['Trash', 'trash'],
  ]) {
    const card = page
      .locator('.admin-stat')
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(card.getByRole('link', { name: 'Articles' })).toHaveAttribute(
      'href',
      `/admin/articles?status=${status}`,
    );
    await expect(card.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      `/admin/projects?status=${status}`,
    );
  }
});

test('editor view, save shortcut, and recovery decision do not publish or erase drafts', async ({
  page,
}) => {
  await ready(page, `/admin/articles/${editorEntry.id}`);
  await page.getByLabel('Article title').fill('Saved using the keyboard');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const currentResponse = await page.request.get(`/api/admin/entries/${editorEntry.id}`);
  const current = (await currentResponse.json()) as Entry;
  expect(current.content.title).toBe('Saved using the keyboard');
  expect(current.published).toBeNull();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.admin-markdown-input')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Content preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Write', exact: true }).click();
  await expect(page.locator('.admin-markdown-input')).toBeVisible();
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.locator('.admin-markdown-input')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Content preview' })).toBeVisible();
  const local = {
    content: { ...current.content, title: 'Keep this local recovery draft' },
    at: new Date().toISOString(),
    version: current.version,
  };
  await page.evaluate(
    ({ id, local }) => localStorage.setItem(`kaiyo-draft-${id}`, JSON.stringify(local)),
    { id: editorEntry.id, local },
  );
  await page.reload();
  await expect(page.getByText('An unsaved local draft was found', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Article title')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`kaiyo-draft-${id}`)!).content.title,
      editorEntry.id,
    ),
  ).toBe(local.content.title);
  await page.getByRole('button', { name: 'Use server version', exact: true }).click();
  await expect(page.getByLabel('Article title')).toBeEnabled();
  await expect(page.getByLabel('Article title')).toHaveValue(current.content.title);
});

test('settings warn before sign-out and retain edits typed during a save', async ({
  page,
  baseURL,
}) => {
  const response = await page.request.get('/api/admin/settings');
  const original = (await response.json()) as SiteSettings;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await ready(page, '/admin/settings');
    await page.getByLabel('Tagline', { exact: true }).fill('First submitted change');
    let signOutRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/sign-out')) signOutRequests++;
    });
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect(signOutRequests).toBe(0);
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await page.route('**/api/admin/settings', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      const upstream = await route.fetch();
      await gate;
      await route.fulfill({ response: upstream });
    });
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await page.getByLabel('Tagline', { exact: true }).fill('A newer edit made during save');
    release();
    await expect(page.getByLabel('Tagline', { exact: true })).toHaveValue(
      'A newer edit made during save',
    );
    await expect(
      page.getByRole('status').filter({ hasText: 'You still have unsaved changes.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
    await page.unroute('**/api/admin/settings');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'All settings saved' })).toBeVisible();
  } finally {
    release();
    await page.unroute('**/api/admin/settings');
    await page.request.put('/api/admin/settings', {
      headers: { Origin: baseURL! },
      data: original,
    });
  }
});

test('media search is keyboard accessible and resettable', async ({ page }) => {
  await ready(page, '/admin/media');
  const search = page.getByRole('searchbox', { name: 'Search media', exact: true });
  await search.fill('editorial-sample');
  await expect(page.locator('.admin-media-card')).toHaveCount(1);
  await search.fill('no-matching-image');
  await expect(page.getByRole('heading', { name: 'No matching images' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(
    page.locator('.admin-media-card').filter({ hasText: 'editorial-sample.png' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Upload image', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Upload image', exact: true })).toBeFocused();
});
