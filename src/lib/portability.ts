import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { z } from 'zod';
import { db, entries, entryRevisions, media, settings, taxonomies } from './db';
import { defaultSettings } from './defaults';
import { defaultHomeIntro } from './home-intro';
import { contentSchema, HttpError, settingsSchema } from './http';
import { lockContent, mediaUrl } from './media';
import { assertAvailableSlug } from './publishing';
import { recordRevision } from './history';
import { DRAFT_REVISION_LIMIT } from './history-rules';
import type { EntryContent, SiteSettings } from './types';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
export const transferLimits = {
  compressedBytes: 32 * 1024 * 1024,
  expandedBytes: 64 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  totalImageBytes: 30 * 1024 * 1024,
  entries: 2000,
  revisions: 10000,
  images: 500,
  taxonomies: 2000,
};
const portableAsset = z
  .string()
  .max(2048)
  .refine(
    (value) =>
      !value ||
      /^\/media\/[a-f0-9-]+\.webp$/i.test(value) ||
      /^\/images\/[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|svg)$/.test(value) ||
      value === '/favicon.svg',
    'Use a media library or built-in image path.',
  );
const content = contentSchema.extend({ cover: portableAsset }).strict();
const portableSettings = settingsSchema
  .omit({ siteUrl: true })
  .extend({ logo: portableAsset, avatar: portableAsset, heroImage: portableAsset })
  .strict();
const date = z.iso.datetime({ offset: true }).nullable();
const archiveSchema = z
  .object({
    format: z.literal('kaiyolab-content'),
    version: z.literal(1),
    exportedAt: z.iso.datetime({ offset: true }),
    settings: portableSettings,
    entries: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(['article', 'project']),
            content,
            published: content.nullable(),
            publishedAt: date,
            publishedUpdatedAt: date.optional(),
            updatedAt: z.iso.datetime({ offset: true }),
            deletedAt: date,
          })
          .strict(),
      )
      .max(transferLimits.entries),
    revisions: z
      .array(
        z
          .object({
            entryId: z.uuid(),
            content,
            source: z.enum(['draft', 'published', 'restore']),
            version: z.number().int().positive().max(2147483647),
            createdAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .max(transferLimits.revisions),
    taxonomies: z
      .array(
        z
          .object({
            kind: z.enum(['category', 'tag']),
            name: z.string().trim().min(1).max(80),
            slug: z
              .string()
              .trim()
              .min(1)
              .max(160)
              .regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u),
          })
          .strict(),
      )
      .max(transferLimits.taxonomies),
    media: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: z.string().max(200),
            alt: z.string().max(300),
            mime: z.literal('image/webp'),
            width: z.number().int().positive().max(2400),
            height: z.number().int().positive().max(2400),
            data: z.string().max(Math.ceil(transferLimits.imageBytes / 3) * 4),
          })
          .strict(),
      )
      .max(transferLimits.images),
  })
  .strict();
export type ContentArchive = z.infer<typeof archiveSchema>;
type Database = ReturnType<typeof db>;
interface LoadedArchive {
  archive: ContentArchive;
  images: Map<string, Buffer>;
  digest: string;
}
export interface TransferPreview {
  review: string;
  exportedAt: string;
  counts: {
    articles: number;
    projects: number;
    images: number;
    categories: number;
    tags: number;
    revisions: number;
    fromTrash: number;
    trimmedDraftRevisions: number;
  };
  adjustments: { type: string; from: string; to: string }[];
  applySettings: boolean;
  settings: { siteName: string; authorName: string };
}
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || 'data/uploads');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const unique = (values: string[], label: string) => {
  if (new Set(values).size !== values.length)
    throw new HttpError(400, `Duplicate ${label} in the archive.`);
};
const imageReferences = (value: unknown) =>
  [...JSON.stringify(value).matchAll(/\/media\/([^\s"'<>()[\]\\]+)\.webp/g)].map(
    (match) => match[1],
  );

export async function readArchiveRequest(request: Request): Promise<Buffer> {
  if (
    !['application/gzip', 'application/octet-stream'].includes(
      request.headers.get('content-type')?.split(';')[0] || '',
    )
  )
    throw new HttpError(415, 'Upload a .kaiyo.json.gz archive.');
  if (Number(request.headers.get('content-length') || 0) > transferLimits.compressedBytes)
    throw new HttpError(413, 'The compressed archive cannot exceed 32 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Choose an archive.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > transferLimits.compressedBytes) {
      await reader.cancel();
      throw new HttpError(413, 'The compressed archive cannot exceed 32 MB.');
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

export async function decodeArchive(input: Buffer): Promise<LoadedArchive> {
  if (input.length > transferLimits.compressedBytes)
    throw new HttpError(413, 'The compressed archive cannot exceed 32 MB.');
  let parsed: unknown;
  try {
    if (input[0] !== 0x1f || input[1] !== 0x8b) throw new Error();
    const expanded = await decompress(input, { maxOutputLength: transferLimits.expandedBytes });
    parsed = JSON.parse(expanded.toString('utf8'));
  } catch {
    throw new HttpError(
      400,
      'This is not a valid gzip JSON archive, or its expanded size exceeds 64 MB.',
    );
  }
  const archive = archiveSchema.parse(parsed);
  unique(
    archive.entries.map((item) => item.id),
    'entry IDs',
  );
  unique(
    archive.media.map((item) => item.id),
    'image IDs',
  );
  unique(
    archive.taxonomies.map((item) => `${item.kind}:${item.name}`),
    'category or tag names',
  );
  const entryIds = new Set(archive.entries.map((item) => item.id));
  if (archive.revisions.some((revision) => !entryIds.has(revision.entryId)))
    throw new HttpError(400, 'A revision references missing content.');
  const images = new Map<string, Buffer>();
  let imageBytes = 0;
  let cleanedBytes = 0;
  for (const image of archive.media) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data))
      throw new HttpError(400, 'An image has invalid base64 data.');
    const buffer = Buffer.from(image.data, 'base64');
    imageBytes += buffer.length;
    if (
      !buffer.length ||
      buffer.length > transferLimits.imageBytes ||
      imageBytes > transferLimits.totalImageBytes
    )
      throw new HttpError(413, 'Images exceed the 10 MB per image or 30 MB total limit.');
    try {
      const metadata = await sharp(buffer, { limitInputPixels: 5_760_000 }).metadata();
      if (
        metadata.format !== 'webp' ||
        metadata.width !== image.width ||
        metadata.height !== image.height ||
        (metadata.pages || 1) > 1
      )
        throw new Error();
      // 完整解碼後重新編碼，排除只有合法檔頭、截斷影像與額外附加內容
      const clean = await sharp(buffer, { limitInputPixels: 5_760_000 })
        .webp({ lossless: true })
        .toBuffer();
      cleanedBytes += clean.length;
      if (clean.length > transferLimits.imageBytes || cleanedBytes > transferLimits.totalImageBytes)
        throw new Error();
      images.set(image.id, clean);
    } catch {
      throw new HttpError(
        400,
        'An image is invalid, animated, or does not match its declared dimensions.',
      );
    }
  }
  for (const id of imageReferences([archive.entries, archive.settings, archive.revisions])) {
    if (!images.has(id))
      throw new HttpError(400, 'The archive references an image that is not included.');
  }
  return { archive, images, digest: digest(input) };
}

function rewriteImages<T>(value: T, ids: Map<string, string>): T {
  return JSON.parse(
    JSON.stringify(value).replace(/\/media\/([a-f0-9-]+)\.webp/gi, (url, id) =>
      ids.has(id) ? mediaUrl(ids.get(id)!) : url,
    ),
  );
}
function available(base: string, used: Set<string>, max: number) {
  let candidate = base;
  let index = 1;
  while (used.has(candidate)) {
    const suffix = `-import-${index++}`;
    candidate = `${base.slice(0, max - suffix.length).replace(/[-_]+$/, '')}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}
async function planImport(database: Database, loaded: LoadedArchive, applySettings: boolean) {
  const { archive } = loaded;
  const current = await database.select().from(entries);
  const existingTaxonomies = await database.select().from(taxonomies);
  const currentMedia = await database.select({ id: media.id }).from(media);
  const [currentSettings] = applySettings ? await database.select().from(settings) : [];
  const aliases = await database.execute(sql`SELECT kind, slug FROM entry_slugs`);
  const used = new Map(['article', 'project'].map((kind) => [kind, new Set<string>()]));
  for (const entry of current) {
    used.get(entry.kind)?.add(entry.content.slug);
    if (entry.published) used.get(entry.kind)?.add(entry.published.slug);
  }
  for (const alias of aliases.rows) used.get(String(alias.kind))?.add(String(alias.slug));
  const adjustments: TransferPreview['adjustments'] = [];
  const plannedEntries = archive.entries.map((entry) => {
    const slug = available(entry.content.slug, used.get(entry.kind)!, 160);
    if (slug !== entry.content.slug)
      adjustments.push({ type: entry.kind, from: entry.content.slug, to: slug });
    return { ...entry, content: { ...entry.content, slug } };
  });
  const taxonomyNames = new Set(existingTaxonomies.map((item) => `${item.kind}:${item.name}`));
  const taxonomySlugs = new Map(
    ['category', 'tag'].map((kind) => [
      kind,
      new Set(existingTaxonomies.filter((item) => item.kind === kind).map((item) => item.slug)),
    ]),
  );
  const plannedTaxonomies: ContentArchive['taxonomies'] = [];
  for (const item of archive.taxonomies) {
    if (taxonomyNames.has(`${item.kind}:${item.name}`)) {
      adjustments.push({ type: item.kind, from: item.name, to: 'Reuse existing name' });
      continue;
    }
    taxonomyNames.add(`${item.kind}:${item.name}`);
    const slug = available(item.slug, taxonomySlugs.get(item.kind)!, 160);
    if (slug !== item.slug) adjustments.push({ type: item.kind, from: item.slug, to: slug });
    plannedTaxonomies.push({ ...item, slug });
  }
  // 舊版封存檔的草稿標籤可能未同步進分類表，匯入時一併補齊
  for (const value of [
    ...archive.entries.flatMap((entry) => [
      entry.content,
      ...(entry.published ? [entry.published] : []),
    ]),
    ...archive.revisions.map((revision) => revision.content),
  ]) {
    for (const [kind, names] of [
      ['category', value.category ? [value.category] : []],
      ['tag', value.tags],
    ] as const) {
      for (const name of names) {
        if (taxonomyNames.has(`${kind}:${name}`)) continue;
        taxonomyNames.add(`${kind}:${name}`);
        const base =
          name
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'imported';
        plannedTaxonomies.push({
          kind,
          name,
          slug: available(base, taxonomySlugs.get(kind)!, 160),
        });
      }
    }
  }
  const plannedRevisions: ContentArchive['revisions'] = [];
  let trimmedDraftRevisions = 0;
  for (const entry of plannedEntries) {
    const history = archive.revisions.filter((revision) => revision.entryId === entry.id);
    const drafts = history
      .filter((revision) => revision.source !== 'published')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    trimmedDraftRevisions += Math.max(0, drafts.length - DRAFT_REVISION_LIMIT + 1);
    const selected = [
      ...history.filter((revision) => revision.source === 'published'),
      ...drafts.slice(0, DRAFT_REVISION_LIMIT - 1),
    ];
    if (
      entry.published &&
      !selected.some(
        (revision) =>
          revision.source === 'published' &&
          JSON.stringify(revision.content) === JSON.stringify(entry.published),
      )
    ) {
      selected.push({
        entryId: entry.id,
        content: entry.published,
        source: 'published',
        version: 1,
        createdAt: entry.publishedUpdatedAt || entry.publishedAt || entry.updatedAt,
      });
    }
    for (const revision of selected)
      plannedRevisions.push({
        ...revision,
        content: { ...revision.content, slug: entry.content.slug },
      });
  }
  const preview: TransferPreview = {
    review: digest(
      JSON.stringify({
        archive: loaded.digest,
        applySettings,
        current: current.map((entry) => [entry.id, entry.version]).sort(),
        media: currentMedia.map((item) => item.id).sort(),
        settings: currentSettings?.value,
        slugs: plannedEntries.map((entry) => entry.content.slug),
        taxonomies: plannedTaxonomies,
        adjustments,
      }),
    ),
    exportedAt: archive.exportedAt,
    counts: {
      articles: archive.entries.filter((entry) => entry.kind === 'article').length,
      projects: archive.entries.filter((entry) => entry.kind === 'project').length,
      images: archive.media.length,
      categories: plannedTaxonomies.filter((item) => item.kind === 'category').length,
      tags: plannedTaxonomies.filter((item) => item.kind === 'tag').length,
      revisions: plannedRevisions.length + plannedEntries.length,
      fromTrash: archive.entries.filter((entry) => entry.deletedAt).length,
      trimmedDraftRevisions,
    },
    adjustments,
    applySettings,
    settings: { siteName: archive.settings.siteName, authorName: archive.settings.authorName },
  };
  return { preview, plannedEntries, plannedTaxonomies, plannedRevisions };
}

export async function previewImport(loaded: LoadedArchive, applySettings = false) {
  return db().transaction(async (tx) => {
    const database = tx as unknown as Database;
    await lockContent(database);
    return (await planImport(database, loaded, applySettings)).preview;
  });
}

export async function importArchive(loaded: LoadedArchive, review: string, applySettings = false) {
  const operation = randomUUID();
  const root = uploadDir();
  const stage = path.join(root, `.import-${operation}`);
  const mediaIds = new Map(loaded.archive.media.map((image) => [image.id, randomUUID()]));
  const entryIds = new Map(loaded.archive.entries.map((entry) => [entry.id, randomUUID()]));
  const placed: string[] = [];
  await mkdir(stage, { recursive: true });
  try {
    for (const [oldId, newId] of mediaIds)
      await writeFile(path.join(stage, `${newId}.webp`), loaded.images.get(oldId)!, { flag: 'wx' });
    const result = await db().transaction(async (tx) => {
      const database = tx as unknown as Database;
      await lockContent(database);
      const plan = await planImport(database, loaded, applySettings);
      if (plan.preview.review !== review)
        throw new HttpError(
          409,
          'The archive or site content has changed. Check the archive again before importing.',
        );
      if (plan.plannedTaxonomies.length)
        await tx
          .insert(taxonomies)
          .values(plan.plannedTaxonomies.map((item) => ({ ...item, id: randomUUID() })));
      for (const image of loaded.archive.media) {
        const id = mediaIds.get(image.id)!;
        await tx.insert(media).values({
          id,
          name: image.name,
          alt: image.alt,
          mime: image.mime,
          width: image.width,
          height: image.height,
          size: loaded.images.get(image.id)!.length,
        });
      }
      for (const entry of plan.plannedEntries) {
        const id = entryIds.get(entry.id)!;
        await assertAvailableSlug(database, entry.kind, entry.content.slug, id);
        await tx.insert(entries).values({
          id,
          kind: entry.kind,
          content: rewriteImages(entry.content, mediaIds) as EntryContent,
          published: null,
          publishedAt: null,
          version: 1,
        });
      }
      const importedAt = new Date();
      for (const revision of plan.plannedRevisions)
        await tx.insert(entryRevisions).values({
          ...revision,
          id: randomUUID(),
          entryId: entryIds.get(revision.entryId)!,
          content: rewriteImages(revision.content, mediaIds) as EntryContent,
          createdAt:
            revision.source === 'published'
              ? new Date(revision.createdAt)
              : new Date(Math.min(Date.parse(revision.createdAt), importedAt.getTime() - 1)),
        });
      for (const entry of plan.plannedEntries)
        await recordRevision(
          database,
          {
            id: entryIds.get(entry.id)!,
            content: rewriteImages(entry.content, mediaIds) as EntryContent,
            version: 1,
          },
          'draft',
          undefined,
          importedAt,
        );
      if (applySettings) {
        const [current] = await tx.select().from(settings);
        const value = settingsSchema.parse({
          ...rewriteImages(loaded.archive.settings, mediaIds),
          siteUrl: process.env.SITE_URL || current?.value.siteUrl || defaultSettings.siteUrl,
        });
        await tx
          .insert(settings)
          .values({ id: 1, value })
          .onConflictDoUpdate({ target: settings.id, set: { value } });
      }
      // 檔案先原子搬入，資料庫最後提交；任一步驟失敗會回復交易並移除本次新檔
      for (const id of mediaIds.values()) {
        const destination = path.join(root, `${id}.webp`);
        await rename(path.join(stage, `${id}.webp`), destination);
        placed.push(destination);
      }
      return { ...plan.preview, entryIds: [...entryIds.values()] };
    });
    return result;
  } catch (error) {
    // COMMIT 後斷線可能只是回應遺失，重新查證後才清理，避免刪掉已提交的圖片
    if (placed.length) {
      const persisted = await db()
        .select({ id: media.id })
        .from(media)
        .where(inArray(media.id, [...mediaIds.values()]))
        .catch(() => null);
      if (persisted) {
        const kept = new Set(persisted.map((item) => `${item.id}.webp`));
        await Promise.all(
          placed
            .filter((file) => !kept.has(path.basename(file)))
            .map((file) => unlink(file).catch(() => {})),
        );
      }
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}

export async function exportArchive(): Promise<Buffer> {
  const archive = await db().transaction(async (tx) => {
    const database = tx as unknown as Database;
    await lockContent(database);
    const totals = await tx.execute(
      sql`SELECT (SELECT COALESCE(sum(octet_length(content::text) + COALESCE(octet_length(published::text), 0)), 0) FROM entries) + (SELECT COALESCE(sum(octet_length(content::text)), 0) FROM entry_revisions) AS bytes`,
    );
    if (Number(totals.rows[0]?.bytes) > transferLimits.expandedBytes)
      throw new HttpError(
        413,
        'The site content exceeds portable archive limits. Use the database backup procedure.',
      );
    const allEntries = await tx.select().from(entries);
    const allMedia = await tx.select().from(media);
    const allTaxonomies = await tx.select().from(taxonomies);
    const revisions = await tx.select().from(entryRevisions);
    const [config] = await tx.select().from(settings);
    const merged: SiteSettings = { ...defaultSettings, ...config?.value };
    merged.homeIntro ||= defaultHomeIntro(merged);
    const { siteUrl: _siteUrl, ...publicSettings } = settingsSchema.parse(merged);
    if (
      allEntries.length > transferLimits.entries ||
      allMedia.length > transferLimits.images ||
      revisions.length > transferLimits.revisions ||
      allTaxonomies.length > transferLimits.taxonomies
    )
      throw new HttpError(
        413,
        'This site exceeds the portable archive limits. Use the database and media backup procedure.',
      );
    let bytes = 0;
    const exportedMedia: ContentArchive['media'] = [];
    for (const image of allMedia) {
      if (!z.uuid().safeParse(image.id).success)
        throw new HttpError(500, 'An image ID is invalid.');
      let data: Buffer;
      try {
        const file = path.join(uploadDir(), `${image.id}.webp`);
        const info = await stat(file);
        if (
          info.size > transferLimits.imageBytes ||
          info.size + bytes > transferLimits.totalImageBytes
        )
          throw new HttpError(
            413,
            'The image library exceeds portable archive limits. Use the database and media backup procedure.',
          );
        data = await readFile(file);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(409, 'An image file is missing. Restore it before exporting.');
      }
      bytes += data.length;
      if (data.length > transferLimits.imageBytes || bytes > transferLimits.totalImageBytes)
        throw new HttpError(
          413,
          'The image library exceeds portable archive limits. Use the database and media backup procedure.',
        );
      exportedMedia.push({
        id: image.id,
        name: image.name,
        alt: image.alt,
        mime: 'image/webp',
        width: image.width,
        height: image.height,
        data: data.toString('base64'),
      });
    }
    return archiveSchema.parse({
      format: 'kaiyolab-content',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: publicSettings,
      entries: allEntries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        content: content.parse(entry.content),
        published: entry.published ? content.parse(entry.published) : null,
        publishedAt: entry.publishedAt?.toISOString() || null,
        publishedUpdatedAt: entry.publishedUpdatedAt?.toISOString() || null,
        updatedAt: entry.updatedAt.toISOString(),
        deletedAt: entry.deletedAt?.toISOString() || null,
      })),
      revisions: revisions.map((revision) => ({
        entryId: revision.entryId,
        content: content.parse(revision.content),
        source: revision.source,
        version: revision.version,
        createdAt: revision.createdAt.toISOString(),
      })),
      taxonomies: allTaxonomies.map((item) => ({
        kind: item.kind,
        name: item.name,
        slug: item.slug,
      })),
      media: exportedMedia,
    });
  });
  const serialized = JSON.stringify(archive);
  if (Buffer.byteLength(serialized) > transferLimits.expandedBytes)
    throw new HttpError(
      413,
      'The archive exceeds the 64 MB expanded limit. Use the database backup procedure.',
    );
  const output = await compress(serialized);
  if (output.length > transferLimits.compressedBytes)
    throw new HttpError(
      413,
      'The archive exceeds the 32 MB compressed limit. Use the database backup procedure.',
    );
  return output;
}
