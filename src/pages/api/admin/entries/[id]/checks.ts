import type { APIRoute } from 'astro';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries, entrySlugs } from '../../../../../lib/db';
import { body, errorResponse, HttpError, json } from '../../../../../lib/http';
import { getSettings } from '../../../../../lib/content';
import { reviewContent } from '../../../../../lib/content-review';
import { renderMarkdown } from '../../../../../lib/markdown';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const input = z.object({ version: z.number().int().positive() }).parse(await body(request));
    const [entry] = await db().select().from(entries).where(eq(entries.id, params.id!));
    if (!entry) throw new HttpError(404, 'Content not found');
    if (entry.deletedAt) throw new HttpError(409, 'Restore this content before publishing');
    if (entry.version !== input.version)
      throw new HttpError(409, 'This content changed in another tab. Reload before reviewing it');
    const aliases = await db()
      .select({ kind: entrySlugs.kind, slug: entrySlugs.slug, entryId: entrySlugs.entryId })
      .from(entrySlugs)
      .innerJoin(entries, eq(entrySlugs.entryId, entries.id))
      .where(and(isNotNull(entries.published), isNull(entries.deletedAt)));
    const published = await db()
      .select({
        id: entries.id,
        kind: entries.kind,
        slug: sql<string>`${entries.published}->>'slug'`,
      })
      .from(entries)
      .where(and(isNotNull(entries.published), isNull(entries.deletedAt)));
    const pathOwners = new Map(
      [...aliases.map((row) => ({ ...row, id: row.entryId })), ...published].map((row) => [
        `/${row.kind === 'article' ? 'articles' : 'projects'}/${row.slug}`,
        row.id,
      ]),
    );
    const publicPaths = new Set(pathOwners.keys());
    const currentPath = `/${entry.kind === 'article' ? 'articles' : 'projects'}/${entry.content.slug}`;
    publicPaths.add(currentPath);
    const currentPaths = new Set([
      currentPath,
      ...[...pathOwners].filter(([, id]) => id === entry.id).map(([path]) => path),
    ]);
    const cachedAnchors = new Map<string, Promise<Set<string> | null>>();
    const settings = await getSettings();
    return json({
      version: entry.version,
      ...(await reviewContent(entry.content, entry.published, {
        siteUrl: settings.siteUrl,
        currentPath,
        publicPaths,
        currentPaths,
        publicAnchors: async (pathname) => {
          const id = pathOwners.get(pathname);
          if (!id) return null;
          if (!cachedAnchors.has(id))
            cachedAnchors.set(
              id,
              (async () => {
                const [row] = await db()
                  .select({ content: entries.published, kind: entries.kind })
                  .from(entries)
                  .where(
                    and(
                      eq(entries.id, id),
                      isNotNull(entries.published),
                      isNull(entries.deletedAt),
                    ),
                  );
                if (!row?.content) return null;
                const anchors = new Set(
                  (await renderMarkdown(row.content.body)).toc.map((heading) => heading.id),
                );
                anchors.add('main-content');
                if (row.kind === 'article') anchors.add('article-title');
                return anchors;
              })(),
            );
          return cachedAnchors.get(id)!;
        },
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
