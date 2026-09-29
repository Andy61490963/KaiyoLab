import { expect, type APIRequestContext } from '@playwright/test';
import type { SiteSettings } from '../../../src/lib/types';

export async function restoreSettingsFixture(
  request: APIRequestContext,
  origin: string,
  original: SiteSettings,
) {
  const current = await request.get('/api/admin/settings');
  expect(current.ok(), await current.text()).toBe(true);
  const { version } = await current.json();
  const restored = await request.put('/api/admin/settings', {
    headers: { Origin: origin },
    data: { ...original, version },
  });
  expect(restored.ok(), await restored.text()).toBe(true);
}
