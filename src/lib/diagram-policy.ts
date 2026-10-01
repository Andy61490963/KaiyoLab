// 圖表只接受流程圖與循序圖，禁止文章覆寫渲染設定或載入外部資源
export function diagramProblem(source: string): string | null {
  if (source.length > 12000) return 'Diagram exceeds the 12,000 character limit';
  const meaningful = source
    .split('\n')
    .filter((line) => !/^\s*%%(?!\{)/.test(line))
    .join('\n')
    .trim();
  if (
    !/^(?:flowchart\s+(?:TB|TD|BT|RL|LR)|graph\s+(?:TB|TD|BT|RL|LR)|sequenceDiagram)\b/.test(
      meaningful,
    )
  )
    return 'Use a flowchart or sequenceDiagram without configuration frontmatter';
  if (
    /%%\s*\{|(?:^|;)\s*(?:click|link|links|style|classDef|linkStyle)\s|url\s*\(|@\{|<|>/m.test(
      source
        // Mermaid 的純換行標記不是可執行 HTML；只在政策檢查副本中略過。
        // 不接受屬性，不改寫原文；渲染仍使用 strict、SVG 文字與 DOMPurify。
        .replace(/<br[ \t]*\/?>/gi, '')
        .replace(/<<-->>|<<->>|<-->|-->>|->>|<--|-->|->|--\)|-\)|--x|-x|--o|-o/g, ''),
    )
  )
    return 'Diagram links, HTML, custom styles and configuration are not supported';
  return null;
}
