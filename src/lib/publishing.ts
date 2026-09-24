import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db, entries, entrySlugs } from './db';
import { HttpError } from './http';
import type { EntryKind } from './types';

// 呼叫端必須持有 lockContent，使草稿、匯入、還原及發布共用相同網址鎖定規則
export async function assertAvailableSlug(
  database: ReturnType<typeof db>,
  kind: EntryKind | string,
  slug: string,
  entryId: string,
) {
  const [reserved] = await database
    .select()
    .from(entrySlugs)
    .where(
      and(eq(entrySlugs.kind, kind), eq(entrySlugs.slug, slug), ne(entrySlugs.entryId, entryId)),
    )
    .limit(1);
  const [existing] = await database
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.kind, kind),
        ne(entries.id, entryId),
        isNull(entries.deletedAt),
        or(
          sql`${entries.content}->>'slug' = ${slug}`,
          sql`${entries.published}->>'slug' = ${slug}`,
        ),
      ),
    )
    .limit(1);
  if (reserved || existing)
    throw new HttpError(
      409,
      'This URL belongs to another entry or one of its previous published URLs. Choose a different slug.',
    );
}

export async function reservePublishedSlug(
  database: ReturnType<typeof db>,
  kind: string,
  slug: string,
  entryId: string,
) {
  await assertAvailableSlug(database, kind, slug, entryId);
  await database.insert(entrySlugs).values({ kind, slug, entryId }).onConflictDoNothing();
}
