import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Entry, EntryContent, EntryKind, EntryRevision } from '../../src/lib/types';
import { signInForFixture } from './helpers/auth';

const prefix = `發布差異驗收-${Date.now()}`;
const fixtures = new Map<string, EntryKind>();
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
const originalLines = Array.from(
  { length: 30 },
  (_, index) => `保留行-${String(index + 1).padStart(2, '0')}`,
);
originalLines[4] = '舊版報工規則';
originalLines[24] = '舊版鎖定規則';
const changedLines = [...originalLines];
changedLines[4] = '新版報工規則';
changedLines[24] = '新版鎖定規則';
const originalBody = originalLines.join('\n');
const changedBody = changedLines.join('\n');

async function currentEntry(request: APIRequestContext, id: string): Promise<Entry> {
  const response = await request.get(`/api/admin/entries/${id}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function saveContent(
  request: APIRequestContext,
  origin: string,
  entry: Entry,
  changes: Partial<EntryContent>,
): Promise<Entry> {
  expect(fixtures.has(entry.id)).toBe(true);
  const response = await request.patch(`/api/admin/entries/${entry.id}`, {
    headers: { Origin: origin },
    data: { version: entry.version, content: { ...entry.content, ...changes } },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function changeState(
  request: APIRequestContext,
  origin: string,
  entry: Entry,
  action: 'publish' | 'trash',
): Promise<Entry> {
  expect(fixtures.has(entry.id)).toBe(true);
  const response = await request.post(`/api/admin/entries/${entry.id}/action`, {
    headers: { Origin: origin },
    data: { version: entry.version, action },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function createEntry(
  request: APIRequestContext,
  origin: string,
  kind: EntryKind,
  suffix: string,
  body: string,
  published = true,
): Promise<Entry> {
  const created = await request.post('/api/admin/entries', {
    headers: { Origin: origin },
    data: { kind, title: `${prefix}-${suffix}` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  let entry = (await created.json()) as Entry;
  fixtures.set(entry.id, kind);
  entry = await saveContent(request, origin, entry, { body, excerpt: '發布差異驗收摘要' });
  return published ? changeState(request, origin, entry, 'publish') : entry;
}

const collection = (entry: Entry) => (entry.kind === 'article' ? 'articles' : 'projects');
const publicPath = (entry: Entry) => `/${collection(entry)}/${entry.content.slug}`;

async function openEditor(page: Page, entry: Entry) {
  await page.goto(`/admin/${collection(entry)}/${entry.id}`);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.cm-content[contenteditable=true]')).toBeVisible();
}

async function openReview(page: Page, published = true, language: 'en' | 'zh-TW' = 'en') {
  const button = page.getByRole('button', {
    name:
      language === 'en'
        ? published
          ? 'Publish changes'
          : 'Publish content'
        : published
          ? '發布更新'
          : '發布內容',
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole('dialog', {
    name: language === 'en' ? 'Review before publishing' : '發布前檢查',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-content-diff]')).toBeVisible();
  return { dialog, button };
}

async function expectSeparatedHunks(diff: Locator, reverse = false) {
  await expect(diff.locator('[data-diff-hunk]')).toHaveCount(2);
  await expect(diff.locator('[data-diff-range] code')).toHaveText([
    '@@ -2,7 +2,7 @@',
    '@@ -22,7 +22,7 @@',
  ]);
  await expect(diff.locator('[data-diff-kind="context"]')).toHaveCount(12);
  await expect(diff.locator('[data-diff-kind="remove"] [data-diff-text]')).toHaveText(
    reverse ? ['新版報工規則', '新版鎖定規則'] : ['舊版報工規則', '舊版鎖定規則'],
  );
  await expect(diff.locator('[data-diff-kind="add"] [data-diff-text]')).toHaveText(
    reverse ? ['舊版報工規則', '舊版鎖定規則'] : ['新版報工規則', '新版鎖定規則'],
  );
  for (const [index, line] of [5, 25].entries()) {
    const removed = diff.locator('[data-diff-kind="remove"]').nth(index);
    const added = diff.locator('[data-diff-kind="add"]').nth(index);
    await expect(removed).toHaveAttribute('data-old-line', String(line));
    expect(await removed.getAttribute('data-new-line')).toBeNull();
    await expect(added).toHaveAttribute('data-new-line', String(line));
    expect(await added.getAttribute('data-old-line')).toBeNull();
    await expect(removed.locator('[data-diff-marker]')).toHaveText('-');
    await expect(added.locator('[data-diff-marker]')).toHaveText('+');
  }
  await expect(diff.locator('[data-diff-text]').filter({ hasText: /^保留行-15$/ })).toHaveCount(0);
  await expect(diff.locator('[data-diff-text]').filter({ hasText: /^保留行-02$/ })).toHaveCount(1);
  await expect(diff.locator('[data-diff-text]').filter({ hasText: /^保留行-28$/ })).toHaveCount(1);
}

test.beforeAll(async ({ browser, baseURL }) => {
  if (process.env.CAPTURE_PUBLISH_DIFF)
    await mkdir('.local/publish-diff-screenshots', { recursive: true });
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
    // 清理只限本檔記錄的 ID，並重新核對類型、專屬前綴與目前版本
    for (const [id, kind] of fixtures) {
      const response = await context.request.get(`/api/admin/entries/${id}`);
      if (response.status() === 404) continue;
      expect(response.ok(), await response.text()).toBe(true);
      let entry = (await response.json()) as Entry;
      expect(entry.kind).toBe(kind);
      expect(entry.content.title.startsWith(prefix)).toBe(true);
      if (!entry.deletedAt) entry = await changeState(context.request, baseURL!, entry, 'trash');
      const deleted = await context.request.delete(`/api/admin/entries/${id}`, {
        headers: { Origin: baseURL! },
        data: { version: entry.version },
      });
      expect(deleted.ok(), await deleted.text()).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('文章與作品分散修改顯示兩個真實差異區塊，確認前保留公開版本', async ({
  page,
  request,
  baseURL,
}) => {
  for (const kind of ['article', 'project'] as const) {
    const entry = await createEntry(page.request, baseURL!, kind, `分散修改-${kind}`, originalBody);
    await openEditor(page, entry);
    await page.locator('.cm-content[contenteditable=true]').fill(changedBody);
    let { dialog, button } = await openReview(page);
    const diff = dialog.locator('[data-content-diff]');
    await expectSeparatedHunks(diff);
    await expect(diff.getByText('2 removed / 2 added lines', { exact: true })).toBeVisible();
    const saved = await currentEntry(page.request, entry.id);
    expect(saved.content.body).toBe(changedBody);
    expect(saved.published?.body).toBe(originalBody);
    const before = await request.get(publicPath(entry));
    expect(before.ok()).toBe(true);
    expect(await before.text()).toContain('舊版報工規則');
    expect(await before.text()).not.toContain('新版報工規則');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    ({ dialog, button } = await openReview(page));
    await dialog.getByRole('button', { name: 'Confirm publication', exact: true }).click();
    await expect(dialog).toBeHidden();
    const published = await currentEntry(page.request, entry.id);
    expect(published.published?.body).toBe(changedBody);
    expect(published.publishedAt).toBe(entry.publishedAt);
    const after = await request.get(publicPath(entry));
    expect(after.ok()).toBe(true);
    expect(await after.text()).toContain('新版報工規則');
    expect(await after.text()).not.toContain('舊版報工規則');
  }
});

test('只改摘要仍保留欄位比較，完全相同時不產生正文差異', async ({ page, baseURL }) => {
  let entry = await createEntry(page.request, baseURL!, 'article', '欄位與未變更', '相同的正文');
  const originalSummary = entry.content.excerpt;
  entry = await saveContent(page.request, baseURL!, entry, {
    excerpt: '新的摘要與作者自行使用的 + - 符號',
  });
  await openEditor(page, entry);
  let { dialog } = await openReview(page);
  const diff = dialog.locator('[data-content-diff]');
  await expect(diff.getByText('Body unchanged', { exact: true })).toBeVisible();
  await expect(diff.locator('[data-diff-hunk]')).toHaveCount(0);
  const summary = diff.locator('[data-metadata-field="Summary"]');
  await expect(summary.locator('[data-metadata-side="before"]')).toContainText(originalSummary);
  await expect(summary.locator('[data-metadata-side="after"]')).toContainText(
    entry.content.excerpt,
  );
  await page.keyboard.press('Escape');
  entry = await saveContent(page.request, baseURL!, await currentEntry(page.request, entry.id), {
    excerpt: originalSummary,
  });
  await page.reload();
  ({ dialog } = await openReview(page));
  await expect(dialog.getByText('Body unchanged', { exact: true })).toBeVisible();
  await expect(dialog.getByText('No metadata changes', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-diff-hunk], [data-metadata-field]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('首次發布顯示新增、清空正文顯示刪除，HTML 在比較區維持文字', async ({
  page,
  request,
  baseURL,
}) => {
  const unsafe =
    '<img src="diff-xss" onerror="window.__publishDiffExecuted=true"><script>window.__publishDiffExecuted=true</script>';
  const lines = ['首發第一行', '首發第二行', unsafe];
  const body = lines.join('\n');
  const entry = await createEntry(page.request, baseURL!, 'project', '首發與清空', body, false);
  await openEditor(page, entry);
  let { dialog } = await openReview(page, false);
  await expect(dialog.locator('[data-diff-range] code')).toHaveText('@@ -0,0 +1,3 @@');
  await expect(dialog.locator('[data-diff-omitted]')).toHaveCount(0);
  await expect(dialog.locator('[data-diff-kind="add"] [data-diff-text]')).toHaveText(lines);
  await expect(dialog.locator('[data-diff-kind="remove"]')).toHaveCount(0);
  await expect(dialog.getByText('0 removed / 3 added lines', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-content-diff] img, [data-content-diff] script')).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() =>
      Boolean((window as Window & { __publishDiffExecuted?: boolean }).__publishDiffExecuted),
    ),
  ).toBe(false);
  expect((await request.get(publicPath(entry))).status()).toBe(404);
  await dialog.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await request.get(publicPath(entry))).status()).toBe(200);
  const bodyEditor = page.locator('.cm-content[contenteditable=true]');
  await bodyEditor.press('ControlOrMeta+A');
  await bodyEditor.press('Backspace');
  await expect(bodyEditor).toHaveText('');
  // Clearing a saved body now requires an explicit save and confirmation.
  // Keep every diff/XSS/publication assertion below; do not weaken the safety gate.
  expect((await currentEntry(page.request, entry.id)).content.body).toBe(body);
  const confirmationPromise = page.waitForEvent('dialog');
  const savePromise = page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const confirmation = await confirmationPromise;
  const confirmationType = confirmation.type();
  const confirmationMessage = confirmation.message();
  await confirmation.accept();
  await savePromise;
  expect(confirmationType).toBe('confirm');
  expect(confirmationMessage).toContain('Save an empty draft body?');
  await expect.poll(async () => (await currentEntry(page.request, entry.id)).content.body).toBe('');
  ({ dialog } = await openReview(page));
  await expect(dialog.locator('[data-diff-range] code')).toHaveText('@@ -1,3 +0,0 @@');
  await expect(dialog.locator('[data-diff-kind="remove"] [data-diff-text]')).toHaveText(lines);
  await expect(dialog.locator('[data-diff-kind="add"]')).toHaveCount(0);
  await expect(dialog.getByText('3 removed / 0 added lines', { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-content-diff] img, [data-content-diff] script')).toHaveCount(
    0,
  );
  const saved = await currentEntry(page.request, entry.id);
  expect(saved.content.body).toBe('');
  expect(saved.published?.body).toBe(body);
  expect(await (await request.get(publicPath(entry))).text()).toContain('首發第一行');
  expect(
    await page.evaluate(() =>
      Boolean((window as Window & { __publishDiffExecuted?: boolean }).__publishDiffExecuted),
    ),
  ).toBe(false);
  await page.keyboard.press('Escape');
});

test('版本紀錄共用差異顯示且維持目前草稿到選取版本的還原方向', async ({
  page,
  request,
  baseURL,
}) => {
  let entry = await createEntry(page.request, baseURL!, 'article', '歷史方向', originalBody);
  const history = await page.request.get(`/api/admin/history/${entry.id}`);
  expect(history.ok()).toBe(true);
  const selected = ((await history.json()).items as EntryRevision[]).find(
    (revision) => revision.source === 'published',
  )!;
  expect(selected).toBeTruthy();
  entry = await saveContent(page.request, baseURL!, entry, { body: changedBody });
  entry = await changeState(page.request, baseURL!, entry, 'publish');
  await openEditor(page, entry);
  const trigger = page.getByRole('button', { name: 'Version history', exact: true });
  await trigger.click();
  let dialog = page.getByRole('dialog', { name: 'Version history', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Saved version').selectOption(selected.id);
  await expect(
    dialog.getByText('Comparison: current draft → selected version', { exact: true }),
  ).toBeVisible();
  await expectSeparatedHunks(dialog.locator('[data-content-diff]'), true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  dialog = page.getByRole('dialog', { name: 'Version history', exact: true });
  await dialog.getByLabel('Saved version').selectOption(selected.id);
  await dialog.getByRole('button', { name: 'Restore as draft', exact: true }).click();
  await expect(dialog).toBeHidden();
  const restored = await currentEntry(page.request, entry.id);
  expect(restored.content.body).toBe(originalBody);
  expect(restored.published?.body).toBe(changedBody);
  expect(await (await request.get(publicPath(entry))).text()).toContain('新版報工規則');
});

test('差異視窗在中英文、明暗主題與三種尺寸中可閱讀及鍵盤關閉', async ({
  page,
  baseURL,
}, testInfo) => {
  let entry = await createEntry(page.request, baseURL!, 'article', '排版', originalBody);
  entry = await saveContent(page.request, baseURL!, entry, { body: changedBody });
  await openEditor(page, entry);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const language of ['zh-TW', 'en'] as const) {
        await page
          .getByRole('button', { name: language === 'en' ? 'English' : '繁體中文', exact: true })
          .click();
        const { dialog, button } = await openReview(page, true, language);
        await expectSeparatedHunks(dialog.locator('[data-content-diff]'));
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        const confirm = dialog.getByRole('button', {
          name: language === 'en' ? 'Confirm publication' : '確認發布',
          exact: true,
        });
        await confirm.focus();
        await expect(confirm).toBeFocused();
        await expect(confirm).toBeVisible();
        if (
          (language === 'zh-TW' && theme === 'light') ||
          (language === 'en' && theme === 'dark')
        ) {
          if (process.env.CAPTURE_PUBLISH_DIFF && width !== 768)
            await page.screenshot({
              path: `.local/publish-diff-screenshots/publish-diff-${width}-${language}-${theme}.png`,
              animations: 'disabled',
            });
          if (process.env.CAPTURE_PUBLISH_DIFF && width === 1440 && language === 'zh-TW')
            await dialog.screenshot({
              path: '.local/publish-diff-screenshots/publish-review.png',
              animations: 'disabled',
            });
          await testInfo.attach(`發布差異-${width}-${language}-${theme}`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(button).toBeFocused();
      }
    }
  }
  expect(errors).toEqual([]);
});
