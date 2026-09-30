import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Grip,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useLabEnvironment } from './useLabEnvironment';
import {
  createGridPreset,
  exportGrid,
  GRID_MOBILE_BREAKPOINT,
  gridOverlaps,
  nextGridItem,
  normalizeGrid,
  updateGridItem,
  type GridAlignment,
  type GridDocument,
  type GridItem,
  type GridPreset,
} from '../../lib/lab/grid-studio';
import '../../styles/lab-grid-studio.css';

type Drag = {
  id: number;
  itemId: string;
  origin: GridItem;
  x: number;
  y: number;
  pitchX: number;
  pitchY: number;
  element: HTMLButtonElement;
};
const widths = [390, 768, 1200] as const;

export default function GridStudio() {
  const { t, visible } = useLabEnvironment();
  const [document, setDocument] = useState<GridDocument>(() => createGridPreset('editorial'));
  const [preset, setPreset] = useState<GridPreset>('editorial');
  const [selected, setSelected] = useState('content');
  const [previewWidth, setPreviewWidth] = useState<number>(768);
  const [availableWidth, setAvailableWidth] = useState(640);
  const [showGuides, setShowGuides] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [codeTab, setCodeTab] = useState<'css' | 'html' | 'standalone'>('css');
  const [feedback, setFeedback] = useState<
    'changed' | 'cancelled' | 'copied' | 'copy-failed' | 'invalid' | 'preset' | ''
  >('');
  const container = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const code = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<Drag | null>(null);
  const state = useRef(document);
  state.current = document;
  const selectedItem = document.items.find((item) => item.id === selected) ?? document.items[0];
  const overlaps = useMemo(() => gridOverlaps(document.items), [document.items]);
  const exported = useMemo(() => exportGrid(document), [document]);
  const copyRequest = useRef(0);
  const exportedRef = useRef(exported);
  exportedRef.current = exported;
  const scale = Math.min(1, availableWidth / previewWidth);
  const stacked = previewWidth <= GRID_MOBILE_BREAKPOINT;
  const frameHeight =
    (stacked ? document.items.length : document.rows) * 80 +
    ((stacked ? document.items.length : document.rows) - 1) * document.gap;

  useEffect(() => {
    if (!container.current) return;
    if (window.innerWidth < 650) setPreviewWidth(390);
    const observer = new ResizeObserver(([entry]) => {
      cancelDrag();
      setAvailableWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  function cancelDrag(pointer?: number) {
    const current = drag.current;
    if (!current || (pointer !== undefined && pointer !== current.id)) return;
    drag.current = null;
    setDocument((previous) => updateGridItem(previous, current.itemId, current.origin));
    if (current.element.hasPointerCapture(current.id))
      current.element.releasePointerCapture(current.id);
    setDragging(false);
    setFeedback('cancelled');
  }

  useEffect(() => {
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        cancelDrag();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  useEffect(() => {
    if (!visible) cancelDrag();
  }, [visible]);

  useEffect(() => {
    if (feedback === 'copy-failed') {
      code.current?.focus();
      code.current?.select();
    }
  }, [feedback, codeTab]);

  useEffect(() => {
    copyRequest.current++;
    setFeedback((previous) =>
      previous === 'copied' || previous === 'copy-failed' ? 'changed' : previous,
    );
    return () => {
      copyRequest.current++;
    };
  }, [exported]);

  function choosePreset(value: GridPreset) {
    copyRequest.current++;
    cancelDrag();
    const next = createGridPreset(value);
    setDocument(next);
    setPreset(value);
    setSelected(next.items[0].id);
    setFeedback('preset');
  }

  function updateGeometry(key: 'columns' | 'rows' | 'gap', value: number) {
    if (!Number.isFinite(value)) return setFeedback('invalid');
    cancelDrag();
    setDocument((previous) => normalizeGrid({ ...previous, [key]: value }));
    setFeedback('changed');
  }

  function changeItem(
    change: Partial<Pick<GridItem, 'column' | 'row' | 'columnSpan' | 'rowSpan'>>,
  ) {
    if (!selectedItem) return;
    if (Object.values(change).some((value) => !Number.isFinite(value)))
      return setFeedback('invalid');
    setDocument((previous) => updateGridItem(previous, selectedItem.id, change));
    setFeedback('changed');
  }

  function moveItem(dx: number, dy: number) {
    if (!selectedItem) return;
    changeItem({ column: selectedItem.column + dx, row: selectedItem.row + dy });
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, item: GridItem) {
    if (event.button !== 0 || drag.current) return;
    setSelected(item.id);
    if (stacked || !grid.current) return;
    const rect = grid.current.getBoundingClientRect();
    const gap = document.gap * scale;
    drag.current = {
      id: event.pointerId,
      itemId: item.id,
      origin: { ...item },
      x: event.clientX,
      y: event.clientY,
      pitchX: (rect.width + gap) / document.columns,
      pitchY: (rect.height + gap) / document.rows,
      element: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDragging(true);
    setFeedback('');
  }

  function continueDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const column = current.origin.column + Math.round((event.clientX - current.x) / current.pitchX);
    const row = current.origin.row + Math.round((event.clientY - current.y) / current.pitchY);
    const item = state.current.items.find((entry) => entry.id === current.itemId);
    if (item?.column === column && item.row === row) return;
    setDocument((previous) => updateGridItem(previous, current.itemId, { column, row }));
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    setFeedback('changed');
  }

  function keyItem(event: KeyboardEvent<HTMLButtonElement>, item: GridItem) {
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!movement[event.key] || stacked || drag.current) return;
    event.preventDefault();
    const [dx, dy] = movement[event.key];
    setSelected(item.id);
    setDocument((previous) =>
      updateGridItem(
        previous,
        item.id,
        event.shiftKey
          ? { columnSpan: item.columnSpan + dx, rowSpan: item.rowSpan + dy }
          : { column: item.column + dx, row: item.row + dy },
      ),
    );
    setFeedback('changed');
  }

  function chooseCodeTab(next: 'css' | 'html' | 'standalone') {
    copyRequest.current++;
    setFeedback('');
    setCodeTab(next);
  }

  async function copyCode(standalone: boolean) {
    const format = standalone ? 'standalone' : codeTab;
    const snapshot = exported[format];
    const request = ++copyRequest.current;
    if (standalone) setCodeTab('standalone');
    setFeedback('');
    try {
      await navigator.clipboard.writeText(snapshot);
      if (request === copyRequest.current && exportedRef.current[format] === snapshot)
        setFeedback('copied');
    } catch {
      // 保留可選取的原始碼，權限被拒絕時仍可使用鍵盤複製
      if (request === copyRequest.current && exportedRef.current[format] === snapshot)
        setFeedback('copy-failed');
    }
  }

  const status = {
    changed: t('排版已更新', 'Layout updated'),
    cancelled: t('已取消拖曳，回到原位置', 'Drag cancelled, original position restored'),
    copied: t('已複製', 'Copied'),
    'copy-failed': t(
      '無法存取剪貼簿，請選取下方程式碼後按 Ctrl／⌘ + C',
      'Clipboard unavailable — select the code below and press Ctrl / ⌘ + C',
    ),
    invalid: t('請輸入有效數字', 'Enter a valid number'),
    preset: t('已載入版型', 'Preset loaded'),
    '': t('拖曳區塊，或選取後用方向鍵移動', 'Drag a block, or select one and use the arrow keys'),
  }[feedback];

  return (
    <section
      className="grid-studio"
      data-grid-studio
      data-dragging={dragging}
      aria-label={t('Grid 排版工具', 'CSS Grid studio')}
    >
      <div
        className="grid-studio-choices"
        role="group"
        aria-label={t('選一個版型', 'Choose a layout')}
      >
        {(['editorial', 'dashboard', 'gallery'] as const).map((value, index) => (
          <button
            type="button"
            className="lab-button"
            key={value}
            aria-pressed={preset === value}
            onClick={() => choosePreset(value)}
          >
            {t(
              ['內容網站', '管理面板', '作品畫廊'][index],
              ['Editorial', 'Dashboard', 'Gallery'][index],
            )}
          </button>
        ))}
      </div>
      <div className="grid-studio-workspace">
        <div className="grid-studio-preview">
          <div className="grid-studio-preview-bar">
            <div
              className="grid-studio-widths"
              role="group"
              aria-label={t('預覽寬度', 'Preview width')}
            >
              {widths.map((width) => (
                <button
                  key={width}
                  type="button"
                  className="lab-button"
                  aria-pressed={previewWidth === width}
                  onClick={() => {
                    cancelDrag();
                    setPreviewWidth(width);
                  }}
                >
                  {t(
                    width === 390 ? '手機' : width === 768 ? '平板' : '桌機',
                    width === 390 ? 'Phone' : width === 768 ? 'Tablet' : 'Desktop',
                  )}
                  <span>{width}px</span>
                </button>
              ))}
            </div>
            <label className="grid-studio-toggle">
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(event) => setShowGuides(event.target.checked)}
              />
              {t('格線', 'Guides')}
            </label>
          </div>
          <div className="grid-studio-preview-caption">
            <span>
              {stacked
                ? t('窄版自動依 DOM 順序單欄排列', 'Narrow layout follows DOM order in one column')
                : t('拖曳方塊，試試不同的排列', 'Drag the blocks and try another arrangement')}
            </span>
            <span>{Math.round(scale * 100)}%</span>
          </div>
          <div className="grid-studio-canvas" ref={container}>
            <div
              className="grid-studio-frame-holder"
              style={{ height: frameHeight * scale, width: previewWidth * scale }}
            >
              <div
                className="grid-studio-frame"
                data-preview-width={previewWidth}
                style={{ width: previewWidth, transform: `scale(${scale})` }}
              >
                <div
                  className="grid-studio-grid"
                  ref={grid}
                  data-stacked={stacked}
                  style={
                    {
                      '--grid-columns': document.columns,
                      '--grid-rows': document.rows,
                      '--grid-gap': `${document.gap}px`,
                      '--grid-align': document.align,
                      '--grid-justify': document.justify,
                    } as CSSProperties
                  }
                >
                  {showGuides &&
                    !stacked &&
                    Array.from({ length: document.columns * document.rows }, (_, index) => (
                      <span
                        aria-hidden="true"
                        className="grid-studio-guide"
                        key={`guide-${index}`}
                        style={{
                          gridColumn: (index % document.columns) + 1,
                          gridRow: Math.floor(index / document.columns) + 1,
                        }}
                      />
                    ))}
                  {document.items.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`grid-studio-block grid-studio-tone-${index % 4}`}
                      data-grid-item={item.id}
                      data-column={item.column}
                      data-row={item.row}
                      data-column-span={item.columnSpan}
                      data-row-span={item.rowSpan}
                      aria-label={`${item.label} ${t('區塊', 'block')}`}
                      aria-pressed={selectedItem?.id === item.id}
                      aria-describedby="grid-studio-instructions"
                      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown Escape"
                      style={{
                        gridColumn: `${item.column} / span ${item.columnSpan}`,
                        gridRow: `${item.row} / span ${item.rowSpan}`,
                      }}
                      onClick={() => setSelected(item.id)}
                      onFocus={() => setSelected(item.id)}
                      onPointerDown={(event) => beginDrag(event, item)}
                      onPointerMove={continueDrag}
                      onPointerUp={finishDrag}
                      onPointerCancel={(event) => cancelDrag(event.pointerId)}
                      onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
                      onKeyDown={(event) => keyItem(event, item)}
                    >
                      <span className="grid-studio-block-number">
                        {String(index + 1).padStart(2, '0')}
                        <Grip size={17} />
                      </span>
                      <strong>{item.label}</strong>
                      <span className="grid-studio-block-size">
                        {item.columnSpan} × {item.rowSpan}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p id="grid-studio-instructions" className="lab-note">
            {t(
              '方向鍵移動，Shift + 方向鍵調整跨度，Esc 取消拖曳，窄版預覽請使用下方位置欄位',
              'Arrow keys move · Shift + arrows resize · Esc cancels drag · use position fields in narrow preview',
            )}
          </p>
        </div>
      </div>

      <div className="grid-studio-status" role="status" aria-live="polite">
        <span>{status}</span>
        <span>
          {document.items.length} {t('區塊', 'blocks')} · {document.columns} × {document.rows}
        </span>
      </div>
      {overlaps.length > 0 && (
        <p className="grid-studio-warning" role="note">
          {t(
            `有 ${overlaps.length} 組區塊重疊，輸出會保留重疊，後面的區塊顯示在上層，可用「選取區塊」切換被遮住的項目`,
            `${overlaps.length} overlapping pair(s) — export preserves overlap, later blocks paint on top; use Selected block to reach covered items`,
          )}
        </p>
      )}
      <details className="grid-studio-advanced" data-lab-advanced>
        <summary>{t('進階設定與匯出', 'Advanced settings & export')}</summary>
        <div className="grid-studio-toolbar">
          <label className="lab-field">
            {t('起始版型', 'Preset')}
            <select
              aria-label={t('起始版型', 'Preset')}
              value={preset}
              onChange={(event) => choosePreset(event.target.value as GridPreset)}
            >
              <option value="editorial">{t('內容網站', 'Editorial')}</option>
              <option value="dashboard">{t('管理面板', 'Dashboard')}</option>
              <option value="gallery">{t('作品畫廊', 'Gallery')}</option>
            </select>
          </label>
          <label className="lab-field">
            {t('欄數', 'Columns')}
            <input
              aria-label={t('欄數', 'Columns')}
              type="number"
              min="1"
              max="12"
              value={document.columns}
              onChange={(event) => updateGeometry('columns', event.target.valueAsNumber)}
            />
          </label>
          <label className="lab-field">
            {t('列數', 'Rows')}
            <input
              aria-label={t('列數', 'Rows')}
              type="number"
              min="1"
              max="8"
              value={document.rows}
              onChange={(event) => updateGeometry('rows', event.target.valueAsNumber)}
            />
          </label>
          <label className="lab-field">
            {t('間距', 'Gap')}{' '}
            <span className="grid-studio-input-unit">
              <input
                aria-label={t('間距', 'Gap')}
                type="number"
                min="0"
                max="48"
                value={document.gap}
                onChange={(event) => updateGeometry('gap', event.target.valueAsNumber)}
              />
              <span>px</span>
            </span>
          </label>
          <button type="button" className="lab-button" onClick={() => choosePreset(preset)}>
            <RotateCcw size={15} />
            {t('重設', 'Reset')}
          </button>
        </div>

        <aside className="grid-studio-inspector" aria-label={t('區塊屬性', 'Block properties')}>
          <div className="grid-studio-inspector-title">
            <span>INSPECTOR</span>
            <button
              type="button"
              className="lab-button"
              disabled={document.items.length >= 12}
              onClick={() => {
                const item = nextGridItem(document);
                if (item) {
                  setDocument((previous) => ({ ...previous, items: [...previous.items, item] }));
                  setSelected(item.id);
                  setFeedback('changed');
                }
              }}
            >
              <Plus size={15} />
              {t('新增區塊', 'Add block')}
            </button>
          </div>
          <label className="lab-field">
            {t('選取區塊', 'Selected block')}
            <select
              aria-label={t('選取區塊', 'Selected block')}
              value={selectedItem?.id}
              onChange={(event) => setSelected(event.target.value)}
            >
              {document.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {selectedItem && (
            <>
              <div className="grid-studio-properties">
                {(['column', 'row', 'columnSpan', 'rowSpan'] as const).map((key, index) => (
                  <label className="lab-field" key={key}>
                    {
                      [
                        t('起始欄', 'Start column'),
                        t('起始列', 'Start row'),
                        t('跨欄', 'Column span'),
                        t('跨列', 'Row span'),
                      ][index]
                    }
                    <input
                      aria-label={
                        [
                          t('起始欄', 'Start column'),
                          t('起始列', 'Start row'),
                          t('跨欄', 'Column span'),
                          t('跨列', 'Row span'),
                        ][index]
                      }
                      type="number"
                      min="1"
                      max={
                        key === 'column'
                          ? document.columns - selectedItem.columnSpan + 1
                          : key === 'row'
                            ? document.rows - selectedItem.rowSpan + 1
                            : key === 'columnSpan'
                              ? document.columns
                              : document.rows
                      }
                      value={selectedItem[key]}
                      onChange={(event) => changeItem({ [key]: event.target.valueAsNumber })}
                    />
                  </label>
                ))}
              </div>
              <div
                className="grid-studio-move"
                role="group"
                aria-label={t('移動選取區塊', 'Move selected block')}
              >
                {[
                  { icon: ArrowLeft, dx: -1, dy: 0, zh: '向左', en: 'Move left' },
                  { icon: ArrowUp, dx: 0, dy: -1, zh: '向上', en: 'Move up' },
                  { icon: ArrowDown, dx: 0, dy: 1, zh: '向下', en: 'Move down' },
                  { icon: ArrowRight, dx: 1, dy: 0, zh: '向右', en: 'Move right' },
                ].map(({ icon: Icon, dx, dy, zh, en }) => (
                  <button
                    key={en}
                    type="button"
                    className="lab-button"
                    aria-label={t(zh, en)}
                    disabled={
                      (dx < 0 && selectedItem.column === 1) ||
                      (dx > 0 &&
                        selectedItem.column + selectedItem.columnSpan - 1 === document.columns) ||
                      (dy < 0 && selectedItem.row === 1) ||
                      (dy > 0 && selectedItem.row + selectedItem.rowSpan - 1 === document.rows)
                    }
                    onClick={() => moveItem(dx, dy)}
                  >
                    <Icon size={17} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="grid-studio-delete"
                disabled={document.items.length <= 1}
                onClick={() => {
                  const items = document.items.filter((item) => item.id !== selectedItem.id);
                  setDocument((previous) => ({ ...previous, items }));
                  setSelected(items[0].id);
                  setFeedback('changed');
                }}
              >
                <Trash2 size={14} />
                {t('移除選取區塊', 'Remove selected block')}
              </button>
            </>
          )}
          <div className="grid-studio-alignments">
            {(['align', 'justify'] as const).map((key) => (
              <label key={key} className="lab-field">
                {key === 'align' ? 'align-items' : 'justify-items'}
                <select
                  aria-label={key === 'align' ? 'align-items' : 'justify-items'}
                  value={document[key]}
                  onChange={(event) => {
                    setDocument((previous) => ({
                      ...previous,
                      [key]: event.target.value as GridAlignment,
                    }));
                    setFeedback('changed');
                  }}
                >
                  {(['stretch', 'start', 'center', 'end'] as const).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </aside>
        <div className="grid-studio-export">
          <div className="grid-studio-export-bar">
            <div role="group" aria-label={t('程式碼種類', 'Code format')}>
              <button
                type="button"
                aria-pressed={codeTab === 'css'}
                onClick={() => chooseCodeTab('css')}
                className="lab-button"
              >
                CSS
              </button>
              <button
                type="button"
                aria-pressed={codeTab === 'html'}
                onClick={() => chooseCodeTab('html')}
                className="lab-button"
              >
                HTML
              </button>
              <button
                type="button"
                aria-pressed={codeTab === 'standalone'}
                onClick={() => chooseCodeTab('standalone')}
                className="lab-button"
              >
                {t('完整檔案', 'Full document')}
              </button>
            </div>
            <div>
              <button type="button" className="lab-button" onClick={() => copyCode(false)}>
                {feedback === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                {t('複製程式碼', 'Copy code')}
              </button>
              <button type="button" className="lab-button" onClick={() => copyCode(true)}>
                {t('複製完整 HTML', 'Copy full HTML')}
              </button>
            </div>
          </div>
          <textarea
            ref={code}
            className="grid-studio-code"
            aria-label={t('可複製的程式碼', 'Copyable code')}
            value={exported[codeTab]}
            readOnly
            spellCheck={false}
          />
          <p className="lab-note">
            {t(
              '輸出包含 520px 容器查詢，依元件容器寬度切換單欄，不需要 JavaScript 或套件',
              'Export includes a 520px container query for single-column layouts based on component width — no JavaScript or packages required',
            )}
          </p>
        </div>
      </details>
    </section>
  );
}
