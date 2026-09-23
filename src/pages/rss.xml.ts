import type { APIRoute } from 'astro';
import { getSettings, allPublished } from '../lib/content';
import { escapeXml as x } from '../lib/xml';
export const GET: APIRoute = async () => {
  const s = await getSettings();
  const all = (await allPublished()).filter((e) => e.kind === 'article').slice(0, 50);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(s.siteName)}</title><link>${x(s.siteUrl)}</link><description>${x(s.description)}</description><language>zh-TW</language>${all.map((e) => `<item><title>${x(e.title)}</title><link>${x(new URL(`/articles/${encodeURIComponent(e.slug)}`, s.siteUrl).href)}</link><guid isPermaLink="false">${x(e.id)}</guid><description>${x(e.excerpt)}</description><pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`,
    {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    },
  );
};
