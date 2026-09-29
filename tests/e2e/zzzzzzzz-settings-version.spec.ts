import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { SettingsSnapshot } from '../../src/lib/settings';
import { signInForFixture } from './helpers/auth';
import { restoreSettingsFixture } from './helpers/settings';

test('設定與關於頁衝突保留未儲存內容，可下載、取消重載並重新編輯', async ({
  page,
  context,
  baseURL,
}) => {
  await signInForFixture(page.request, baseURL!);
  const original = (await (
    await page.request.get('/api/admin/settings')
  ).json()) as SettingsSnapshot;
  const other = await context.newPage();
  const tagline = `已儲存的設定-${Date.now()}`;
  const about = '# 尚未儲存的關於我\n\n這段內容必須保留';
  try {
    await page.goto('/admin/settings');
    await other.goto('/admin/about');
    await expect(page.getByLabel('Tagline', { exact: true })).toBeVisible();
    await expect(other.getByLabel('About me', { exact: true })).toBeVisible();
    await page.getByLabel('Tagline', { exact: true }).fill(tagline);
    await other.getByLabel('About me', { exact: true }).fill(about);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'All settings saved' })).toBeVisible();
    const rejected = other.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/settings') && response.request().method() === 'PUT',
    );
    await other.getByRole('button', { name: 'Save settings', exact: true }).click();
    expect((await rejected).status()).toBe(409);
    const conflict = other.getByRole('region', { name: '設定版本衝突' });
    await expect(conflict).toBeVisible();
    await expect(other.getByLabel('About me', { exact: true })).toHaveValue(about);
    await expect(other.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
    const stored = await (await page.request.get('/api/admin/settings')).json();
    expect(stored.tagline).toBe(tagline);
    expect(stored.about).toBe(original.about);

    for (const width of [375, 768, 1440]) {
      await other.setViewportSize({ width, height: 950 });
      expect(
        await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    }
    const downloadButton = other.getByRole('button', { name: '下載未儲存副本' });
    await downloadButton.focus();
    await expect(downloadButton).toBeFocused();
    const downloadEvent = other.waitForEvent('download');
    await downloadButton.press('Enter');
    const download = await downloadEvent;
    expect(JSON.parse(await readFile((await download.path())!, 'utf8')).about).toBe(about);

    const cancelledReload = other.waitForEvent('dialog').then((dialog) => dialog.dismiss());
    await other.getByRole('button', { name: '重新載入最新設定' }).click();
    await cancelledReload;
    await expect(other.getByRole('button', { name: '重新載入最新設定' })).toBeEnabled();
    await expect(other.getByLabel('About me', { exact: true })).toHaveValue(about);
    await expect(conflict).toBeVisible();
    const confirmedReload = other.waitForEvent('dialog').then((dialog) => dialog.accept());
    await other.getByRole('button', { name: '重新載入最新設定' }).click();
    await confirmedReload;
    await expect(conflict).toHaveCount(0);
    await expect(other.getByLabel('About me', { exact: true })).toHaveValue(original.about);
    await other.getByLabel('About me', { exact: true }).fill(about);
    await other.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(other.getByRole('status').filter({ hasText: 'All settings saved' })).toBeVisible();
    const final = await (await page.request.get('/api/admin/settings')).json();
    expect(final.tagline).toBe(tagline);
    expect(final.about).toBe(about);
    expect(final.version).toBe(original.version + 2);
  } finally {
    await restoreSettingsFixture(page.request, baseURL!, original);
    await other.close();
  }
});
