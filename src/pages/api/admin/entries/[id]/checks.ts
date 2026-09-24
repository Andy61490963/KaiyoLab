import type { APIRoute } from 'astro';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries, entrySlugs } from '../../../../../lib/db';
import { body, errorResponse, HttpError, json } from '../../../../../lib/http';
import { getSettings } from '../../../../../lib/content';
import { reviewContent } from '../../../../../lib/content-review';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const input = z.object({ version: z.number().int().positive() }).parse(await body(request));
    const [entry] = await db().select().from(entries).where(eq(entries.id, params.id!));
    if (!entry) throw new HttpError(404, 'Content not found');
    if (entry.deletedAt) throw new HttpError(409, 'Restore this content before publishing');
    if (entry.version !== input.version)
      throw new HttpError(409, 'This content changed in another tab. Reload before reviewing it');
    const aliases = await db()
      .select({ kind: entrySlugs.kind, slug: entrySlugs.slug })
      .from(entrySlugs)
      .innerJoin(entries, eq(entrySlugs.entryId, entries.id))
      .where(and(isNotNull(entries.published), isNull(entries.deletedAt)));
    const publicPaths = new Set(
      aliases.map((row) => `/${row.kind === 'article' ? 'articles' : 'projects'}/${row.slug}`),
    );
    const currentPath = `/${entry.kind === 'article' ? 'articles' : 'projects'}/${entry.content.slug}`;
    publicPaths.add(currentPath);
    const settings = await getSettings();
    return json({
      version: entry.version,
      ...reviewContent(entry.content, entry.published, {
        siteUrl: settings.siteUrl,
        currentPath,
        publicPaths,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
