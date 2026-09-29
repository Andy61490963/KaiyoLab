import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, settings } from './db';
import { defaultSettings } from './defaults';
import { defaultHomeIntro } from './home-intro';
import { HttpError, settingsSchema } from './http';
import { ensureMedia, lockContent } from './media';
import { repairLegacySiteCopy } from './site-copy';
import type { SiteSettings } from './types';

export type SettingsSnapshot = SiteSettings & { version: number };
const updateSchema = settingsSchema.extend({ version: z.number().int().positive() });

function snapshot(row: typeof settings.$inferSelect): SettingsSnapshot {
  const merged = repairLegacySiteCopy({
    ...defaultSettings,
    ...row.value,
    siteUrl: process.env.SITE_URL || row.value.siteUrl || defaultSettings.siteUrl,
  });
  return {
    ...merged,
    homeIntro: merged.homeIntro?.trim() || defaultHomeIntro(merged),
    version: row.version,
  };
}

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  const [row] = await db().select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new HttpError(404, '網站尚未完成初始化');
  return snapshot(row);
}

export async function saveSettingsSnapshot(input: unknown): Promise<SettingsSnapshot> {
  const { version, ...value } = updateSchema.parse(input);
  value.siteUrl = process.env.SITE_URL || value.siteUrl;
  return db().transaction(async (tx) => {
    const database = tx as unknown as ReturnType<typeof db>;
    await lockContent(database);
    const [current] = await tx.select().from(settings).where(eq(settings.id, 1));
    if (!current || current.version !== version)
      throw new HttpError(409, '設定已在其他分頁或匯入操作中變更，請先重新載入最新設定');
    await ensureMedia(database, value);
    const [updated] = await tx
      .update(settings)
      .set({ value, version: version + 1 })
      .where(and(eq(settings.id, 1), eq(settings.version, version)))
      .returning();
    if (!updated) throw new HttpError(409, '設定版本已變更，請先重新載入最新設定');
    return snapshot(updated);
  });
}
