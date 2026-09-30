import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries, taxonomies, media } from '../../../lib/db';
import { json, body, HttpError, errorResponse, contentSchema } from '../../../lib/http';
import { serializeEntry, listTaxonomies } from '../../../lib/content';
import { getSettingsSnapshot, saveSettingsSnapshot } from '../../../lib/settings';
import { persistMediaFile } from '../../../lib/media-persistence';
import { imageLimits, processUploadImage } from '../../../lib/image-processing';
import { emptyContent } from '../../../lib/defaults';
import { renderMarkdown } from '../../../lib/markdown';
import { listMedia, mediaUsages, mediaUrl, lockContent, ensureMedia } from '../../../lib/media';
import type { EntryContent } from '../../../lib/types';
import {
  checkpointDraft,
  listRevisions,
  recordRevision,
  revisionContent,
} from '../../../lib/history';
import { assertAvailableSlug, reservePublishedSlug } from '../../../lib/publishing';
const uploadDir = () => process.env.UPLOAD_DIR || path.resolve('data/uploads');
const versionSchema = z.number().int().positive();
const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || randomUUID();
async function getEntry(id: string) {
  const [e] = await db().select().from(entries).where(eq(entries.id, id));
  if (!e) throw new HttpError(404, 'Content not found.');
  return e;
}
async function syncTaxonomies(database: ReturnType<typeof db>, content: EntryContent) {
  for (const [kind, names] of [
    ['category', content.category ? [content.category] : []],
    ['tag', content.tags],
  ] as const) {
    for (const name of names)
      await database
        .insert(taxonomies)
        .values({
          id: randomUUID(),
          kind,
          name,
          slug: `${slugify(name)}-${randomUUID().slice(0, 8)}`,
        })
        .onConflictDoNothing({ target: [taxonomies.kind, taxonomies.name] });
  }
}
async function upload(request: Request) {
  const max = imageLimits.bytes;
  if (Number(request.headers.get('content-length') || 0) > max + 65536)
    throw new HttpError(413, 'Images cannot exceed 10 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Choose an image.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > max + 65536) {
      await reader.cancel();
      throw new HttpError(413, 'Images cannot exceed 10 MB.');
    }
    chunks.push(part.value);
  }
  const parsed = await new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
    body: Buffer.concat(chunks),
  }).formData();
  const file = parsed.get('file');
  if (!(file instanceof File) || file.size > max)
    throw new HttpError(400, 'Upload an image no larger than 10 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  const result = await processUploadImage(input, file.type);
  const id = randomUUID();
  const alt = z
    .string()
    .max(300)
    .parse(parsed.get('alt') || '');
  await mkdir(uploadDir(), { recursive: true });
  const target = path.join(uploadDir(), `${id}.webp`);
  await writeFile(target, result.data, { flag: 'wx' });
  const m = await persistMediaFile({
    insert: async () => {
      const [row] = await db()
        .insert(media)
        .values({
          id,
          name: file.name.slice(0, 200),
          alt,
          mime: 'image/webp',
          size: result.data.length,
          width: result.width,
          height: result.height,
        })
        .returning();
      return row;
    },
    find: async () => {
      const [row] = await db().select().from(media).where(eq(media.id, id));
      return row;
    },
    remove: () => unlink(target),
  });
  return json({ ...m, url: mediaUrl(id), createdAt: m.createdAt.toISOString(), usedBy: [] }, 201);
}
export const ALL: APIRoute = async ({ request, params, url }) => {
  try {
    const segments = String(params.path || '').split('/');
    const [resource, id, action] = segments;
    const method = request.method;
    if (resource === 'dashboard' && method === 'GET') {
      const all = await db().select().from(entries).orderBy(desc(entries.updatedAt));
      return json({
        counts: {
          articles: all.filter((e) => e.kind === 'article' && !e.deletedAt).length,
          drafts: all.filter((e) => !e.published && !e.deletedAt).length,
          projects: all.filter((e) => e.kind === 'project' && !e.deletedAt).length,
          trash: all.filter((e) => e.deletedAt).length,
        },
        recent: all
          .filter((e) => !e.deletedAt)
          .slice(0, 6)
          .map(serializeEntry),
      });
    }
    if (resource === 'preview' && method === 'POST') {
      const input = z.object({ body: z.string().max(500000) }).parse(await body(request));
      return json(await renderMarkdown(input.body));
    }
    if (resource === 'history' && id && !action) {
      if (method === 'GET') {
        await getEntry(id);
        return json(await listRevisions(db(), id, url.searchParams.get('before')));
      }
      if (method === 'POST') {
        const input = z
          .object({ revisionId: z.string().min(1).max(200), version: versionSchema })
          .parse(await body(request));
        const result = await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          const [old] = await tx.select().from(entries).where(eq(entries.id, id));
          if (!old) throw new HttpError(404, 'Content not found.');
          if (old.deletedAt) throw new HttpError(409, 'Restore this content from the trash first.');
          if (old.version !== input.version)
            throw new HttpError(409, 'Content version conflict. Reload before restoring.');
          const restored = contentSchema.parse(
            await revisionContent(database, id, input.revisionId),
          );
          await assertAvailableSlug(database, old.kind, restored.slug, id);
          await ensureMedia(database, restored);
          await syncTaxonomies(database, restored);
          await recordRevision(database, old, 'restore');
          const [updated] = await tx
            .update(entries)
            .set({
              content: restored,
              version: old.version + 1,
              updatedAt: new Date(),
            })
            .where(and(eq(entries.id, id), eq(entries.version, input.version)))
            .returning();
          return updated;
        });
        return json(serializeEntry(result));
      }
    }
    if (resource === 'entries') {
      if (method === 'GET' && id) return json(serializeEntry(await getEntry(id)));
      if (method === 'GET') {
        const kind = url.searchParams.get('kind');
        const status = url.searchParams.get('status');
        const q = url.searchParams.get('q')?.toLocaleLowerCase() || '';
        const category = url.searchParams.get('category');
        const all = await db().select().from(entries).orderBy(desc(entries.updatedAt));
        return json({
          items: all
            .filter(
              (e) =>
                (!kind || e.kind === kind) &&
                (status === 'trash' ? !!e.deletedAt : !e.deletedAt) &&
                (status === 'draft'
                  ? !e.published
                  : status === 'published'
                    ? !!e.published
                    : true) &&
                (!category || e.content.category === category) &&
                (!q || `${e.content.title} ${e.content.excerpt}`.toLocaleLowerCase().includes(q)),
            )
            .map(serializeEntry),
        });
      }
      if (method === 'POST' && !id) {
        const input = z
          .object({
            kind: z.enum(['article', 'project']),
            title: z.string().trim().min(1).max(200).optional(),
          })
          .parse(await body(request));
        const entryId = randomUUID();
        const row = await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          await assertAvailableSlug(
            database,
            input.kind,
            `untitled-${entryId.slice(0, 8)}`,
            entryId,
          );
          const [created] = await tx
            .insert(entries)
            .values({
              id: entryId,
              kind: input.kind,
              content: {
                ...emptyContent,
                title:
                  input.title ||
                  (input.kind === 'project' ? 'Untitled project' : 'Untitled article'),
                slug: `untitled-${entryId.slice(0, 8)}`,
              },
            })
            .returning();
          await recordRevision(database, created, 'draft');
          return created;
        });
        return json(serializeEntry(row), 201);
      }
      if (method === 'DELETE' && id && segments.length === 2) {
        const input = z.strictObject({ version: versionSchema }).parse(await body(request));
        await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          const [old] = await tx.select().from(entries).where(eq(entries.id, id));
          if (!old) throw new HttpError(404, 'Content not found.');
          if (old.version !== input.version)
            throw new HttpError(
              409,
              'This content has changed. Refresh the list before deleting it permanently.',
            );
          if (!old.deletedAt)
            throw new HttpError(
              409,
              'Move this content to the trash before deleting it permanently.',
            );
          // 外鍵一併刪除歷史版本與舊網址，媒體、分類及其他內容順位維持原狀
          const [removed] = await tx
            .delete(entries)
            .where(
              and(
                eq(entries.id, id),
                eq(entries.version, input.version),
                isNotNull(entries.deletedAt),
              ),
            )
            .returning({ id: entries.id });
          if (!removed)
            throw new HttpError(
              409,
              'This content has changed. Refresh the list before deleting it permanently.',
            );
        });
        return json({ deleted: true, id });
      }
      if (id && (method === 'PATCH' || (method === 'POST' && action === 'action'))) {
        const input =
          method === 'PATCH'
            ? z
                .object({ version: versionSchema, content: contentSchema })
                .parse(await body(request))
            : z
                .object({
                  version: versionSchema,
                  action: z.enum(['publish', 'unpublish', 'trash', 'restore']),
                })
                .parse(await body(request));
        const result = await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          const [old] = await tx.select().from(entries).where(eq(entries.id, id));
          if (!old) throw new HttpError(404, 'Content not found.');
          if (old.version !== input.version)
            throw new HttpError(
              409,
              'This content has changed in another tab. Keep your edits or save a copy before reloading.',
            );
          let changes: Partial<typeof entries.$inferInsert> = {
            version: old.version + 1,
            updatedAt: new Date(),
          };
          if ('content' in input) {
            if (old.deletedAt) throw new HttpError(409, 'Restore this content before editing.');
            await assertAvailableSlug(database, old.kind, input.content.slug, id);
            await ensureMedia(database, input.content);
            await syncTaxonomies(database, input.content);
            await checkpointDraft(database, old);
            changes.content = input.content;
          } else if (input.action === 'publish') {
            if (old.deletedAt) throw new HttpError(409, 'Restore this content first.');
            const content = contentSchema.parse(old.content);
            if (!content.body.trim())
              throw new HttpError(400, 'Add some content before publishing.');
            await ensureMedia(database, content);
            await reservePublishedSlug(database, old.kind, content.slug, id);
            await recordRevision(
              database,
              { ...old, version: old.version + 1 },
              'published',
              content,
            );
            changes.published = content;
            changes.publishedAt = old.publishedAt || changes.updatedAt;
            changes.publishedUpdatedAt = changes.updatedAt;
          } else if (input.action === 'unpublish') {
            changes.published = null;
          } else if (input.action === 'trash') changes.deletedAt = new Date();
          else if (input.action === 'restore') {
            await assertAvailableSlug(database, old.kind, old.content.slug, id);
            changes.deletedAt = null;
            changes.published = null;
          }
          const [updated] = await tx
            .update(entries)
            .set(changes)
            .where(and(eq(entries.id, id), eq(entries.version, input.version)))
            .returning();
          if (!updated)
            throw new HttpError(409, 'Content version conflict. Reload before retrying.');
          return updated;
        });
        return json(serializeEntry(result));
      }
    }
    if (resource === 'settings') {
      if (method === 'GET') return json(await getSettingsSnapshot());
      if (method === 'PUT') {
        return json(await saveSettingsSnapshot(await body(request)));
      }
    }
    if (resource === 'media') {
      if (method === 'GET') return json({ items: await listMedia() });
      if (method === 'POST' && !id) return await upload(request);
      if (method === 'PATCH' && id) {
        const input = z.object({ alt: z.string().max(300) }).parse(await body(request));
        const [m] = await db().update(media).set(input).where(eq(media.id, id)).returning();
        if (!m) throw new HttpError(404, 'Image not found.');
        return json({
          ...m,
          url: mediaUrl(id),
          createdAt: m.createdAt.toISOString(),
          usedBy: await mediaUsages(db(), id),
        });
      }
      if (method === 'DELETE' && id) {
        await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          const [m] = await tx.select().from(media).where(eq(media.id, id));
          if (!m) throw new HttpError(404, 'Image not found.');
          if ((await mediaUsages(database, id)).length)
            throw new HttpError(
              409,
              'This image is still in use. Remove its references before deleting it.',
            );
          await tx.delete(media).where(eq(media.id, id));
        });
        await unlink(path.join(uploadDir(), `${id}.webp`)).catch(() => {});
        await Promise.all(
          [480, 960, 1600].map((width) =>
            unlink(path.join(uploadDir(), '.variants', `${id}-${width}.webp`)).catch(() => {}),
          ),
        );
        return json({ ok: true });
      }
    }
    if (resource === 'taxonomies') {
      if (method === 'GET') return json(await listTaxonomies(false));
      if (method === 'POST' && !id) {
        const input = z
          .object({
            kind: z.enum(['category', 'tag']),
            name: z.string().trim().min(1).max(80),
            slug: z.string().max(160).optional(),
          })
          .parse(await body(request));
        const [item] = await db()
          .insert(taxonomies)
          .values({ ...input, id: randomUUID(), slug: slugify(input.slug || input.name) })
          .returning();
        return json(item, 201);
      }
      if (id && (method === 'PATCH' || method === 'DELETE')) {
        const input =
          method === 'PATCH'
            ? z
                .object({
                  name: z.string().trim().min(1).max(80),
                  slug: z.string().max(160).optional(),
                })
                .parse(await body(request))
            : null;
        const result = await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          const [old] = await tx.select().from(taxonomies).where(eq(taxonomies.id, id));
          if (!old) throw new HttpError(404, 'Category or tag not found.');
          const all = await tx.select().from(entries);
          const uses = (c: EntryContent | null) =>
            c && (old.kind === 'category' ? c.category === old.name : c.tags.includes(old.name));
          if (!input) {
            if (all.some((e) => uses(e.content) || uses(e.published)))
              throw new HttpError(
                409,
                'This category or tag is still in use. Remove its references first.',
              );
            await tx.delete(taxonomies).where(eq(taxonomies.id, id));
            return { ok: true };
          }
          const rename = (c: EntryContent | null) =>
            !c
              ? null
              : old.kind === 'category'
                ? { ...c, category: c.category === old.name ? input.name : c.category }
                : { ...c, tags: c.tags.map((t) => (t === old.name ? input.name : t)) };
          for (const entry of all.filter((e) => uses(e.content) || uses(e.published))) {
            await checkpointDraft(database, entry);
            if (uses(entry.published))
              await recordRevision(
                database,
                { ...entry, version: entry.version + 1 },
                'published',
                rename(entry.published)!,
              );
            await tx
              .update(entries)
              .set({
                content: rename(entry.content)!,
                published: rename(entry.published),
                version: entry.version + 1,
                updatedAt: new Date(),
                ...(uses(entry.published) ? { publishedUpdatedAt: new Date() } : {}),
              })
              .where(eq(entries.id, entry.id));
          }
          const [item] = await tx
            .update(taxonomies)
            .set({ name: input.name, slug: slugify(input.slug || input.name) })
            .where(eq(taxonomies.id, id))
            .returning();
          return item;
        });
        return json(result);
      }
    }
    return json({ error: 'Operation not found.' }, 404);
  } catch (error) {
    return errorResponse(error);
  }
};
