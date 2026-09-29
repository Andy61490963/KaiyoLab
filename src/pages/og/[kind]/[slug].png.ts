import type { APIRoute } from 'astro';
import { getPublished, getSettings, publishedRedirect } from '../../../lib/content';
import { shareImageResponse } from '../../../lib/share-image';

export const GET: APIRoute = async ({ params, request }) => {
  const { kind, slug } = params;
  if (
    (kind !== 'article' && kind !== 'project') ||
    !slug ||
    slug.length > 160 ||
    !/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(slug)
  )
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  // 每次先確認公開快照，包含 If-None-Match，草稿與已下架內容不讀取快取
  const entry = await getPublished(kind, slug);
  if (!entry) {
    const target = await publishedRedirect(kind, slug);
    if (target) {
      const currentSlug = target.slice(target.lastIndexOf('/') + 1);
      return new Response(null, {
        status: 301,
        headers: {
          Location: `/og/${kind}/${currentSlug}.png`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const settings = await getSettings();
  return shareImageResponse(request, {
    siteName: settings.siteName,
    title: entry.title,
    category: entry.category || (kind === 'article' ? 'ARTICLE' : 'PROJECT'),
    footer: `${settings.authorName || settings.siteName} · ${entry.publishedAt.slice(0, 10)} · ${new URL(settings.siteUrl).host}`,
  });
};
