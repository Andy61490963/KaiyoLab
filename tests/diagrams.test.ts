import { describe, expect, it } from 'vitest';
import { diagramProblem } from '../src/lib/diagram-policy';
import { renderMarkdown } from '../src/lib/markdown';

describe('Markdown 圖表與安全界線', () => {
  it('接受中文流程圖、註解、分支與循序圖回應箭頭', () => {
    for (const source of [
      'flowchart TD\n  A[工單下達] --> B{可投入}\n  B -->|是| C[開始作業]',
      '%% 工單狀態\nflowchart LR\n  A[待處理] --> B[已完成]',
      'sequenceDiagram\n  participant M as MES\n  participant D as 資料庫\n  M->>D: 比對版本\n  D-->>M: 已提交',
    ])
      expect(diagramProblem(source), source).toBeNull();
  });

  it('拒絕 frontmatter、設定覆寫、HTML、外部圖片及自訂樣式', () => {
    for (const source of [
      '---\nconfig:\n  securityLevel: loose\n---\nflowchart TD\n  A-->B',
      '%%{init: {"securityLevel": "loose"}}%%\nflowchart TD\n  A-->B',
      'flowchart TD\n  A[<img src=x onerror=alert(1)>] --> B',
      'flowchart TD\n  A@{img: "https://example.invalid/a.svg"}',
      'flowchart TD\n  classDef red fill:#f00',
      'flowchart TD\n  style A fill:#f00',
      'flowchart TD\n  A-->B\n  linkStyle 0 stroke:url(https://example.invalid/diagram.svg)',
      'flowchart TD\n  click A "javascript:alert(1)"',
    ])
      expect(diagramProblem(source), source).not.toBeNull();
  });

  it('同一行的分號語法也不能啟用連結與互動', () => {
    expect(diagramProblem('flowchart TD; A-->B; click A "https://example.invalid"')).not.toBeNull();
  });

  it('限制來源大小與支援的圖表類型', () => {
    expect(diagramProblem(`flowchart TD\n${'A'.repeat(12000)}`)).not.toBeNull();
    expect(diagramProblem('pie\n  "數量": 42')).not.toBeNull();
  });

  it('保留無 JavaScript 可閱讀的原始碼且不執行原始 HTML', async () => {
    const source = 'flowchart TD\n  A[<img src=x onerror=alert(1)>] --> B';
    const result = await renderMarkdown(`## 生產流程\n\n\`\`\`mermaid\n${source}\n\`\`\``);
    expect(result.toc).toEqual([{ id: 'section-生產流程', text: '生產流程', depth: 2 }]);
    expect(result.html).toContain('data-markdown-diagram');
    expect(result.html).toContain('<details open');
    expect(result.html).toContain('data-diagram-canvas');
    expect(result.html).toContain('&#x3C;img');
    expect(result.html).not.toContain('<img');
    expect(result.html).not.toContain('<script');
  });

  it('一般程式碼與行內 mermaid 字樣不產生圖表', async () => {
    const result = await renderMarkdown('`mermaid`\n\n```typescript\nconst mermaid = true;\n```');
    expect(result.html).not.toContain('data-markdown-diagram');
    expect(result.html).toContain('data-rehype-pretty-code');
  });
});
