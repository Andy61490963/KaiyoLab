import { createHash } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries } from './db';
import { HttpError } from './http';
import { lockContent } from './media';
import type { EntryKind, EntryOrderSnapshot } from './types';

export const entryOrderKind = z.enum(['article', 'project']);
export const entryOrderInput = z.strictObject({
  kind: entryOrderKind,
  id: z.string().min(1).max(200),
  position: z.number().int().positive().max(2_147_483_647),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});

type Database = ReturnType<typeof db>;

async function orderedRows(database: Database, kind: EntryKind) {
  return database
    .select({
      id: entries.id,
      title: sql<string>`${entries.content}->>'title'`,
      published: sql<boolean>`${entries.published} IS NOT NULL`,
      deletedAt: entries.deletedAt,
    })
    .from(entries)
    .where(eq(entries.kind, kind))
    .orderBy(asc(entries.sortOrder), asc(entries.id));
}

function snapshot(
  kind: EntryKind,
  rows: Awaited<ReturnType<typeof orderedRows>>,
): EntryOrderSnapshot {
  const items = rows
    .filter((row) => !row.deletedAt)
    .map(({ id, title, published }) => ({ id, title, published }));
  return {
    items,
    revision: createHash('sha256')
      .update(JSON.stringify([kind, items.map((item) => item.id)]))
      .digest('hex'),
  };
}

async function writeOrder(database: Database, kind: EntryKind, ids: string[]) {
  if (!ids.length) return;
  // JSON 參數避免大量內容超過 PostgreSQL 的綁定參數數量上限
  await database.execute(sql`
    UPDATE ${entries} SET sort_order = ordered.position::integer
    FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      WITH ORDINALITY AS ordered(id, position)
    WHERE ${entries.id} = ordered.id AND ${entries.kind} = ${kind}
      AND ${entries.sortOrder} IS DISTINCT FROM ordered.position::integer
  `);
}

// 呼叫端必須先持有 lockContent，匯入可據回傳筆數接續附加，不改既有相對順序
export async function compactEntryOrder(database: Database, kind: EntryKind): Promise<number> {
  const rows = await orderedRows(database, kind);
  await writeOrder(
    database,
    kind,
    rows.map((row) => row.id),
  );
  return rows.length;
}

export async function getEntryOrder(kind: EntryKind): Promise<EntryOrderSnapshot> {
  return db().transaction(async (tx) => {
    const database = tx as unknown as Database;
    await lockContent(database);
    return snapshot(kind, await orderedRows(database, kind));
  });
}

export async function moveEntry(
  input: z.infer<typeof entryOrderInput>,
): Promise<EntryOrderSnapshot> {
  return db().transaction(async (tx) => {
    const database = tx as unknown as Database;
    await lockContent(database);
    const rows = await orderedRows(database, input.kind);
    const current = snapshot(input.kind, rows);
    if (current.revision !== input.revision)
      throw new HttpError(
        409,
        'The content order changed. Reload the order before moving an item.',
      );
    const index = current.items.findIndex((item) => item.id === input.id);
    if (index < 0) throw new HttpError(404, 'Content not found.');
    if (input.position > current.items.length)
      throw new HttpError(400, 'Choose a position within the content list.');
    if (index === input.position - 1) return current;
    const ordered = [...current.items];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(input.position - 1, 0, moved);
    let active = 0;
    // 垃圾桶保留原槽位，還原時回到相近位置；排序不修改版本、發布狀態或內容時間
    const ids = rows.map((row) => (row.deletedAt ? row.id : ordered[active++].id));
    await writeOrder(database, input.kind, ids);
    return snapshot(input.kind, await orderedRows(database, input.kind));
  });
}
