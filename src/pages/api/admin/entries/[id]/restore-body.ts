import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, entries } from '../../../../../lib/db';
import { serializeEntry } from '../../../../../lib/content';
import { recoverPublishedBody } from '../../../../../lib/draft-body-safety';
import { recordRevision } from '../../../../../lib/history';
import { body, errorResponse, HttpError, json } from '../../../../../lib/http';
import { ensureMedia, lockContent } from '../../../../../lib/media';

// Authentication and same-origin checks remain in the shared /api/admin middleware.
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const id = z.uuid().parse(params.id);
    const input = z.strictObject({ version: z.number().int().positive() }).parse(await body(request));
    const result = await db().transaction(async (tx) => {
      const database = tx as unknown as ReturnType<typeof db>;
      await lockContent(database);
      const [old] = await tx.select().from(entries).where(eq(entries.id, id));
      if (!old) throw new HttpError(404, 'Content not found.');
      if (old.deletedAt) throw new HttpError(409, 'Restore this content from the trash first.');
      if (old.version !== input.version)
        throw new HttpError(409, 'Content version conflict. Reload before restoring.');
      if (old.content.body.trim())
        throw new HttpError(409, 'The draft already has a body. Reload before restoring.');
      const content = recoverPublishedBody(old.content, old.published);
      if (!content)
        throw new HttpError(422, 'There is no published body to restore. Use version history.');
      await ensureMedia(database, content);
      // Save the exact pre-recovery draft even when normal autosave checkpoints are throttled.
      await recordRevision(database, old, 'restore');
      const [updated] = await tx
        .update(entries)
        .set({ content, version: old.version + 1, updatedAt: new Date() })
        .where(and(eq(entries.id, id), eq(entries.version, input.version)))
        .returning();
      if (!updated) throw new HttpError(409, 'Content version conflict. Reload before restoring.');
      return updated;
    });
    return json(serializeEntry(result));
  } catch (error) {
    return errorResponse(error);
  }
};
