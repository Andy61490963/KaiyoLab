import { db, media, entries, settings } from './db';
import { sql } from 'drizzle-orm';
import { HttpError } from './http';
import type { Media } from './types';
export const mediaUrl = (id: string) => `/media/${id}.webp`;
export async function mediaUsages(database: ReturnType<typeof db>, id: string) {
  const url = mediaUrl(id);
  const all = await database.select().from(entries);
  const [config] = await database.select().from(settings);
  const usedBy: string[] = [];
  for (const e of all) {
    if (JSON.stringify(e.content).includes(url))
      usedBy.push(`${e.content.title}（草稿${e.deletedAt ? '／垃圾桶' : ''}）`);
    if (e.published && JSON.stringify(e.published).includes(url))
      usedBy.push(`${e.published.title}（公開版本）`);
  }
  if (config && JSON.stringify(config.value).includes(url)) usedBy.push('網站設定／關於我');
  return usedBy;
}
export async function listMedia(): Promise<Media[]> {
  const all = await db()
    .select()
    .from(media)
    .orderBy(sql`${media.createdAt} DESC`);
  return Promise.all(
    all.map(async (m) => ({
      ...m,
      url: mediaUrl(m.id),
      createdAt: m.createdAt.toISOString(),
      usedBy: await mediaUsages(db(), m.id),
    })),
  );
}
export async function ensureMedia(database: ReturnType<typeof db>, value: unknown) {
  const ids = [
    ...new Set(
      [...JSON.stringify(value).matchAll(/\/media\/([a-f0-9-]+)\.webp/g)].map((m) => m[1]),
    ),
  ];
  if (!ids.length) return;
  const known = new Set((await database.select({ id: media.id }).from(media)).map((m) => m.id));
  if (ids.some((id) => !known.has(id)))
    throw new HttpError(400, '內容引用了不存在的媒體，請重新選擇圖片');
}
export async function lockContent(database: ReturnType<typeof db>) {
  await database.execute(sql`SELECT pg_advisory_xact_lock(620215)`);
}
