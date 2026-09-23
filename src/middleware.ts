import { defineMiddleware } from 'astro/middleware';
import { getAuth } from './lib/auth';
import { json } from './lib/http';
import { db, systemState } from './lib/db';
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.user = null;
  const privateRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin');
    const expected = new URL(process.env.SITE_URL || 'http://localhost:4321').origin;
    if (origin !== expected) return json({ error: 'Submit this request from the site itself.' }, 403);
  }
  if (privateRoute) {
    try {
      const session = await getAuth().api.getSession({ headers: context.request.headers });
      const [state] = await db().select().from(systemState);
      if (!session || session.user.id !== state?.ownerId) {
        if (pathname.startsWith('/api/')) return json({ error: 'Sign in with the owner account first.' }, 401);
        return context.redirect('/login');
      }
      context.locals.user = session.user;
    } catch {
      return pathname.startsWith('/api/') ? json({ error: 'Unable to reach the authentication service.' }, 503) : new Response('The service is temporarily unavailable. Please try again.', { status: 503 });
    }
  }
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  if (privateRoute || pathname === '/setup' || pathname === '/login') { response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow'); }
  return response;
});
