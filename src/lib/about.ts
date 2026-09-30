import { renderMarkdown } from './markdown';

export async function renderAboutMarkdown(source: string) {
  const rendered = await renderMarkdown(source);
  let hasTitle = rendered.toc.some((heading) => heading.depth === 1);
  const firstHeading = rendered.toc[0];
  // 只調整呈現層級，不改寫站長原文或資料庫中的 Markdown
  if (
    !hasTitle &&
    firstHeading &&
    /^(關於我|about(?: me)?)$/i.test(firstHeading.text.trim()) &&
    /^<h[2-6]\b/.test(rendered.html)
  ) {
    rendered.html = rendered.html.replace(/^<h([2-6])(\b[^>]*>.*?)<\/h\1>/s, '<h1$2</h1>');
    rendered.toc[0] = { ...firstHeading, depth: 1 };
    hasTitle = true;
  }
  return { ...rendered, hasTitle };
}
