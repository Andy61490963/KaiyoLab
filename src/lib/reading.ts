import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

type TextNode = {
  type: string;
  value?: string;
  lang?: string | null;
  alt?: string | null;
  children?: TextNode[];
};
const parser = unified().use(remarkParse).use(remarkGfm);
export type ContentLanguage = 'zh-Hant' | 'en';

/** 只計算讀者看得到的文字，不納入網址、Markdown 標記或圖表原始碼 */
export function markdownText(source: string, includeCode = true): string {
  const parts: string[] = [];
  const walk = (node: TextNode) => {
    if (node.type === 'html' || node.type === 'definition') return;
    if (node.type === 'code') {
      if (includeCode && node.lang !== 'mermaid') parts.push(node.value || '');
      return;
    }
    if (node.type === 'text' || node.type === 'inlineCode') parts.push(node.value || '');
    else if (node.type === 'image') parts.push(node.alt || '');
    else node.children?.forEach(walk);
  };
  walk(parser.parse(source) as TextNode);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function readingMinutes(source: string): number {
  const text = markdownText(source);
  const units = text.match(/\p{Script=Han}|[a-zA-Z0-9]+/gu) || [];
  return Math.max(1, Math.ceil(units.length / 350));
}

/** 內容語言獨立於介面切換，程式碼不參與中文／英文的判斷 */
export function contentLanguage(source: string): ContentLanguage {
  const text = markdownText(source, false);
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const words = (text.match(/[a-zA-Z]+/g) || []).length;
  return han > 0 && han >= words / 2 ? 'zh-Hant' : 'en';
}

export const openGraphLocale = (language: ContentLanguage) =>
  language === 'zh-Hant' ? 'zh_TW' : 'en_US';
