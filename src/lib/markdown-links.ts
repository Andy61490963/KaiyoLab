import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';
import type { Definition, Image, Link, Root } from 'mdast';

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
type UrlNode = Definition | Image | Link;

// 只重建有修改的連結節點，保留程式碼、段落格式與其他原始文字
export function rewriteMarkdownUrls(source: string, resolve: (url: string) => string) {
  const tree = markdown.parse(source);
  const changes: { from: string; to: string }[] = [];
  const edits: { start: number; end: number; node: UrlNode }[] = [];
  visit(tree, (node) => {
    if (!['link', 'image', 'definition'].includes(node.type)) return;
    const target = node as UrlNode;
    const next = resolve(target.url);
    if (next === target.url) return;
    const start = target.position?.start.offset;
    const end = target.position?.end.offset;
    if (start === undefined || end === undefined) return;
    changes.push({ from: target.url, to: next });
    target.url = next;
    edits.push({ start, end, node: target });
  });
  // 外層連結可能包住圖片，序列化外層一次即可包含內層的新網址
  const outer: typeof edits = [];
  for (const edit of edits.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = outer.at(-1);
    if (!previous || edit.start >= previous.end) outer.push(edit);
  }
  let text = source;
  for (const edit of outer.sort((a, b) => b.start - a.start)) {
    const tree: Root = {
      type: 'root',
      children: [
        edit.node.type === 'definition' ? edit.node : { type: 'paragraph', children: [edit.node] },
      ],
    };
    const replacement = markdown.stringify(tree).replace(/\n$/, '');
    text = `${text.slice(0, edit.start)}${replacement}${text.slice(edit.end)}`;
  }
  return { text, changes };
}

export function archiveUrl(url: string, currentPath: string, sourceOrigin?: string) {
  if (!url || url.startsWith('#') || url.includes('\\')) return null;
  // 舊封存檔沒有來源網域時，不猜測絕對網址是否屬於站內
  if (!sourceOrigin && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return null;
  try {
    const origin = sourceOrigin || 'https://archive.invalid';
    const target = new URL(url, new URL(currentPath, origin));
    if (target.origin !== origin || target.username || target.password) return null;
    return target;
  } catch {
    return null;
  }
}
