import { normalizeUiLanguage, uiText } from '../lib/ui-language';
import { compactViewCount, parseViewCount, VIEW_COUNT_EXPLANATION } from '../lib/view-metrics';

export function initializeArticleReading() {
  const article = document.querySelector<HTMLElement>('.article-reading');
  if (!article) return;
  initializeViews(article);
  initializeContents(article);
}

function initializeViews(article: HTMLElement) {
  const badge = article.querySelector<HTMLElement>('[data-article-views]');
  if (!badge) return;
  const number = badge.querySelector<HTMLElement>('[data-view-number]');
  const id = badge.dataset.articleViews!;
  const endpoint = `/api/article-views/${encodeURIComponent(id)}`;
  let count: number | null = null;
  let attempted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const render = () => {
    const language = normalizeUiLanguage(document.documentElement.dataset.uiLanguage);
    if (number) number.textContent = count === null ? '—' : compactViewCount(count);
    const label = (lang: 'en' | 'zh-TW') => count === null ? uiText('Views unavailable', lang)
      : uiText('{count} views', lang, { count: count.toLocaleString('en-US') });
    badge.dataset.uiLabelEn = label('en');
    badge.dataset.uiLabelZh = label('zh-TW');
    badge.setAttribute('aria-label', label(language));
    badge.title = `${label(language)}. ${uiText(VIEW_COUNT_EXPLANATION, language)}`;
  };
  const request = async (method: 'GET' | 'POST') => {
    try {
      const response = await fetch(endpoint, {
        method, credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('View request failed.');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('views' in data) || data.views == null)
        throw new Error('Invalid view response.');
      const received = parseViewCount(data.views);
      // A slow initial GET must not overwrite the newer POST result.
      count = Math.max(count ?? 0, received);
      badge.dataset.viewState = 'ready';
      if (method === 'POST') badge.dataset.viewRegistered = 'true';
    } catch {
      badge.dataset.viewState = count === null ? 'unavailable' : 'ready';
      // Do not retry an ambiguous write. Reading the article is never interrupted.
    }
    render();
  };
  const visible = () => {
    clearTimeout(timer);
    if (attempted || document.visibilityState !== 'visible') return;
    timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      attempted = true;
      void request('POST');
    }, 1500);
  };
  document.addEventListener('kaiyo:ui-language', render);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', visible);
  render();
  void request('GET');
  visible();
}

function initializeContents(article: HTMLElement) {
  const links = [...article.querySelectorAll<HTMLAnchorElement>('[data-article-toc-link]')];
  const sections = [...new Set(links.map(link => decodeURIComponent(link.hash.slice(1))))]
    .map(id => ({ id, element: document.getElementById(id) }))
    .filter((item): item is {id: string; element: HTMLElement} => Boolean(item.element));
  if (!sections.length) return;
  let positions: number[] = [];
  let current = '';
  let frame = 0;
  const update = () => {
    frame = 0;
    let low = 0, high = positions.length;
    const line = window.scrollY + 132;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (positions[middle] <= line) low = middle + 1;
      else high = middle;
    }
    const id = sections[Math.max(0, low - 1)].id;
    if (id === current) return;
    current = id;
    links.forEach(link => {
      if (decodeURIComponent(link.hash.slice(1)) === id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const measure = () => {
    positions = sections.map(section => section.element.getBoundingClientRect().top + window.scrollY);
    schedule();
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(article);
  void document.fonts?.ready.then(measure);
  measure();
}
