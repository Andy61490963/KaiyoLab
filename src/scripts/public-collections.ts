import { currentUiText, syncUiAttributes } from './public-language';

/** 原生 GET 表單仍可運作，只增強同頁的查詢、篩選與換頁 */
export function initializePublicCollections() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-public-collection]')) {
    if (root.dataset.collectionReady) continue;
    root.dataset.collectionReady = 'true';
    const id = root.dataset.collectionId;
    const pathname = location.pathname;
    let pending: AbortController | undefined;
    let generation = 0;
    let lastRequest: URL | undefined;
    let lastMode: 'push' | 'pop' = 'push';
    let failed = false;
    let loading = false;

    const feedback = document.createElement('div');
    feedback.className = 'collection-feedback';
    feedback.hidden = true;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.hidden = true;
    retry.dataset.collectionRetry = '';
    feedback.append(status, retry);
    root.before(feedback);

    const report = () => {
      retry.textContent = currentUiText('Retry');
      retry.hidden = !failed;
      feedback.hidden = !loading && !failed;
      feedback.classList.toggle('sr-only', !failed);
      status.setAttribute('role', failed ? 'alert' : 'status');
      status.setAttribute('aria-live', failed ? 'assertive' : 'polite');
      status.textContent = currentUiText(
        failed
          ? 'Unable to update results. Your current list is still available.'
          : loading
            ? 'Updating results…'
            : 'Results updated',
      );
      root.setAttribute('aria-busy', String(loading));
    };
    document.addEventListener('kaiyo:ui-language', report);

    const currentScroll = () => ({ x: scrollX, y: scrollY });
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let entryKey: string = history.state?.kaiyoCollection?.key || crypto.randomUUID();
    // entryKey 只代表目前已呈現的列表，返回中的目的項目要等回應成功才接手
    const positions = new Map<string, ReturnType<typeof currentScroll>>();
    // 只在記憶體記錄每個歷史項目的最後位置，避免每次 scroll 呼叫 replaceState
    window.addEventListener(
      'scroll',
      () => {
        positions.set(entryKey, currentScroll());
      },
      { passive: true },
    );
    const rememberScroll = () => {
      positions.set(entryKey, currentScroll());
      if (history.state?.kaiyoCollection?.key && history.state.kaiyoCollection.key !== entryKey)
        return;
      history.replaceState(
        { ...history.state, kaiyoCollection: { key: entryKey, pathname, ...currentScroll() } },
        '',
        location.href,
      );
    };
    rememberScroll();

    async function update(url: URL, mode: 'push' | 'pop' = 'push', paging = false) {
      if (url.origin !== location.origin || url.pathname !== pathname) return;
      pending?.abort();
      const request = new AbortController();
      pending = request;
      const token = ++generation;
      const targetState = history.state?.kaiyoCollection;
      const targetKey: string = targetState?.key || crypto.randomUUID();
      const timeout = setTimeout(() => request.abort('timeout'), 15000);
      url.searchParams.delete('pageSize');
      lastRequest = url;
      lastMode = mode;
      failed = false;
      loading = true;
      report();
      const active =
        document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
          ? document.activeElement
          : null;
      try {
        const response = await fetch(url, {
          signal: request.signal,
          headers: { Accept: 'text/html' },
        });
        if (
          !response.ok ||
          new URL(response.url).origin !== location.origin ||
          new URL(response.url).pathname !== pathname
        )
          throw new Error('列表載入失敗');
        const page = new DOMParser().parseFromString(await response.text(), 'text/html');
        const incoming = [...page.querySelectorAll<HTMLElement>('[data-public-collection]')].find(
          (el) => el.dataset.collectionId === id,
        );
        if (!incoming) throw new Error('列表回應不完整');
        if (token !== generation) return;
        // 以回應到達時的焦點為準，保留等候期間的 Tab 操作；區域外的焦點不移動
        const settledActive = document.activeElement;
        const restoreFocus = settledActive === retry || root.contains(settledActive);
        const focus =
          settledActive instanceof HTMLElement && root.contains(settledActive)
            ? settledActive
            : settledActive === retry
              ? active
              : null;
        const focusId = focus?.id;
        const focusHref = focus instanceof HTMLAnchorElement ? focus.href : undefined;
        const focusSelection =
          focus instanceof HTMLInputElement && focus.type === 'search'
            ? { start: focus.selectionStart, end: focus.selectionEnd }
            : undefined;
        const openDetails = [...root.querySelectorAll<HTMLDetailsElement>('details[open][id]')].map(
          (el) => el.id,
        );
        const scroll = mode === 'pop' ? positions.get(targetKey) || targetState : currentScroll();
        if (mode === 'push') rememberScroll();
        incoming.querySelectorAll('script').forEach((script) => script.remove());
        root.replaceChildren(...incoming.childNodes);
        root.hidden = incoming.hidden;
        syncUiAttributes(root);
        for (const detailId of openDetails) {
          const detail = document.getElementById(detailId);
          if (detail instanceof HTMLDetailsElement && root.contains(detail)) detail.open = true;
        }
        const effectivePage = root.querySelector<HTMLElement>('[data-collection-results]')?.dataset
          .page;
        if (effectivePage === '1') url.searchParams.delete('page');
        else if (effectivePage) url.searchParams.set('page', effectivePage);
        if (mode === 'push' && url.href !== location.href) {
          entryKey = crypto.randomUUID();
          positions.set(entryKey, scroll);
          history.pushState(
            { ...history.state, kaiyoCollection: { key: entryKey, pathname, ...scroll } },
            '',
            url,
          );
        } else entryKey = targetKey;
        if (restoreFocus) {
          const exact = focusId
            ? document.getElementById(focusId)
            : focusHref
              ? [...root.querySelectorAll<HTMLAnchorElement>('a')].find(
                  (el) => el.href === focusHref,
                )
              : null;
          const fallback = root.hidden
            ? document.querySelector<HTMLElement>('main h1')
            : root.querySelector<HTMLElement>('[data-collection-results]');
          const target = exact || fallback;
          if (target) {
            if (!exact) target.tabIndex = -1;
            target.focus({ preventScroll: true });
            if (target instanceof HTMLInputElement && focusSelection)
              target.setSelectionRange(focusSelection.start, focusSelection.end);
          }
        }
        if (paging && mode !== 'pop') root.scrollIntoView({ block: 'start', behavior: 'instant' });
        else if (scroll && typeof scroll.y === 'number')
          window.scrollTo({ top: scroll.y, left: scroll.x || 0, behavior: 'instant' });
        positions.set(entryKey, currentScroll());
        failed = false;
        loading = false;
        report();
        // 成功訊息只供輔助工具，避免新增常駐說明
        feedback.hidden = false;
        feedback.classList.add('sr-only');
      } catch {
        if (token !== generation) return;
        failed = true;
        loading = false;
        feedback.classList.remove('sr-only');
        report();
      } finally {
        clearTimeout(timeout);
        if (token === generation) {
          pending = undefined;
        }
      }
    }
    const submit = (form: HTMLFormElement) => {
      const url = new URL(form.action);
      for (const [key, value] of new FormData(form)) {
        if (typeof value === 'string' && value.trim()) url.searchParams.set(key, value.trim());
      }
      feedback.classList.remove('sr-only');
      void update(url);
    };
    root.addEventListener('submit', (event) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        !event.target.matches('.collection-controls')
      )
        return;
      event.preventDefault();
      submit(event.target);
    });
    root.addEventListener('change', (event) => {
      if (
        event.target instanceof HTMLSelectElement &&
        event.target.name === 'sort' &&
        event.target.form
      )
        submit(event.target.form);
    });
    root.addEventListener('input', (event) => {
      if (!(event.target instanceof HTMLInputElement) || !pending) return;
      // 保留等待回應時繼續輸入的新文字，舊請求不可覆蓋它
      ++generation;
      pending.abort();
      pending = undefined;
      loading = false;
      failed = false;
      report();
    });
    root.addEventListener('click', (event) => {
      if (
        !(event instanceof MouseEvent) ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[data-collection-link]')
          : null;
      if (!target || target.target || target.hasAttribute('download')) return;
      const url = new URL(target.href);
      if (url.pathname !== pathname || url.origin !== location.origin) return;
      event.preventDefault();
      feedback.classList.remove('sr-only');
      void update(url, 'push', Boolean(target.closest('.pagination')));
    });
    retry.addEventListener('click', () => {
      if (lastRequest) void update(lastRequest, lastMode);
    });
    window.addEventListener('popstate', () => {
      if (location.pathname === pathname) {
        positions.set(entryKey, currentScroll());
        feedback.classList.remove('sr-only');
        void update(new URL(location.href), 'pop');
      }
    });
    window.addEventListener('pagehide', () => {
      positions.set(entryKey, currentScroll());
      history.scrollRestoration = previousRestoration;
      ++generation;
      pending?.abort();
      pending = undefined;
      loading = false;
      failed = false;
      report();
    });
    window.addEventListener('pageshow', (event) => {
      history.scrollRestoration = 'manual';
      if (event.persisted) {
        if (history.state?.kaiyoCollection?.key !== entryKey) {
          void update(new URL(location.href), 'pop');
          return;
        }
        const scroll = positions.get(entryKey);
        if (scroll) window.scrollTo({ top: scroll.y, left: scroll.x, behavior: 'instant' });
      }
    });
  }
}
