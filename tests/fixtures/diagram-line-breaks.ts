// Keep the reported source unchanged: unquoted labels and self-closing line breaks.
export const guidFlowchart = `flowchart TB
    A[MES Instance A<br/>Guid.NewGuid]
    B[MES Instance B<br/>Guid.NewGuid]
    C[MES Instance C<br/>Guid.NewGuid]

    A --> SAP
    B --> SAP
    C --> SAP`;

export const lineBreakDiagrams = [
  guidFlowchart,
  'flowchart LR\n  A["第一行<br>第二行"] --> B["第三行<br />第四行"]',
  'graph TB\n  A["工作站 A<BR/>Guid.NewGuid()"] --> B["送往 SAP"]',
  'sequenceDiagram\n  participant MES\n  participant SAP\n  MES->>SAP: 入庫<br/>沿用識別碼\n  Note over MES,SAP: 相同 TransactionId<br />判定為同一次業務操作\n  SAP-->>MES: 已完成',
];

export const diagramFence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``;
