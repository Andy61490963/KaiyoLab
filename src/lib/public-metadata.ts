import type { PublicEntry, SiteSettings } from './types';
import { contentLanguage } from './reading';

export function defaultShareImage(entry?: Pick<PublicEntry, 'kind' | 'slug'>): string {
  return entry ? `/og/${entry.kind}/${encodeURIComponent(entry.slug)}.png` : '/og/site.png';
}

export function articleStructuredData(entry: PublicEntry, settings: SiteSettings, image: string) {
  const url = new URL(`/articles/${encodeURIComponent(entry.slug)}`, settings.siteUrl).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: entry.title,
    description: entry.seoDescription || entry.excerpt,
    inLanguage: contentLanguage(`${entry.title}\n${entry.excerpt}\n${entry.body}`),
    datePublished: entry.publishedAt,
    dateModified: entry.updatedAt,
    image: [new URL(image, settings.siteUrl).href],
    author: {
      '@type': 'Person',
      name: settings.authorName || settings.siteName,
      url: new URL('/about', settings.siteUrl).href,
    },
    publisher: { '@type': 'Organization', name: settings.siteName },
  };
}

/** JSON-LD 直接置入 script 時，避免作者文字成為 HTML 結束標籤 */
export function safeStructuredJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
