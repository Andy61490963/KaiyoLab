import { randomUUID } from 'node:crypto';
import { and, desc, eq, lt, ne, or, sql } from 'drizzle-orm';
import { db, entries, entryRevisions } from './db';
import { HttpError } from './http';
import { checkpointDue, DRAFT_REVISION_LIMIT, HISTORY_PAGE_SIZE } from './history-rules';
import type { EntryContent, EntryRevision } from './types';

type Database = ReturnType<typeof db>;
type RevisionEntry = Pick<typeof entries.$inferSelect, 'id' | 'content' | 'version'>;

export async function recordRevision(
  database: Database,
  entry: RevisionEntry,
  source: EntryRevision['source'],
  content = entry.content,
  now = new Date(),
) {
  const [revision] = await database
    .insert(entryRevisions)
    .values({
      id: randomUUID(),
      entryId: entry.id,
      content,
      source,
      version: entry.version,
      createdAt: now,
    })
    .returning();
  if (source !== 'published') {
    await database.execute(sql`
      DELETE FROM entry_revisions WHERE id IN (
        SELECT id FROM entry_revisions WHERE entry_id = ${entry.id} AND source <> 'published'
        ORDER BY created_at DESC, id DESC OFFSET ${DRAFT_REVISION_LIMIT}
      )
    `);
  }
  return revision;
}

// 自動儲存只定期記錄被取代的草稿，發布與還原前則一律保存完整快照
export async function checkpointDraft(database: Database, entry: RevisionEntry, now = new Date()) {
  const [last] = await database
    .select()
    .from(entryRevisions)
    .where(and(eq(entryRevisions.entryId, entry.id), ne(entryRevisions.source, 'published')))
    .orderBy(desc(entryRevisions.createdAt), desc(entryRevisions.id))
    .limit(1);
  if (
    checkpointDue(last?.createdAt || null, now) &&
    (!last || JSON.stringify(last.content) !== JSON.stringify(entry.content))
  ) {
    await recordRevision(database, entry, 'draft', entry.content, now);
  }
}

export async function listRevisions(database: Database, entryId: string, before?: string | null) {
  const conditions = [eq(entryRevisions.entryId, entryId)];
  if (before) {
    const [cursor] = await database
      .select()
      .from(entryRevisions)
      .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.id, before)));
    if (!cursor)
      throw new HttpError(400, 'The history cursor is no longer available. Reload history.');
    conditions.push(
      or(
        lt(entryRevisions.createdAt, cursor.createdAt),
        and(eq(entryRevisions.createdAt, cursor.createdAt), lt(entryRevisions.id, cursor.id)),
      )!,
    );
  }
  const rows = await database
    .select()
    .from(entryRevisions)
    .where(and(...conditions))
    .orderBy(desc(entryRevisions.createdAt), desc(entryRevisions.id))
    .limit(HISTORY_PAGE_SIZE + 1);
  const page = rows.slice(0, HISTORY_PAGE_SIZE);
  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > HISTORY_PAGE_SIZE ? page.at(-1)!.id : null,
  };
}

export async function historyMediaUsages(database: Database, id: string): Promise<string[]> {
  const url = `/media/${id}.webp`;
  const matches = await database
    .select({ entryId: entryRevisions.entryId, content: entryRevisions.content })
    .from(entryRevisions)
    .where(sql`${entryRevisions.content}::text LIKE ${`%${url}%`}`);
  return [...new Set(matches.map((item) => `${item.content.title} (version history)`))];
}

export async function revisionContent(
  database: Database,
  entryId: string,
  revisionId: string,
): Promise<EntryContent> {
  const [revision] = await database
    .select()
    .from(entryRevisions)
    .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.id, revisionId)));
  if (!revision) throw new HttpError(404, 'Version not found.');
  return revision.content;
}
