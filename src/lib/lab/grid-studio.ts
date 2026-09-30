export type GridAlignment = 'stretch' | 'start' | 'center' | 'end';
export type GridPreset = 'editorial' | 'dashboard' | 'gallery';
export type GridItem = {
  id: string;
  label: string;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
};
export type GridDocument = {
  columns: number;
  rows: number;
  gap: number;
  align: GridAlignment;
  justify: GridAlignment;
  items: GridItem[];
};

export const GRID_MOBILE_BREAKPOINT = 520;
export const GRID_MAX_ITEMS = 12;

export function gridInteger(value: number, min: number, max: number, fallback = min) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

export function constrainGridItem(item: GridItem, columns: number, rows: number): GridItem {
  const columnSpan = gridInteger(item.columnSpan, 1, columns);
  const rowSpan = gridInteger(item.rowSpan, 1, rows);
  return {
    ...item,
    columnSpan,
    rowSpan,
    column: gridInteger(item.column, 1, columns - columnSpan + 1),
    row: gridInteger(item.row, 1, rows - rowSpan + 1),
  };
}

export function normalizeGrid(document: GridDocument): GridDocument {
  const columns = gridInteger(document.columns, 1, 12, 6);
  const rows = gridInteger(document.rows, 1, 8, 4);
  return {
    ...document,
    columns,
    rows,
    gap: gridInteger(document.gap, 0, 48, 16),
    items: document.items.map((item) => constrainGridItem(item, columns, rows)),
  };
}

export function createGridPreset(preset: GridPreset): GridDocument {
  const item = (
    id: string,
    label: string,
    column: number,
    row: number,
    columnSpan = 1,
    rowSpan = 1,
  ): GridItem => ({ id, label, column, row, columnSpan, rowSpan });
  const presets: Record<GridPreset, GridDocument> = {
    editorial: {
      columns: 6,
      rows: 4,
      gap: 16,
      align: 'stretch',
      justify: 'stretch',
      items: [
        item('header', 'Header', 1, 1, 6),
        item('sidebar', 'Sidebar', 1, 2, 2, 3),
        item('content', 'Content', 3, 2, 4, 2),
        item('detail', 'Detail', 3, 4, 2),
        item('footer', 'Footer', 5, 4, 2),
      ],
    },
    dashboard: {
      columns: 6,
      rows: 4,
      gap: 12,
      align: 'stretch',
      justify: 'stretch',
      items: [
        item('header', 'Header', 1, 1, 6),
        item('sidebar', 'Sidebar', 1, 2, 1, 3),
        item('chart', 'Chart', 2, 2, 3, 2),
        item('activity', 'Activity', 5, 2, 2, 2),
        item('metric', 'Metric', 2, 4, 2),
        item('table', 'Table', 4, 4, 3),
      ],
    },
    gallery: {
      columns: 4,
      rows: 3,
      gap: 16,
      align: 'stretch',
      justify: 'stretch',
      items: [
        item('feature', 'Feature', 1, 1, 2, 2),
        item('image-a', 'Image A', 3, 1, 2),
        item('image-b', 'Image B', 3, 2),
        item('image-c', 'Image C', 4, 2, 1, 2),
        item('caption', 'Caption', 1, 3, 2),
        item('image-d', 'Image D', 3, 3),
      ],
    },
  };
  return presets[preset];
}

export function updateGridItem(
  document: GridDocument,
  id: string,
  change: Partial<Pick<GridItem, 'column' | 'row' | 'columnSpan' | 'rowSpan'>>,
): GridDocument {
  return {
    ...document,
    items: document.items.map((item) =>
      item.id === id
        ? constrainGridItem({ ...item, ...change }, document.columns, document.rows)
        : item,
    ),
  };
}

export function gridOverlaps(items: GridItem[]): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  items.forEach((a, index) => {
    items.slice(index + 1).forEach((b) => {
      if (
        a.column < b.column + b.columnSpan &&
        b.column < a.column + a.columnSpan &&
        a.row < b.row + b.rowSpan &&
        b.row < a.row + a.rowSpan
      ) {
        result.push([a.id, b.id]);
      }
    });
  });
  return result;
}

export function nextGridItem(document: GridDocument): GridItem | null {
  if (document.items.length >= GRID_MAX_ITEMS) return null;
  let number = 1;
  while (document.items.some((item) => item.id === `block-${number}`)) number++;
  const base: GridItem = {
    id: `block-${number}`,
    label: `Block ${number}`,
    column: 1,
    row: 1,
    columnSpan: 1,
    rowSpan: 1,
  };
  for (let row = 1; row <= document.rows; row++) {
    for (let column = 1; column <= document.columns; column++) {
      const candidate = { ...base, row, column };
      if (
        !gridOverlaps([...document.items, candidate]).some(
          ([a, b]) => a === base.id || b === base.id,
        )
      )
        return candidate;
    }
  }
  return base;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

// 使用索引組成 class，內容標籤只放進經過跳脫的文字節點
export function exportGrid(document: GridDocument) {
  const normalized = normalizeGrid(document);
  const { columns, rows, gap, align, justify, items } = normalized;
  const css = `.layout-container {
  container: layout / inline-size;
}

.layout-grid {
  display: grid;
  grid-template-columns: repeat(${columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${rows}, minmax(80px, 1fr));
  gap: ${gap}px;
  align-items: ${align};
  justify-items: ${justify};
}

.layout-block {
  min-width: 0;
  min-height: 48px;
  padding: 16px;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  border: 1px solid #b8b6af;
  background: #efeee8;
  color: #242526;
  font: 16px/1.5 system-ui, sans-serif;
}

${items
  .map(
    (item, index) => `.layout-item-${index + 1} {
  grid-column: ${item.column} / span ${item.columnSpan};
  grid-row: ${item.row} / span ${item.rowSpan};
}`,
  )
  .join('\n\n')}

@container layout (max-width: ${GRID_MOBILE_BREAKPOINT}px) {
  .layout-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-auto-rows: minmax(80px, auto);
    align-items: stretch;
    justify-items: stretch;
  }
  .layout-block {
    grid-column: auto;
    grid-row: auto;
  }
}`;
  const html = `<div class="layout-container">
  <div class="layout-grid">
${items.map((item, index) => `    <div class="layout-block layout-item-${index + 1}">${escapeHtml(item.label)}</div>`).join('\n')}
  </div>
</div>`;
  const standalone = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grid 排版</title>
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
  return { css, html, standalone };
}
