import { describe, expect, it } from 'vitest';
import { renderAboutMarkdown } from '../src/lib/about';

describe('關於我主標呈現', () => {
  it.each(['## 關於我', '### About Me', 'About\n---', '## **關於我**'])(
    '開頭的 %s 直接作為主標，保留標題識別碼與內文',
    async (heading) => {
      const source = `${heading}\n\n這是站長自己的介紹\n\n## 正在做的事\n\n持續寫作`;
      const rendered = await renderAboutMarkdown(source);
      expect(rendered.hasTitle).toBe(true);
      expect(rendered.html).toMatch(/^<h1 id="section-[^"]+">/);
      expect(rendered.html.match(/<h1\b/g)).toHaveLength(1);
      expect(rendered.html).toContain('<p>這是站長自己的介紹</p>');
      expect(rendered.html).toContain('<h2 id="section-正在做的事">正在做的事</h2>');
      expect(rendered.toc[0].depth).toBe(1);
      expect(source.startsWith(heading)).toBe(true);
    },
  );

  it('保留既有自訂主標，不加入另一個主標', async () => {
    const rendered = await renderAboutMarkdown('# 嗨，我是 Andy\n\n## 關於我\n\n自訂介紹');
    expect(rendered.hasTitle).toBe(true);
    expect(rendered.html).toContain('<h1 id="section-嗨我是-andy">嗨，我是 Andy</h1>');
    expect(rendered.html).toContain('<h2 id="section-關於我">關於我</h2>');
  });

  it.each(['## 工作經歷\n\n介紹', '開場文字\n\n## 關於我', '## 關於我的工作'])(
    '沒有開頭同名主標時保留原文結構並顯示頁面主標',
    async (source) => {
      const rendered = await renderAboutMarkdown(source);
      expect(rendered.hasTitle).toBe(false);
      expect(rendered.html).not.toContain('<h1');
      expect(rendered.toc[0].depth).toBe(2);
    },
  );
});
