import type { APIRoute } from 'astro';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { db, media, entries, settings, systemState } from '../../lib/db';
import { getAuth } from '../../lib/auth';
export const GET: APIRoute = async ({ params, request }) => {
  if (!/^[a-f0-9-]{36}\.webp$/.test(params.file || '')) return new Response(null, { status: 404 });
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
    const file = await readFile(
      path.join(process.env.UPLOAD_DIR || path.resolve('data/uploads'), id + '.webp'),
    );
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
