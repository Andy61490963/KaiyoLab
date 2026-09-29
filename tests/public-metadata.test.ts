import { describe, expect, it } from 'vitest';
import { defaultSettings, emptyContent } from '../src/lib/defaults';
import {
  articleStructuredData,
  defaultShareImage,
  safeStructuredJson,
} from '../src/lib/public-metadata';

describe('公開文章分享資料', () => {
  const entry = {
    ...emptyContent,
    id: 'article-1',
    kind: 'article' as const,
    title: '交易與鎖',
    slug: '交易與鎖',
    body: '這篇說明資料庫交易',
    excerpt: '公開文章摘要',
    publishedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
  };
  const settings = { ...defaultSettings, siteUrl: 'https://example.test', authorName: 'Andy' };
  it('結構資料保留真正的發布與更新時間、作者及文章語言', () => {
    const data = articleStructuredData(entry, settings, defaultShareImage(entry));
    expect(data).toMatchObject({
      '@type': 'BlogPosting',
      headline: entry.title,
      inLanguage: 'zh-Hant',
      datePublished: entry.publishedAt,
      dateModified: entry.updatedAt,
      author: { name: 'Andy', url: 'https://example.test/about' },
    });
    expect(data.image[0]).toBe(
      `https://example.test/og/article/${encodeURIComponent(entry.slug)}.png`,
    );
    expect(defaultShareImage()).toBe('/og/site.png');
  });
  it('作者文字無法提早結束 JSON-LD script', () => {
    const data = { headline: '</script><script>alert(1)</script>&\u2028' };
    const encoded = safeStructuredJson(data);
    expect(encoded).not.toContain('<');
    expect(encoded).not.toContain('&');
    expect(JSON.parse(encoded)).toEqual(data);
  });
});
