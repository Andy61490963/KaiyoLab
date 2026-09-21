import type { APIRoute } from 'astro';
import { getSettings } from '../lib/content';
export const GET: APIRoute = async () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nDisallow: /setup\nDisallow: /login\nSitemap: ${new URL('/sitemap.xml', (await getSettings()).siteUrl).href}`,
    { headers: { 'Content-Type': 'text/plain' } },
  );
