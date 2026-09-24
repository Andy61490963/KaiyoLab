import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { EntryContent } from './types';
import { contentDiff, type ContentDiff } from './content-diff';

export interface ContentReview {
  version: number;
  warnings: { code: string; message: string }[];
  diff: ContentDiff;
}

export function reviewContent(
  content: EntryContent,
  published: EntryContent | null,
  options: {
    siteUrl: string;
    currentPath: string;
    publicPaths: ReadonlySet<string>;
  },
): Omit<ContentReview, 'version'> {
  const warnings: ContentReview['warnings'] = [];
  if (!content.excerpt.trim())
    warnings.push({
      code: 'summary',
      message: 'Add a summary for content cards and search results',
    });
  if (content.cover && !content.coverAlt.trim())
    warnings.push({ code: 'cover-alt', message: 'The cover image has no alternative text' });
  const tree = unified().use(remarkParse).parse(content.body);
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => {
    definitions.set(node.identifier.toLowerCase(), node.url);
  });
  let missingAlt = 0;
  const urls = new Set<string>();
  visit(tree, (node) => {
    if ((node.type === 'image' || node.type === 'imageReference') && !node.alt?.trim())
      missingAlt++;
    if (node.type === 'link') urls.add(node.url);
    if (node.type === 'linkReference') {
      const target = definitions.get(node.identifier.toLowerCase());
      if (target) urls.add(target);
    }
  });
  if (missingAlt)
    warnings.push({
      code: 'image-alt',
      message: `${missingAlt} body image${missingAlt === 1 ? ' has' : 's have'} no alternative text`,
    });
  const origin = new URL(options.siteUrl).origin;
  const missing = new Set<string>();
  for (const url of urls) {
    if (url.startsWith('#')) continue;
    try {
      const target = new URL(url, new URL(options.currentPath, options.siteUrl));
      const pathname = decodeURIComponent(target.pathname).replace(/\/$/, '');
      if (
        target.origin === origin &&
        /^\/(articles|projects)\/[^/]+$/.test(pathname) &&
        !options.publicPaths.has(pathname)
      )
        missing.add(pathname);
    } catch {
      /* 無效網址由 Markdown 渲染器處理，不對外發送請求 */
    }
  }
  for (const pathname of [...missing].slice(0, 20))
    warnings.push({ code: 'broken-link', message: `No published content at ${pathname}` });
  if (missing.size > 20)
    warnings.push({
      code: 'more-links',
      message: `${missing.size - 20} more unpublished or missing content links`,
    });
  return { warnings, diff: contentDiff(published, content) };
}
