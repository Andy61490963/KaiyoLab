import type { APIRoute } from 'astro';
import { json, HttpError } from '../../../lib/http';
import { secret } from '../../../lib/db';
import {
  getArticleViews,
  incrementArticleViews,
  createViewReceipt,
  validViewReceipt,
  viewCookieName,
} from '../../../lib/article-views';
import { VIEW_COOLDOWN_SECONDS } from '../../../lib/view-metrics';

export const ALL: APIRoute = async ({ request, params, cookies, url }) => {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST')
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
    });
  const id = params.id || '';
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return json({ error: 'Article not found.' }, 404);
  if (method === 'POST') {
    const expected = new URL(process.env.SITE_URL || 'http://localhost:4321').origin;
    if (
      request.headers.get('origin') !== expected ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return json({ error: 'Submit this request from the site itself.' }, 403);
    // A Node adapter may expose an empty stream even for a bodyless POST.
    // Read at most one chunk, rejecting any payload without buffering it.
    if (Number(request.headers.get('content-length') || 0) > 0)
      return json({ error: 'This endpoint does not accept a request body.' }, 400);
    const reader = request.body?.getReader();
    if (reader) {
      try {
        const chunk = await reader.read();
        if (!chunk.done) {
          await reader.cancel();
          return json({ error: 'This endpoint does not accept a request body.' }, 400);
        }
      } catch {
        return json({ error: 'Unable to read the request.' }, 400);
      } finally {
        reader.releaseLock();
      }
    }
  }
  try {
    if (
      method === 'GET' ||
      /prefetch/i.test(request.headers.get('sec-purpose') || request.headers.get('purpose') || '')
    )
      return json({ views: await getArticleViews(id) });
    const key = secret('auth-secret', 'BETTER_AUTH_SECRET');
    if (key.length < 32) throw new Error('View receipt key is unavailable.');
    const name = viewCookieName(id);
    if (validViewReceipt(cookies.get(name)?.value, id, key))
      return json({ views: await getArticleViews(id), counted: false });
    const views = await incrementArticleViews(id);
    cookies.set(name, createViewReceipt(id, key), {
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'strict',
      path: `/api/article-views/${id}`,
      maxAge: VIEW_COOLDOWN_SECONDS,
    });
    return json({ views, counted: true });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    // Optional telemetry fails independently; never reveal configuration or connection details.
    return json({ error: 'Views are temporarily unavailable.' }, 503);
  }
};
