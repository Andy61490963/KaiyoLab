import { test, expect } from '@playwright/test';
import { signInForFixture } from './helpers/auth';

test('分類標籤超過一頁時新增與改名可見，刪除回有效頁並保留搜尋', async ({ page, baseURL }) => {
  await signInForFixture(page.request, baseURL!);
  const headers = { Origin: baseURL! };
  const prefix = `taxonomy-position-${Date.now()}`;
  const ids: string[] = [];
  try {
    for (let index = 0; index < 10; index++) {
      const response = await page.request.post('/api/admin/taxonomies', {
        headers,
        data: { kind: 'tag', name: `${prefix}-${String(index).padStart(2, '0')}` },
      });
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).id);
    }
    await page.goto('/admin/taxonomies');
    const panel = page
      .locator('section.admin-panel')
      .filter({ has: page.getByRole('heading', { name: 'Tag', exact: true }) });
    const search = panel.getByRole('searchbox', { name: 'Search tag items' });
    await search.fill(prefix);
    await expect(panel.getByText('Showing 1–10 of 10', { exact: true })).toBeVisible();
    const row = (name: string) =>
      panel
        .locator('.admin-taxonomy-list > div')
        .filter({ has: page.getByText(`# ${name}`, { exact: true }) });
    async function add(name: string) {
      await panel.getByLabel('Tag name', { exact: true }).fill(name);
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/admin/taxonomies') &&
            response.request().method() === 'POST',
        ),
        panel.getByRole('button', { name: 'Add tag', exact: true }).click(),
      ]);
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).id);
      await expect(row(name)).toBeVisible();
      await expect(row(name)).toBeFocused();
    }
    const name = `${prefix}-99`;
    await add(name);
    await expect(search).toHaveValue(prefix);
    await expect(panel.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(panel.getByText('Showing 11–11 of 11', { exact: true })).toBeVisible();
    const early = `${prefix}-01a`;
    await row(name).getByRole('button', { name: 'Edit', exact: true }).click();
    await panel.getByLabel('Tag name', { exact: true }).fill(early);
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(row(early)).toBeVisible();
    await expect(row(early)).toBeFocused();
    await expect(panel.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const last = `${prefix}-100`;
    await row(early).getByRole('button', { name: 'Edit', exact: true }).click();
    await panel.getByLabel('Tag name', { exact: true }).fill(last);
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(row(last)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await row(last)
      .getByRole('button', { name: `Delete tag ${last}`, exact: true })
      .click();
    await expect(row(last)).toHaveCount(0);
    await expect(panel.getByText('Showing 1–10 of 10', { exact: true })).toBeVisible();
    await expect(panel.getByRole('navigation', { name: 'Tag pagination' })).toHaveCount(0);
    const outside = `outside-filter-${Date.now()}`;
    await add(outside);
    await expect(search).toHaveValue(prefix);
    await expect(
      panel.getByText(/This item is temporarily shown while your search is preserved/),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Show search results only', exact: true }).click();
    await expect(row(outside)).toHaveCount(0);
    await expect(search).toHaveValue(prefix);
    await expect(panel.getByText('Showing 1–10 of 10', { exact: true })).toBeVisible();
  } finally {
    for (const id of ids) {
      const response = await page.request.delete(`/api/admin/taxonomies/${id}`, { headers });
      expect([200, 404]).toContain(response.status());
    }
  }
});
