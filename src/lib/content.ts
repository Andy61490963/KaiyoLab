import { and, asc, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { db, entries, entrySlugs, settings, taxonomies } from './db';
import { defaultSettings } from './defaults';
import { defaultHomeIntro } from './home-intro';
import { repairLegacySiteCopy } from './site-copy';
import { paginate } from './listing';
import type { Entry, EntryKind, PublicEntry, Taxonomy, SiteSettings } from './types';

export function serializeEntry(row: typeof entries.$inferSelect): Entry {
  return {
    ...row,
    kind: row.kind as EntryKind,
    publishedAt: row.publishedAt?.toISOString() || null,
    publishedUpdatedAt: row.publishedUpdatedAt?.toISOString() || null,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() || null,
  };
}
export async function getSettings(): Promise<SiteSettings> {
  const [row] = await db().select().from(settings);
  const merged = repairLegacySiteCopy({
    ...defaultSettings,
    ...row?.value,
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
    updatedAt: (row.publishedUpdatedAt || row.publishedAt)!.toISOString(),
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
  sort?: string;
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
  const page = paginate(count?.total || 0, opts.page, opts.pageSize);
  // Sort the complete published result before LIMIT/OFFSET, never private drafts.
  // An ID tie-breaker prevents duplicate/missing rows when dates or titles match.
  const title = sql`lower(${entries.published}->>'title')`;
  const order =
    opts.sort === 'oldest'
      ? [asc(entries.publishedAt), asc(entries.id)]
      : opts.sort === 'title-asc'
        ? [asc(title), asc(entries.id)]
        : opts.sort === 'title-desc'
          ? [desc(title), desc(entries.id)]
          : [desc(entries.publishedAt), desc(entries.id)];
  const rows = await db()
    .select()
    .from(entries)
    .where(where)
    .orderBy(...order)
    .limit(page.pageSize)
    .offset((page.page - 1) * page.pageSize);
  return { items: rows.map(asPublic), ...page };
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

export async function publishedRedirect(kind: EntryKind, slug: string): Promise<string | null> {
  const [row] = await db()
    .select({ published: entries.published })
    .from(entrySlugs)
    .innerJoin(entries, eq(entries.id, entrySlugs.entryId))
    .where(and(eq(entrySlugs.kind, kind), eq(entrySlugs.slug, slug), visible()));
  const current = row?.published?.slug;
  if (!current || current === slug) return null;
  return `/${kind === 'article' ? 'articles' : 'projects'}/${encodeURIComponent(current)}`;
}

export async function seriesNavigation(entry: PublicEntry) {
  if (!entry.series?.trim()) return { items: [], previous: null, next: null };
  const rows = await db()
    .select()
    .from(entries)
    .where(
      and(
        visible(),
        eq(entries.kind, 'article'),
        sql`${entries.published}->>'series' = ${entry.series}`,
      ),
    )
    .orderBy(
      sql`COALESCE((${entries.published}->>'seriesOrder')::integer, 0)`,
      asc(entries.publishedAt),
      asc(entries.id),
    );
  const items = rows.map(asPublic);
  const index = items.findIndex((item) => item.id === entry.id);
  return {
    items,
    previous: index > 0 ? items[index - 1] : null,
    next: index >= 0 ? items[index + 1] || null : null,
  };
}
