import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { diagramProblem } from '../src/lib/diagram-policy';
import { renderMarkdown } from '../src/lib/markdown';
import { reviewContent } from '../src/lib/content-review';
import { emptyContent } from '../src/lib/defaults';
import { diagramFence, guidFlowchart, lineBreakDiagrams } from './fixtures/diagram-line-breaks';

describe('Mermaid plain line breaks', () => {
  it.each(['<br>', '<br/>', '<br />', '<BR>', '<BR/>', '<Br />', '<br\t/>'])(
    'allows attribute-free %s in flowchart and sequence labels',
    (lineBreak) => {
      expect(diagramProblem(guidFlowchart.replaceAll('<br/>', lineBreak))).toBeNull();
      expect(diagramProblem(`sequenceDiagram\n  Note over MES: 同一命令${lineBreak}同一識別碼`)).toBeNull();
    },
  );

  it.each([
    '<br onclick="alert(1)">', '<br onmouseover=alert(1)/>',
    '<br style="background:url(https://example.invalid/a)">', '<br class=label>',
    '<br data-value=x/>', '<br/ onload=alert(1)>', '<br\nonclick=alert(1)>',
    '<br x=""><img src=x onerror=alert(1)>', '<br><script>alert(1)</script>',
    '<br><img src=x onerror=alert(1)>', '<br><svg onload=alert(1)>',
    '<br><a href="javascript:alert(1)">link</a>', '<bravo>', '<b<br>r onclick=alert(1)>',
  ])('still rejects attributes and other HTML: %s', (label) => {
    expect(diagramProblem(`flowchart TB\n  A[${label}] --> B`)).not.toBeNull();
  });

  it('line breaks do not bypass directives, links, external resources or source size limits', () => {
    for (const suffix of [
      '\n  click A "https://example.invalid"',
      '; click A "javascript:alert(1)"',
      '\n  classDef unsafe fill:#f00',
      '\n  linkStyle 0 stroke:url(https://example.invalid/a)',
      '\n  B@{img: "https://example.invalid/a"}',
      '\n%%{init: {"securityLevel":"loose"}}%%',
    ]) expect(diagramProblem(guidFlowchart + suffix)).not.toBeNull();
    expect(diagramProblem(`flowchart TB\n A[${'<br/>'.repeat(2500)}]`)).not.toBeNull();
  });

  it('Markdown preserves line-break markers and source lines as escaped text', async () => {
    const result = await renderMarkdown(diagramFence(guidFlowchart));
    const dom = new JSDOM(result.html);
    try {
      const source = dom.window.document.querySelector('[data-diagram-source] code');
      // Pretty-code pads empty lines with a space; preserve all non-empty lines verbatim.
      const renderedSource = source?.textContent?.replace(/^[ \t]+$/gm, '').trimEnd();
      expect(renderedSource).toBe(guidFlowchart);
      expect(source?.querySelector('br')).toBeNull();
      expect(dom.window.document.querySelector('script, img, iframe')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('publication review accepts the same sources, while genuine syntax errors remain errors', async () => {
    const content = {
      ...emptyContent,
      title: 'Line-break regression', slug: 'line-break-regression', excerpt: 'Regression fixture',
      body: lineBreakDiagrams.map(diagramFence).join('\n\n'),
    };
    const options = {
      siteUrl: 'https://example.test', currentPath: '/articles/line-break-regression',
      publicPaths: new Set<string>(),
    };
    const valid = await reviewContent(content, null, options);
    expect(valid.warnings.filter((warning) => warning.code.startsWith('diagram-'))).toEqual([]);
    const invalid = await reviewContent({
      ...content, body: diagramFence('flowchart TB\n  A[unclosed<br/>label'),
    }, null, options);
    expect(invalid.warnings.map((warning) => warning.code)).toContain('diagram-syntax');
  }, 20000);
});
