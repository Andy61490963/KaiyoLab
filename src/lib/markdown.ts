import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import rehypePrettyCode from 'rehype-pretty-code';
import { visit } from 'unist-util-visit';
export async function renderMarkdown(source: string) {
  const toc: { id: string; text: string; depth: number }[] = [];
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(() => (tree) => {
      visit(tree, 'element', (node: any) => {
        const code = node.tagName === 'pre' && node.children?.[0];
        if (code?.tagName !== 'code' || !code.properties?.className?.includes('language-mermaid'))
          return;
        const text = code.children
          .filter((n: any) => n.type === 'text')
          .map((n: any) => n.value)
          .join('');
        node.tagName = 'figure';
        node.properties = { className: ['markdown-diagram'], dataMarkdownDiagram: '' };
        node.children = [
          {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['diagram-canvas'],
              dataDiagramCanvas: '',
              hidden: true,
              tabIndex: 0,
              role: 'region',
              ariaLabel: '流程圖 / Diagram',
            },
            children: [],
          },
          {
            type: 'element',
            tagName: 'p',
            properties: { className: ['diagram-status'], dataDiagramStatus: '', role: 'status' },
            children: [],
          },
          {
            type: 'element',
            tagName: 'p',
            properties: {
              className: ['diagram-scroll-hint'],
              dataDiagramScrollHint: '',
              hidden: true,
            },
            children: [{ type: 'text', value: 'Scroll sideways · 可左右捲動查看完整圖表' }],
          },
          {
            type: 'element',
            tagName: 'details',
            properties: { open: true, dataDiagramSource: '' },
            children: [
              {
                type: 'element',
                tagName: 'summary',
                properties: {},
                children: [{ type: 'text', value: 'Mermaid · 圖表原始碼' }],
              },
              {
                type: 'element',
                tagName: 'pre',
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'code',
                    properties: { className: ['language-text'] },
                    children: [{ type: 'text', value: text }],
                  },
                ],
              },
            ],
          },
        ];
      });
    })
    .use(rehypeSlug, { prefix: 'section-' })
    .use(() => (tree) => {
      visit(tree, 'element', (node: any) => {
        if (/^h[1-6]$/.test(node.tagName)) {
          let text = '';
          visit(node, 'text', (n: any) => {
            text += n.value;
          });
          toc.push({ id: String(node.properties.id), text, depth: Number(node.tagName[1]) });
        }
        if (node.tagName === 'a') {
          node.properties.rel = ['noopener', 'noreferrer'];
        }
        if (node.tagName === 'img') {
          node.properties.loading = 'lazy';
        }
      });
    })
    .use(rehypePrettyCode, {
      theme: { dark: 'github-dark', light: 'github-light' },
      keepBackground: false,
    })
    .use(rehypeStringify)
    .process(source);
  return {
    html: String(result),
    toc,
    readingMinutes: Math.max(
      1,
      Math.ceil((source.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+/g) || []).length / 350),
    ),
  };
}
