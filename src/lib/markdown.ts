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
