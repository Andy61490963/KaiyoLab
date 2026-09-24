import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries, settings, taxonomies, media } from '../../../lib/db';
import {
  json,
  body,
  HttpError,
  errorResponse,
  contentSchema,
  settingsSchema,
} from '../../../lib/http';
import { serializeEntry, getSettings, listTaxonomies } from '../../../lib/content';
import { emptyContent } from '../../../lib/defaults';
import { settingsWithPreservedViews } from '../../../lib/article-views';
import { renderMarkdown } from '../../../lib/markdown';
import { listMedia, mediaUsages, mediaUrl, lockContent, ensureMedia } from '../../../lib/media';
import type { EntryContent } from '../../../lib/types';
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
  const max = 10 * 1024 * 1024;
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
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new HttpError(400, 'Only PNG, JPEG, and WebP images are supported.');
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const output = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(output.format || '')) throw new Error();
  } catch {
    throw new HttpError(400, 'The image is invalid or exceeds the pixel limit.');
  }
  const result = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const id = randomUUID();
  const alt = z
    .string()
    .max(300)
    .parse(parsed.get('alt') || '');
  await mkdir(uploadDir(), { recursive: true });
  const target = path.join(uploadDir(), `${id}.webp`);
  await writeFile(target, result.data, { flag: 'wx' });
  try {
    const [m] = await db()
      .insert(media)
      .values({
        id,
        name: file.name.slice(0, 200),
        alt,
        mime: 'image/webp',
        size: result.data.length,
        width: result.info.width,
        height: result.info.height,
      })
      .returning();
    return json({ ...m, url: mediaUrl(id), createdAt: m.createdAt.toISOString(), usedBy: [] }, 201);
  } catch (e) {
    await unlink(target);
    throw e;
  }
}
export const ALL: APIRoute = async ({ request, params, url }) => {
  try {
    const [resource, id, action] = String(params.path || '').split('/');
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
        const [row] = await db()
          .insert(entries)
          .values({
            id: entryId,
            kind: input.kind,
            content: {
              ...emptyContent,
              title:
                input.title || (input.kind === 'project' ? 'Untitled project' : 'Untitled article'),
              slug: `untitled-${entryId.slice(0, 8)}`,
            },
          })
          .returning();
        return json(serializeEntry(row), 201);
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
            await ensureMedia(database, input.content);
            await syncTaxonomies(database, input.content);
            changes.content = input.content;
          } else if (input.action === 'publish') {
            if (old.deletedAt) throw new HttpError(409, 'Restore this content first.');
            const content = contentSchema.parse(old.content);
            if (!content.body.trim())
              throw new HttpError(400, 'Add some content before publishing.');
            await ensureMedia(database, content);
            changes.published = content;
            changes.publishedAt = new Date();
          } else if (input.action === 'unpublish') {
            changes.published = null;
            changes.publishedAt = null;
          } else if (input.action === 'trash') changes.deletedAt = new Date();
          else if (input.action === 'restore') {
            changes.deletedAt = null;
            changes.published = null;
            changes.publishedAt = null;
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
      if (method === 'GET') return json(await getSettings());
      if (method === 'PUT') {
        const value = settingsSchema.parse(await body(request));
        value.siteUrl = process.env.SITE_URL || value.siteUrl;
        await db().transaction(async (tx) => {
          const database = tx as unknown as ReturnType<typeof db>;
          await lockContent(database);
          await ensureMedia(database, value);
          await tx
            .insert(settings)
            .values({ id: 1, value })
            .onConflictDoUpdate({
              target: settings.id,
              set: { value: settingsWithPreservedViews(value) },
            });
        });
        return json(value);
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
          for (const entry of all.filter((e) => uses(e.content) || uses(e.published)))
            await tx
              .update(entries)
              .set({
                content: rename(entry.content)!,
                published: rename(entry.published),
                version: entry.version + 1,
                updatedAt: new Date(),
              })
              .where(eq(entries.id, entry.id));
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
