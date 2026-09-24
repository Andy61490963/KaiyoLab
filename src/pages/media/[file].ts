import type { APIRoute } from 'astro';
import path from 'node:path';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { mediaWidth } from '../../lib/media-presentation';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { db, media, entries, settings, systemState } from '../../lib/db';
import { getAuth } from '../../lib/auth';
export const GET: APIRoute = async ({ params, request, url: requestUrl }) => {
  if (!/^[a-f0-9-]{36}\.webp$/.test(params.file || '')) return new Response(null, { status: 404 });
  const width = mediaWidth((requestUrl || new URL(request.url)).searchParams.get('w'));
  if (width === false) return new Response(null, { status: 400 });
  const id = params.file!.slice(0, -5);
  const [m] = await db().select().from(media).where(eq(media.id, id));
  if (!m) return new Response(null, { status: 404 });
  const url = '/media/' + params.file;
  const published = await db()
    .select({ published: entries.published })
    .from(entries)
    .where(and(isNull(entries.deletedAt), isNotNull(entries.published)));
  const [config] = await db().select().from(settings);
  const isPublic =
    published.some((e) => JSON.stringify(e.published).includes(url)) ||
    JSON.stringify(config?.value || {}).includes(url);
  if (!isPublic) {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const [state] = await db().select().from(systemState);
    if (!session || session.user.id !== state?.ownerId)
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const directory = process.env.UPLOAD_DIR || path.resolve('data/uploads');
    let file: Buffer;
    if (width) {
      const variant = path.join(directory, '.variants', `${id}-${width}.webp`);
      try {
        file = await readFile(variant);
      } catch {
        const original = await readFile(path.join(directory, id + '.webp'));
        file = await sharp(original, { limitInputPixels: 40_000_000 })
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        // 派生快取寫入失敗不影響原圖或閱讀，權限檢查永遠在快取讀取前
        const temporary = `${variant}.${randomUUID()}.tmp`;
        try {
          await mkdir(path.dirname(variant), { recursive: true });
          await writeFile(temporary, file, { flag: 'wx' });
          await rename(temporary, variant);
        } catch {
          /* 快取不可寫仍可回傳已產生的縮圖 */
        } finally {
          await unlink(temporary).catch(() => {});
        }
      }
    } else file = await readFile(path.join(directory, id + '.webp'));
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': isPublic ? 'public, max-age=0, must-revalidate' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
};
