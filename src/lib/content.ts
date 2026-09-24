import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { db, entries, settings, taxonomies } from './db';
import { defaultSettings } from './defaults';
import { publicSiteSettings } from './view-metrics';
import { defaultHomeIntro } from './home-intro';
import { repairLegacySiteCopy } from './site-copy';
import type { Entry, EntryKind, PublicEntry, Taxonomy, SiteSettings } from './types';

export function serializeEntry(row: typeof entries.$inferSelect): Entry {
  return {
    ...row,
    kind: row.kind as EntryKind,
    publishedAt: row.publishedAt?.toISOString() || null,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() || null,
  };
}
export async function getSettings(): Promise<SiteSettings> {
  const [row] = await db().select().from(settings);
  const merged = repairLegacySiteCopy({
    ...defaultSettings,
    ...publicSiteSettings(row?.value),
    siteUrl: process.env.SITE_URL || row?.value.siteUrl || defaultSettings.siteUrl,
  });
  return { ...merged, homeIntro: merged.homeIntro?.trim() || defaultHomeIntro(merged) };
}
export async function listTaxonomies(
  publicOnly = true,
): Promise<{ categories: Taxonomy[]; tags: Taxonomy[] }> {
  let rows = await db().select().from(taxonomies).orderBy(taxonomies.name);
  if (publicOnly) {
    const published = await allPublished();
    rows = rows.filter((t) =>
      published.some((e) =>
        t.kind === 'category' ? e.category === t.name : e.tags.includes(t.name),
      ),
    );
  }
  return {
    categories: rows.filter((r) => r.kind === 'category') as Taxonomy[],
    tags: rows.filter((r) => r.kind === 'tag') as Taxonomy[],
  };
}
const visible = () => and(isNull(entries.deletedAt), isNotNull(entries.published));
function asPublic(row: typeof entries.$inferSelect): PublicEntry {
  return {
    ...row.published!,
    id: row.id,
    kind: row.kind as EntryKind,
    publishedAt: row.publishedAt!.toISOString(),
    updatedAt: row.publishedAt!.toISOString(),
  };
}
export async function listPublished(opts: {
  kind: EntryKind;
  q?: string;
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  featured?: boolean;
}) {
  const parts = [visible(), eq(entries.kind, opts.kind)];
  if (opts.q) {
    const term = `%${opts.q.slice(0, 200).replace(/[\\%_]/g, '\\$&')}%`;
    parts.push(
      sql`(${entries.published}->>'title' ILIKE ${term} OR ${entries.published}->>'excerpt' ILIKE ${term} OR ${entries.published}->>'body' ILIKE ${term})`,
    );
  }
  if (opts.category) parts.push(sql`${entries.published}->>'category' = ${opts.category}`);
  if (opts.tag)
    parts.push(sql`${entries.published}->'tags' @> ${JSON.stringify([opts.tag])}::jsonb`);
  if (opts.featured) parts.push(sql`${entries.published}->>'featured' = 'true'`);
  const where = and(...parts);
  const [count] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(entries)
    .where(where);
  const total = count?.total || 0;
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 12));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.trunc(opts.page || 1) || 1));
  const rows = await db()
    .select()
    .from(entries)
    .where(where)
    // The UI promises "Newest first". Featured posts must not displace newer posts.
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows.map(asPublic), total, page, pages };
}
export async function getPublished(kind: EntryKind, slug: string): Promise<PublicEntry | null> {
  const [row] = await db()
    .select()
    .from(entries)
    .where(and(visible(), eq(entries.kind, kind), sql`${entries.published}->>'slug' = ${slug}`));
  return row ? asPublic(row) : null;
}
export async function allPublished(): Promise<PublicEntry[]> {
  return (
    await db().select().from(entries).where(visible()).orderBy(desc(entries.publishedAt))
  ).map(asPublic);
}
