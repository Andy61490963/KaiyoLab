import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { Entry } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

let state: Awaited<ReturnType<BrowserContext['storageState']>>;
const createdIds: string[] = [];
const body = '# Recovery body\n\nKeep this Markdown and the draft metadata.\n';

 test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ baseURL });
  try {
    await signInForFixture(context.request, baseURL!);
    state = await context.storageState();
  } finally {
    await context.close();
  }
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(state.cookies);
  await page.addInitScript(() => localStorage.setItem('kaiyo-admin-language', 'en'));
});
test.afterAll(async ({ browser, baseURL }) => {
  if (!state) return;
  const context = await browser.newContext({ baseURL, storageState: state });
  try {
    for (const id of createdIds) {
      const response = await context.request.get(`/api/admin/entries/${id}`);
      if (!response.ok()) continue;
      const entry = (await response.json()) as Entry;
      if (!entry.deletedAt)
        await context.request.post(`/api/admin/entries/${id}/action`, {
          headers: { Origin: new URL(baseURL!).origin },
          data: { action: 'trash', version: entry.version },
        });
    }
  } finally {
    await context.close();
  }
});

async function fixture(request: APIRequestContext, baseURL: string, missing: boolean) {
  const headers = { Origin: new URL(baseURL).origin };
  const created = await request.post('/api/admin/entries', {
    headers,
    data: { kind: 'article', title: 'Draft body safety fixture' },
  });
  expect(created.ok()).toBe(true);
  let entry = (await created.json()) as Entry;
  createdIds.push(entry.id);
  const saved = await request.patch(`/api/admin/entries/${entry.id}`, {
    headers,
    data: { version: entry.version, content: { ...entry.content, body } },
  });
  expect(saved.ok()).toBe(true);
  entry = (await saved.json()) as Entry;
  const published = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers,
    data: { version: entry.version, action: 'publish' },
  });
  expect(published.ok()).toBe(true);
  entry = (await published.json()) as Entry;
  if (missing) {
    const cleared = await request.patch(`/api/admin/entries/${entry.id}`, {
      headers,
      data: {
        version: entry.version,
        content: { ...entry.content, body: '', slug: `${entry.content.slug}-edited`, tags: ['Backend'] },
        confirmEmptyBody: true,
      },
    });
    expect(cleared.ok()).toBe(true);
    entry = (await cleared.json()) as Entry;
  }
  return entry;
}
async function ready(page: Page, entry: Entry) {
  await page.goto(`/admin/articles/${entry.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
}
async function latest(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/admin/entries/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Entry;
}

test('opening an empty draft is read-only; recovery saves pending metadata and restores only the body', async ({ page, baseURL }) => {
  const entry = await fixture(page.request, baseURL!, true);
  let patches = 0;
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/entries/${entry.id}`)) patches++;
  });
  await ready(page, entry);
  await expect(page.getByRole('button', { name: 'Restore published body' })).toBeVisible();
  // Longer than the autosave debounce: opening this state must not mutate the server.
  await page.waitForTimeout(1400);
  expect(patches).toBe(0);
  expect((await latest(page.request, entry.id)).version).toBe(entry.version);
  await page.getByLabel('Article title', { exact: true }).fill('Keep my pending title');
  await page.getByRole('button', { name: 'Restore published body' }).click();
  await expect(page.locator('.cm-content')).toContainText('Recovery body');
  const recovered = await latest(page.request, entry.id);
  expect(recovered.content).toEqual({ ...entry.content, title: 'Keep my pending title', body });
  expect(recovered.published).toEqual(entry.published);
  expect(recovered.publishedUpdatedAt).toBe(entry.publishedUpdatedAt);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Recovery body');
});

test('clearing the editor cannot autosave; cancellation keeps the server body and confirmation is explicit', async ({ page, baseURL }) => {
  const entry = await fixture(page.request, baseURL!, false);
  await ready(page, entry);
  const editor = page.locator('.cm-content');
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await editor.press('Backspace');
  await expect(page.getByRole('button', { name: 'Keep saved body' })).toBeVisible();
  await page.waitForTimeout(1400);
  expect((await latest(page.request, entry.id)).content.body).toBe(body);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  expect((await latest(page.request, entry.id)).content.body).toBe(body);
  await page.getByRole('button', { name: 'Keep saved body' }).click();
  await expect(editor).toContainText('Recovery body');
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await editor.press('Backspace');
  page.once('dialog', (dialog) => dialog.accept());
  const response = page.waitForResponse((value) =>
    value.request().method() === 'PATCH' && value.url().endsWith(`/entries/${entry.id}`),
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await response).status()).toBe(200);
  expect((await response).request().postDataJSON().confirmEmptyBody).toBe(true);
  const cleared = await latest(page.request, entry.id);
  expect(cleared.content.body).toBe('');
  expect(cleared.published).toEqual(entry.published);
});

test('a stale recovery never overwrites a body saved by another tab', async ({ page, baseURL }) => {
  const entry = await fixture(page.request, baseURL!, true);
  await ready(page, entry);
  const changed = await page.request.patch(`/api/admin/entries/${entry.id}`, {
    headers: { Origin: new URL(baseURL!).origin },
    data: { version: entry.version, content: { ...entry.content, body: 'Newer work in another tab' } },
  });
  expect(changed.ok()).toBe(true);
  await page.getByRole('button', { name: 'Restore published body' }).click();
  await expect(page.getByText('This content was changed in another tab', { exact: true })).toBeVisible();
  const current = await latest(page.request, entry.id);
  expect(current.content.body).toBe('Newer work in another tab');
  expect(current.published).toEqual(entry.published);
});
