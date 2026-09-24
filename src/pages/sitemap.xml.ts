import type { APIRoute } from 'astro';
import { getSettings, allPublished } from '../lib/content';
import { escapeXml as x } from '../lib/xml';
export const GET: APIRoute = async () => {
  const s = await getSettings();
  const all = await allPublished();
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/articles', '/projects', '/about'].map((p) => `<url><loc>${x(new URL(p, s.siteUrl).href)}</loc></url>`).join('')}${all.map((e) => `<url><loc>${x(new URL(`/${e.kind === 'article' ? 'articles' : 'projects'}/${encodeURIComponent(e.slug)}`, s.siteUrl).href)}</loc><lastmod>${e.updatedAt}</lastmod></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } },
  );
};
