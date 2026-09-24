import { useCallback, useEffect, useState } from 'react';
import { pageNumbers, positiveInteger, readListing, type ListConfig, type PageInfo } from '../../lib/listing';
import '../../styles/list-controls.css';

export const sortLabels: Record<string, string> = {
  'updated-desc': 'Recently edited', 'updated-asc': 'Least recently edited',
  newest: 'Newest first', oldest: 'Oldest first',
  'title-asc': 'Title A–Z', 'title-desc': 'Title Z–A',
  'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A',
  'size-desc': 'Largest first', 'size-asc': 'Smallest first',
};
function readState(config: ListConfig, syncUrl: boolean) {
  const params = new URLSearchParams(syncUrl && typeof window !== 'undefined' ? window.location.search : '');
  const status = params.get('status') || '';
  return { ...readListing(params, config), q: (params.get('q') || '').slice(0, 200),
    category: params.get('category') || '', status: ['', 'draft', 'published', 'trash'].includes(status) ? status : '' };
}
export function useListing(config: ListConfig, syncUrl = true) {
  const [state, setState] = useState(() => readState(config, syncUrl));
  const [query, setQuery] = useState(state.q);
  const update = useCallback((patch: Partial<typeof state>) => {
    setState((old) => ({ ...old, ...patch, page: 1 }));
  }, []);
  const setPage = useCallback((page: number) => {
    setState((old) => old.page === page ? old : { ...old, page: positiveInteger(page) });
  }, []);
  useEffect(() => {
    if (query === state.q) return;
    const timer = setTimeout(() => update({ q: query }), 250);
    return () => clearTimeout(timer);
  }, [query, state.q, update]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value !== '') params.set(key, String(value));
  const searchParams = params.toString();
  useEffect(() => {
    if (!syncUrl) return;
    const url = new URL(window.location.href);
    const next = new URLSearchParams(searchParams);
    for (const key of ['q', 'category', 'status', 'page', 'pageSize', 'sort']) {
      const value = next.get(key);
      const isDefault = (key === 'page' && value === '1') ||
        (key === 'sort' && value === config.defaultSort) ||
        (key === 'pageSize' && value === String(config.defaultSize));
      if (value && !isDefault) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', url);
  }, [searchParams, syncUrl, config]);
  useEffect(() => {
    if (!syncUrl) return;
    const restore = () => {
      const next = readState(config, true);
      setState(next);
      setQuery(next.q);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [config, syncUrl]);
  const clear = () => { setQuery(''); update({ q: '', category: '', status: '' }); };
  return { state, query, setQuery, update, setPage, clear, searchParams };
}
export function ListOrder({ config, sort, pageSize, onChange }: {
  config: ListConfig; sort: string; pageSize: number;
  onChange: (patch: { sort?: string; pageSize?: number }) => void;
}) {
  return <div className="admin-list-options">
    <label>Sort by<select aria-label="Sort by" value={sort} onChange={(event) => onChange({ sort: event.target.value })}>
      {config.sorts.map((value) => <option key={value} value={value}>{sortLabels[value]}</option>)}
    </select></label>
    <label>Per page<select aria-label="Per page" value={pageSize} onChange={(event) => onChange({ pageSize: Number(event.target.value) })}>
      {config.sizes.map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>
  </div>;
}
export function ListPager({ info, onPage, loading = false, label = 'Content pagination' }: {
  info?: PageInfo | null; onPage: (page: number) => void; loading?: boolean; label?: string;
}) {
  if (!info) return null;
  return <div className="admin-list-pagination">
    <span role="status" aria-live="polite">{loading ? 'Updating results…' : `Showing ${info.from}–${info.to} of ${info.total}`}</span>
    {info.pages > 1 && <nav aria-label={label}>
      <button className="admin-button small" type="button" disabled={loading || info.page <= 1} onClick={() => onPage(info.page - 1)}>Previous</button>
      {pageNumbers(info.page, info.pages).map((number, index) => number === 'gap'
        ? <span className="list-page-gap" key={`gap-${index}`} aria-hidden="true">…</span>
        : <button className="admin-button small" type="button" key={number} aria-label={`Page ${number}`}
            aria-current={number === info.page ? 'page' : undefined} disabled={loading}
            onClick={() => onPage(number)}>{number}</button>)}
      <button className="admin-button small" type="button" disabled={loading || info.page >= info.pages} onClick={() => onPage(info.page + 1)}>Next</button>
    </nav>}
  </div>;
}
