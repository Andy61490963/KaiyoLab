import { and, asc, desc, eq, isNull, isNotNull, or, sql } from 'drizzle-orm';
import { db, entries, media, settings } from './db';
import { serializeEntry } from './content';
import { mediaUrl } from './media';
import { adminEntryList, adminMediaList, literalLike, paginate, readListing } from './listing';

export async function listAdminEntries(params: URLSearchParams) {
  const options = readListing(params, adminEntryList);
  const kind = params.get('kind');
  const status = params.get('status');
  const category = params.get('category');
  const q = (params.get('q') || '').trim().slice(0, 200);
  const parts = [status === 'trash' ? isNotNull(entries.deletedAt) : isNull(entries.deletedAt)];
  if (kind) parts.push(eq(entries.kind, kind));
  if (status === 'draft') parts.push(isNull(entries.published));
  if (status === 'published') parts.push(isNotNull(entries.published));
  if (category) parts.push(sql`${entries.content}->>'category' = ${category}`);
  if (q) {
    const term = literalLike(q);
    parts.push(sql`(${entries.content}->>'title' ILIKE ${term} OR ${entries.content}->>'excerpt' ILIKE ${term})`);
  }
  const where = and(...parts);
  const [count] = await db().select({ total: sql<number>`count(*)::int` }).from(entries).where(where);
  const page = paginate(count?.total || 0, options.page, options.pageSize);
  const title = sql`lower(${entries.content}->>'title')`;
  const order = options.sort === 'title-asc' ? [asc(title), asc(entries.id)]
    : options.sort === 'title-desc' ? [desc(title), desc(entries.id)]
      : options.sort === 'updated-asc' ? [asc(entries.updatedAt), asc(entries.id)]
        : [desc(entries.updatedAt), desc(entries.id)];
  const rows = await db().select().from(entries).where(where).orderBy(...order)
    .limit(page.pageSize).offset((page.page - 1) * page.pageSize);
  return { ...page, items: rows.map(serializeEntry) };
}

export async function listAdminMedia(params: URLSearchParams) {
  const options = readListing(params, adminMediaList);
  const q = (params.get('q') || '').trim().slice(0, 200);
  const term = literalLike(q);
  const where = q ? sql`(${media.name} ILIKE ${term} OR ${media.alt} ILIKE ${term})` : undefined;
  const [count] = await db().select({ total: sql<number>`count(*)::int` }).from(media).where(where);
  const page = paginate(count?.total || 0, options.page, options.pageSize);
  const name = sql`lower(${media.name})`;
  const order = options.sort === 'name-asc' ? [asc(name), asc(media.id)]
    : options.sort === 'name-desc' ? [desc(name), desc(media.id)]
      : options.sort === 'size-desc' ? [desc(media.size), desc(media.id)]
        : options.sort === 'size-asc' ? [asc(media.size), asc(media.id)]
          : options.sort === 'oldest' ? [asc(media.createdAt), asc(media.id)]
            : [desc(media.createdAt), desc(media.id)];
  const rows = await db().select().from(media).where(where).orderBy(...order)
    .limit(page.pageSize).offset((page.page - 1) * page.pageSize);
  if (!rows.length) return { ...page, items: [] };
  // Resolve usage for this page in two queries, not two whole-table reads per image.
  const references = or(...rows.map((row) => {
    const reference = `%${mediaUrl(row.id)}%`;
    return sql`(${entries.content}::text LIKE ${reference} OR ${entries.published}::text LIKE ${reference})`;
  }));
  const [content, config] = await Promise.all([
    db().select({ content: entries.content, published: entries.published, deletedAt: entries.deletedAt }).from(entries).where(references),
    db().select().from(settings),
  ]);
  const usages = content.map((entry) => ({
    ...entry, draftText: JSON.stringify(entry.content), publishedText: JSON.stringify(entry.published),
  }));
  const settingsText = JSON.stringify(config[0]?.value || {});
  return { ...page, items: rows.map((row) => {
    const url = mediaUrl(row.id);
    const usedBy: string[] = [];
    for (const entry of usages) {
      if (entry.draftText.includes(url)) usedBy.push(`${entry.content.title} (draft${entry.deletedAt ? ' / trash' : ''})`);
      if (entry.published && entry.publishedText.includes(url)) usedBy.push(`${entry.published.title} (published)`);
    }
    if (settingsText.includes(url)) usedBy.push('Site settings / About me');
    return { ...row, url, createdAt: row.createdAt.toISOString(), usedBy };
  }) };
}
