import type { APIRoute } from 'astro';
import { getSettings } from '../../lib/content';
import { shareImageResponse } from '../../lib/share-image';

export const GET: APIRoute = async ({ request }) => {
  const settings = await getSettings();
  return shareImageResponse(request, {
    siteName: settings.siteName,
    title: settings.tagline || settings.siteName,
    category: 'NOTES & PROJECTS',
    footer: `${settings.authorName || settings.siteName} · ${new URL(settings.siteUrl).host}`,
  });
};
