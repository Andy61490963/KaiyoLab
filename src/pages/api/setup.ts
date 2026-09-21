import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, systemState, settings, secret } from '../../lib/db';
import { createAuth } from '../../lib/auth';
import { body, json, errorResponse, HttpError } from '../../lib/http';
import { defaultSettings } from '../../lib/defaults';
export const POST: APIRoute = async ({ request }) => {
  try {
    const input = z
      .object({
        token: z.string().max(200),
        email: z.email(),
        password: z.string().min(12).max(128),
        name: z.string().trim().min(1).max(100),
        siteName: z.string().trim().min(1).max(80),
      })
      .parse(await body(request));
    const token = secret('setup-token', 'SETUP_TOKEN');
    const received = Buffer.from(input.token);
    const expected = Buffer.from(token);
    if (!token || received.length !== expected.length || !timingSafeEqual(received, expected))
      throw new HttpError(403, '初始化碼不正確。');
    await db().transaction(async (tx) => {
      const state = await tx.execute(sql`SELECT * FROM system_state WHERE id=1 FOR UPDATE`);
      if (state.rows[0]?.setup_complete) throw new HttpError(409, '網站已完成初始化。');
      const auth = createAuth(tx as unknown as ReturnType<typeof db>, true);
      const result = await auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name: input.name },
      });
      await tx
        .update(systemState)
        .set({ ownerId: result.user.id, setupComplete: true })
        .where(eq(systemState.id, 1));
      await tx
        .insert(settings)
        .values({
          id: 1,
          value: { ...defaultSettings, siteName: input.siteName, authorName: input.name },
        })
        .onConflictDoNothing();
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
