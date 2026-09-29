import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { EntryContent } from './types';
import { contentDiff, type ContentDiff } from './content-diff';
import { renderMarkdown } from './markdown';
import { diagramProblem } from './diagram-policy';
import { checkDiagramSyntax, DIAGRAM_REVIEW_LIMIT } from './diagram-review';

export interface ContentReview {
  version: number;
  warnings: { code: string; message: string }[];
  diff: ContentDiff;
}

export async function reviewContent(
  content: EntryContent,
  published: EntryContent | null,
  options: {
    siteUrl: string;
    currentPath: string;
    publicPaths: ReadonlySet<string>;
    currentPaths?: ReadonlySet<string>;
    publicAnchors?: (pathname: string) => Promise<ReadonlySet<string> | null>;
  },
): Promise<Omit<ContentReview, 'version'>> {
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
  const diagrams: { source: string; line: number }[] = [];
  visit(tree, (node) => {
    if ((node.type === 'image' || node.type === 'imageReference') && !node.alt?.trim())
      missingAlt++;
    if (node.type === 'link') urls.add(node.url);
    if (node.type === 'linkReference') {
      const target = definitions.get(node.identifier.toLowerCase());
      if (target) urls.add(target);
    }
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid')
      diagrams.push({ source: node.value, line: node.position?.start.line || 1 });
  });
  if (missingAlt)
    warnings.push({
      code: 'image-alt',
      message: `${missingAlt} body image${missingAlt === 1 ? ' has' : 's have'} no alternative text`,
    });
  const origin = new URL(options.siteUrl).origin;
  const missing = new Set<string>();
  const fragments = new Map<string, Set<string>>();
  for (const url of urls) {
    try {
      const target = new URL(url, new URL(options.currentPath, options.siteUrl));
      const pathname = decodeURIComponent(target.pathname).replace(/\/$/, '');
      if (target.origin !== origin || !/^\/(articles|projects)\/[^/]+$/.test(pathname)) continue;
      const isCurrent = pathname === options.currentPath || options.currentPaths?.has(pathname);
      if (!isCurrent && !options.publicPaths.has(pathname)) missing.add(pathname);
      else if (target.hash && target.hash !== '#') {
        const id = decodeURIComponent(target.hash.slice(1));
        if (!fragments.has(pathname)) fragments.set(pathname, new Set());
        fragments.get(pathname)!.add(id);
      }
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
  let draftAnchors: Set<string> | undefined;
  let anchorWarnings = 0;
  let checkedPages = 0;
  for (const [pathname, ids] of fragments) {
    if (++checkedPages > 20) {
      warnings.push({
        code: 'more-anchors',
        message: '站內錨點超過 20 篇，請分批檢查其餘目標文章',
      });
      break;
    }
    const isCurrent = pathname === options.currentPath || options.currentPaths?.has(pathname);
    if (isCurrent && !draftAnchors) {
      draftAnchors = new Set((await renderMarkdown(content.body)).toc.map((heading) => heading.id));
      draftAnchors.add('main-content');
      if (options.currentPath.startsWith('/articles/')) draftAnchors.add('article-title');
    }
    const anchors = isCurrent ? draftAnchors : await options.publicAnchors?.(pathname);
    if (!anchors) continue;
    for (const id of ids) {
      if (!anchors.has(id) && ++anchorWarnings <= 20)
        warnings.push({ code: 'broken-anchor', message: `找不到章節錨點：${pathname}#${id}` });
    }
  }
  if (anchorWarnings > 20)
    warnings.push({
      code: 'more-anchors',
      message: `另外有 ${anchorWarnings - 20} 個找不到的章節錨點`,
    });
  const checked = diagrams.slice(0, DIAGRAM_REVIEW_LIMIT);
  const valid: typeof diagrams = [];
  for (const diagram of checked) {
    const problem = diagramProblem(diagram.source);
    if (problem)
      warnings.push({
        code: 'diagram-policy',
        message: `第 ${diagram.line} 行的 Mermaid 圖表不符合支援範圍：${problem}`,
      });
    else valid.push(diagram);
  }
  if (diagrams.length > DIAGRAM_REVIEW_LIMIT)
    warnings.push({
      code: 'more-diagrams',
      message: `本次檢查前 ${DIAGRAM_REVIEW_LIMIT} 張 Mermaid 圖表，其餘 ${diagrams.length - DIAGRAM_REVIEW_LIMIT} 張請分批檢查`,
    });
  const syntax = await checkDiagramSyntax(valid.map((diagram) => diagram.source));
  if (!syntax)
    warnings.push({
      code: 'diagram-unavailable',
      message: 'Mermaid 語法檢查暫時忙碌或逾時，請重試後再確認圖表',
    });
  else
    syntax.forEach((problem, index) => {
      if (problem)
        warnings.push({
          code: 'diagram-syntax',
          message: `第 ${valid[index].line} 行的 Mermaid 圖表語法錯誤：${problem}`,
        });
    });
  return { warnings, diff: contentDiff(published, content) };
}
