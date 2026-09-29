import { diagramProblem } from '../lib/diagram-policy';
import '../styles/diagrams.css';

let libraries: Promise<[typeof import('mermaid'), typeof import('dompurify')]>;
let queue = Promise.resolve();
let sequence = 0;
const states = new WeakMap<HTMLElement, string>();
const resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
const diagramErrorText = () =>
  document.documentElement.lang.startsWith('zh')
    ? '流程圖無法顯示，請檢查語法，原始碼仍可閱讀'
    : 'Unable to display diagram — check the syntax in the source below';

function schedule(figure: HTMLElement) {
  const source = figure.querySelector('[data-diagram-source] code')?.textContent || '';
  const dark = document.documentElement.dataset.theme === 'dark';
  const key = `${dark}:${source}`;
  if (states.get(figure) === key) return;
  states.set(figure, key);
  queue = queue
    .then(async () => {
      if (!figure.isConnected || states.get(figure) !== key) return;
      const canvas = figure.querySelector<HTMLElement>('[data-diagram-canvas]')!;
      const details = figure.querySelector<HTMLDetailsElement>('details')!;
      const status = figure.querySelector<HTMLElement>('[data-diagram-status]')!;
      const wasRendered = figure.dataset.diagramState === 'ready';
      try {
        const problem = diagramProblem(source);
        if (problem) throw new Error(problem);
        libraries ||= Promise.all([import('mermaid'), import('dompurify')]);
        const [{ default: mermaid }, { default: DOMPurify }] = await libraries;
        await document.fonts.ready;
        if (!figure.isConnected || states.get(figure) !== key) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          maxTextSize: 12000,
          maxEdges: 120,
          htmlLabels: false,
          theme: 'base',
          fontFamily: 'Noto Sans TC Variable, sans-serif',
          flowchart: { htmlLabels: false, useMaxWidth: true },
          sequence: { useMaxWidth: true, wrap: true },
          themeVariables: {
            darkMode: dark,
            background: dark ? '#25242d' : '#f0ebd5',
            primaryColor: dark ? '#382735' : '#eee1db',
            primaryTextColor: dark ? '#eceaf0' : '#28282e',
            primaryBorderColor: dark ? '#b2aebc' : '#62616a',
            lineColor: dark ? '#b2aebc' : '#62616a',
            secondaryColor: dark ? '#33303e' : '#ece4ca',
            tertiaryColor: dark ? '#25242d' : '#f8f4e6',
          },
        });
        const id = `kaiyo-diagram-${++sequence}`;
        const { svg } = await mermaid.render(id, source);
        if (!figure.isConnected || states.get(figure) !== key) return;
        // Mermaid strict 模式外，再移除連結、外部圖片、foreignObject 與事件屬性
        canvas.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['foreignObject', 'a', 'image', 'script'],
          FORBID_ATTR: ['href', 'xlink:href'],
        });
        const drawing = canvas.querySelector('svg');
        if (!drawing) throw new Error('Unable to render diagram');
        // 保留圖中文字的實際大小，小螢幕改用局部捲動而非把整張圖縮成小字
        const naturalWidth = drawing.viewBox.baseVal.width;
        if (naturalWidth > 0)
          drawing.style.minWidth = `${Math.ceil(Math.max(320, naturalWidth * 0.85))}px`;
        drawing.setAttribute('role', 'img');
        if (!drawing.hasAttribute('aria-labelledby'))
          drawing.setAttribute('aria-label', '流程圖 / Diagram');
        canvas.hidden = false;
        if (!wasRendered) details.open = false;
        status.textContent = '';
        figure.dataset.diagramState = 'ready';
        const updateScrollHint = () => {
          const hint = figure.querySelector<HTMLElement>('[data-diagram-scroll-hint]');
          if (hint) hint.hidden = canvas.scrollWidth <= canvas.clientWidth + 1;
        };
        updateScrollHint();
        if (!resizeObservers.has(figure)) {
          const resize = new ResizeObserver(updateScrollHint);
          resize.observe(canvas);
          resizeObservers.set(figure, resize);
        }
      } catch {
        canvas.hidden = true;
        details.open = true;
        status.textContent = diagramErrorText();
        figure.dataset.diagramState = 'error';
      }
      document.dispatchEvent(new CustomEvent('kaiyo:diagram-rendered'));
    })
    .catch(() => {
      states.delete(figure);
    });
}

// 只在頁面含圖表時載入 Mermaid；動態預覽也走同一套處理
export function initializeDiagrams() {
  const visible = new Set<HTMLElement>();
  const observer = new IntersectionObserver(
    (items) => {
      for (const item of items)
        if (item.isIntersecting) {
          const figure = item.target as HTMLElement;
          visible.add(figure);
          schedule(figure);
        }
    },
    { rootMargin: '400px' },
  );
  const tracked = new Set<HTMLElement>();
  const discover = (root: ParentNode) =>
    root.querySelectorAll<HTMLElement>('[data-markdown-diagram]').forEach((figure) => {
      if (!tracked.has(figure)) {
        tracked.add(figure);
        observer.observe(figure);
      }
    });
  discover(document);
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof HTMLElement) {
          if (node.matches('[data-markdown-diagram]')) discover(node.parentNode!);
          else if (node.querySelector('[data-markdown-diagram]')) discover(node);
        }
    for (const figure of tracked)
      if (!figure.isConnected) {
        visible.delete(figure);
        tracked.delete(figure);
        observer.unobserve(figure);
        resizeObservers.get(figure)?.disconnect();
        resizeObservers.delete(figure);
        states.delete(figure);
      }
  }).observe(document.body, { childList: true, subtree: true });
  new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === 'data-theme')) visible.forEach(schedule);
    if (records.some((record) => record.attributeName === 'lang'))
      for (const figure of tracked) {
        const status = figure.querySelector<HTMLElement>('[data-diagram-status]');
        if (status && figure.dataset.diagramState === 'error')
          status.textContent = diagramErrorText();
      }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'lang'],
  });
}
