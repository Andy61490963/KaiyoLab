import { describe, expect, it } from 'vitest';
import {
  constrainGridItem,
  createGridPreset,
  exportGrid,
  gridOverlaps,
  nextGridItem,
  normalizeGrid,
  updateGridItem,
} from '../src/lib/lab/grid-studio';

describe('Grid 排版文件', () => {
  it('三種起始版型的區塊都有獨立位置，重建時不共享陣列', () => {
    for (const preset of ['editorial', 'dashboard', 'gallery'] as const) {
      const document = createGridPreset(preset);
      expect(gridOverlaps(document.items)).toEqual([]);
      document.items[0].column = 100;
      expect(createGridPreset(preset).items[0].column).toBe(1);
    }
  });

  it('縮小格線時先限制跨度，再限制起始位置，不留下隱性欄列', () => {
    const document = normalizeGrid({ ...createGridPreset('editorial'), columns: 2, rows: 1 });
    for (const item of document.items) {
      expect(item.column + item.columnSpan - 1).toBeLessThanOrEqual(2);
      expect(item.row + item.rowSpan - 1).toBe(1);
    }
    expect(gridOverlaps(document.items).length).toBeGreaterThan(0);
  });

  it('位置、跨度及無效數值都受邊界限制', () => {
    const source = createGridPreset('editorial').items[2];
    expect(constrainGridItem({ ...source, column: 999, row: -99 }, 6, 4)).toMatchObject({
      column: 3,
      row: 1,
    });
    expect(
      constrainGridItem({ ...source, columnSpan: 999, rowSpan: NaN, column: Infinity }, 6, 4),
    ).toMatchObject({ column: 1, columnSpan: 6, rowSpan: 1 });
    expect(
      normalizeGrid({ ...createGridPreset('editorial'), columns: NaN, rows: Infinity, gap: -4 }),
    ).toMatchObject({ columns: 6, rows: 4, gap: 0 });
  });

  it('移動只修改指定區塊，保留取消拖曳所需的原始位置', () => {
    const original = createGridPreset('gallery');
    const moved = updateGridItem(original, 'image-b', { column: 1, row: 3 });
    expect(original.items.find((item) => item.id === 'image-b')).toMatchObject({
      column: 3,
      row: 2,
    });
    expect(moved.items.find((item) => item.id === 'image-b')).toMatchObject({ column: 1, row: 3 });
    const restored = updateGridItem(
      moved,
      'image-b',
      original.items.find((item) => item.id === 'image-b')!,
    );
    expect(restored).toEqual(original);
    expect(updateGridItem(original, 'missing', { row: 2 })).toEqual(original);
  });

  it('相鄰區塊不算重疊，交錯或包含只回報一組', () => {
    const base = createGridPreset('gallery').items[0];
    expect(gridOverlaps([base, { ...base, id: 'adjacent', column: 3 }])).toEqual([]);
    expect(gridOverlaps([base, { ...base, id: 'inside', column: 2, columnSpan: 1 }])).toEqual([
      ['feature', 'inside'],
    ]);
  });

  it('新增優先找空格，識別碼不與既有區塊衝突，最多十二個', () => {
    const document = createGridPreset('gallery');
    document.items = document.items.filter((item) => item.id !== 'image-b');
    expect(nextGridItem(document)).toMatchObject({ id: 'block-1', column: 3, row: 2 });
    document.items.push(nextGridItem(document)!);
    expect(nextGridItem(document)?.id).toBe('block-2');
    while (document.items.length < 12) document.items.push(nextGridItem(document)!);
    expect(nextGridItem(document)).toBeNull();
  });

  it('輸出實際欄列、位置、對齊與容器查詢，無需執行 JavaScript', () => {
    const document = { ...createGridPreset('gallery'), gap: 24, align: 'center' as const };
    const output = exportGrid(document);
    expect(output.css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(output.css).toContain('gap: 24px');
    expect(output.css).toContain('align-items: center');
    expect(output.css).toContain('grid-column: 1 / span 2');
    expect(output.css).toContain('@container layout (max-width: 520px)');
    expect(output.standalone).toContain('<meta name="viewport"');
    expect(output.standalone).toContain(output.css);
    expect(output.standalone).toContain(output.html);
    expect(output.standalone).not.toContain('<script');
  });

  it('匯出標籤只作跳脫文字，不把識別碼插入 HTML 或 CSS', () => {
    const document = createGridPreset('gallery');
    document.items[0].id = '"><script>alert(1)</script>';
    document.items[0].label = '<img src=x onerror="alert(1)"> & \'text\'';
    const { html, css } = exportGrid(document);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;text&#39;');
    expect(css).not.toContain('alert');
  });
});
