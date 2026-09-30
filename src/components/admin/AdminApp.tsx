import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUpDown,
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderKanban,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  Package,
  UserRound,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  dateLabel,
  editorUrl,
  errorMessage,
  json,
  type Entry,
  type Media,
  type SiteSettings,
  type Taxonomies,
  type Taxonomy,
} from './api';
import type { SettingsSnapshot } from '../../lib/settings';
import ThemeButton from './ThemeButton';
import AdminLanguageSwitch, { useAdminLanguage } from './AdminLanguage';
import { mediaUsageLabel } from '../../lib/admin-language';
import { ListOrder, ListPager, useListing } from './ListControls';
import { EntryDragHandle, EntrySortableRow, EntrySortableScope } from './EntrySortableList';
import {
  adminEntryList,
  adminMediaList,
  taxonomyList,
  paginate,
  type ListResult,
} from '../../lib/listing';
const EntryEditor = lazy(() => import('./EntryEditor'));
const ContentTransfer = lazy(() => import('./ContentTransfer'));
const SystemStatus = lazy(() => import('./SystemStatus'));
const EntryOrderPanel = lazy(() => import('./EntryOrderPanel'));

export function Alert({ message, success = false }: { message: string; success?: boolean }) {
  const { t } = useAdminLanguage();
  return message ? (
    <div className={`admin-alert ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>
      {success ? <Check size={17} /> : <CircleHelp size={17} />}
      <span>{t(message)}</span>
    </div>
  ) : null;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const { t } = useAdminLanguage();
  return (
    <div className="admin-empty">
      <Orbit size={36} strokeWidth={1.2} />
      <h3>{t(title)}</h3>
      <p>
        {typeof children === 'string'
          ? t(children)
          : children || t('Content you create will appear here.')}
      </p>
    </div>
  );
}
export function PageTitle({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { t } = useAdminLanguage();
  return (
    <header className="admin-page-title">
      <div>
        <div className="admin-eyebrow">{t(label)}</div>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
      </div>
      {children}
    </header>
  );
}
function useRemote<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<T>(url, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setResolvedUrl(url);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, revision]);
  return {
    data,
    setData,
    resolvedUrl,
    error,
    setError,
    loading,
    refresh: () => setRevision((v) => v + 1),
  };
}
const navigation = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/articles', label: 'Articles', icon: FileText },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/media', label: 'Media library', icon: Image },
  { href: '/admin/taxonomies', label: 'Categories & tags', icon: Tag },
  { href: '/admin/about', label: 'About me', icon: UserRound },
  { href: '/admin/settings', label: 'Site settings', icon: Settings },
  { href: '/admin/transfer', label: 'Content transfer', icon: Package },
  { href: '/admin/system', label: 'System status', icon: Activity },
];
function Navigation({ path, close }: { path: string; close?: () => void }) {
  const { t } = useAdminLanguage();
  return (
    <>
      <a className="admin-brand" href="/admin">
        <span>
          KaiyoLab<span className="admin-brand-dot">.</span>
          <small>{t('Publishing workspace')}</small>
        </span>
      </a>
      <div className="admin-nav-caption">{t('Workspace')}</div>
      <nav aria-label={t('Admin navigation')}>
        {navigation.map((item) => {
          const active =
            item.href === '/admin'
              ? path === '/admin'
              : path === item.href || path.startsWith(`${item.href}/`);
          return (
            <a
              key={item.href}
              href={item.href}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={close}
            >
              <item.icon size={18} />
              <span>{t(item.label)}</span>
            </a>
          );
        })}
      </nav>
      <div className="admin-sidebar-bottom">
        <a className="admin-site-link" href="/" target="_blank" rel="noopener noreferrer">
          <span>
            <Orbit size={18} /> {t('View website')}{' '}
          </span>
          <ArrowUpRight size={17} />
        </a>
        <div className="admin-owner">
          <span className="admin-owner-avatar">
            <UserRound size={19} />
          </span>
          <div>
            {t('Site owner')}
            <small>{t('Private workspace')}</small>
          </div>
          <ShieldCheck size={17} />
        </div>
      </div>
    </>
  );
}
export default function AdminApp({ path: rawPath }: { path: string }) {
  const { t } = useAdminLanguage();
  const path = rawPath.replace(/\/$/, '') || '/admin';
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const logoutInFlight = useRef(false);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const current =
    navigation.find(
      (item) => item.href !== '/admin' && (path === item.href || path.startsWith(`${item.href}/`)),
    ) || navigation[0];
  let page: ReactNode;
  const match = path.match(/^\/admin\/(articles|projects)\/([^/]+)$/);
  if (match)
    page = (
      <Suspense fallback={<p className="admin-loading">{t('Loading editor…')}</p>}>
        <EntryEditor
          id={match[2]}
          kind={match[1] === 'articles' ? 'article' : 'project'}
          onDirtyChange={setDirty}
        />
      </Suspense>
    );
  else if (path === '/admin') page = <Dashboard />;
  else if (path === '/admin/articles' || path === '/admin/projects')
    page = <EntryList kind={path.endsWith('articles') ? 'article' : 'project'} />;
  else if (path === '/admin/media') page = <MediaLibrary />;
  else if (path === '/admin/taxonomies') page = <TaxonomyManager />;
  else if (path === '/admin/about' || path === '/admin/settings')
    page = <SettingsForm about={path.endsWith('about')} onDirtyChange={setDirty} />;
  else if (path === '/admin/transfer')
    page = (
      <Suspense fallback={<p className="admin-loading">{t('Loading content transfer…')}</p>}>
        <ContentTransfer />
      </Suspense>
    );
  else if (path === '/admin/system')
    page = (
      <Suspense fallback={<p className="admin-loading">{t('Loading system status…')}</p>}>
        <SystemStatus />
      </Suspense>
    );
  else
    page = (
      <Empty title={t('Admin page not found')}>
        <a href="/admin">{t('Back to overview')}</a>
      </Empty>
    );
  useEffect(() => {
    document.title = `${t(current.label)} · ${t('KaiyoLab Admin')}`;
  }, [current.label, t]);
  async function logout() {
    if (logoutInFlight.current) return;
    if (
      dirty &&
      !window.confirm(
        t('You have unsaved changes. Sign out anyway? Keep this tab open or save your work first.'),
      )
    )
      return;
    logoutInFlight.current = true;
    setSigningOut(true);
    setLogoutError('');
    try {
      await api('/api/auth/sign-out', json('POST', {}));
      window.location.href = '/login';
    } catch (e) {
      setLogoutError(errorMessage(e));
      logoutInFlight.current = false;
      setSigningOut(false);
    }
  }
  return (
    <div className="admin-app">
      <a className="admin-skip" href="#admin-main">
        {t('Skip to main content')}{' '}
      </a>
      <aside className="admin-sidebar">
        <Navigation path={path} />
      </aside>
      <div className="admin-workspace">
        <div className="admin-topbar">
          <div className="admin-breadcrumb">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <button
                  className="admin-icon-button admin-mobile-menu"
                  aria-label={t('Open admin menu')}
                >
                  <Menu size={21} />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="admin-dialog-overlay" />
                <Dialog.Content className="admin-mobile-drawer admin-app">
                  <Dialog.Title className="sr-only">{t('Admin menu')}</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    {t('Choose a section of your workspace.')}{' '}
                  </Dialog.Description>
                  <Dialog.Close
                    className="admin-drawer-close admin-icon-button"
                    aria-label={t('Close menu')}
                  >
                    <X size={20} />
                  </Dialog.Close>
                  <Navigation path={path} close={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span>{t('Workspace')}</span>
            <ChevronRight size={14} />
            <strong>{t(current.label)}</strong>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-private-badge">
              <ShieldCheck size={14} /> {t('Private')}{' '}
            </span>
            <AdminLanguageSwitch />
            <ThemeButton />
            <button
              className="admin-icon-button"
              type="button"
              onClick={logout}
              disabled={signingOut}
              aria-label={signingOut ? t('Signing out…') : t('Sign out')}
              title={t('Sign out')}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <main
          id="admin-main"
          className={`admin-main${match ? ' admin-main-editor' : ''}`}
          tabIndex={-1}
        >
          <Alert message={logoutError} />
          {page}
        </main>
        <footer className="admin-footer">
          <span>{t('KaiyoLab · Content workspace')}</span>
          <a href="/" target="_blank" rel="noopener noreferrer">
            {t('View website')} <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
    </div>
  );
}
function Dashboard() {
  const { t, language } = useAdminLanguage();
  const { data, error, loading, refresh } = useRemote<{
    counts: { articles: number; drafts: number; projects: number; trash: number };
    recent: Entry[];
  }>('/api/admin/dashboard');
  return (
    <>
      <PageTitle
        label="YOUR WORKSPACE"
        title={t('Overview')}
        description="Manage your writing, projects, and the details that make this site yours."
      >
        <a className="admin-button primary" href="/admin/articles/new">
          <Plus size={17} /> {t('New article')}{' '}
        </a>
      </PageTitle>
      <Alert message={error} />
      {error && (
        <button className="admin-button" onClick={refresh}>
          <RefreshCw size={16} /> {t('Reload')}{' '}
        </button>
      )}
      <section className="admin-welcome">
        <div className="admin-welcome-content">
          <span className="admin-eyebrow">{t('CONTENT')}</span>
          <h2>{t('New article')}</h2>
          <p>{t('Start with a draft. Preview your work, then publish when it is ready.')}</p>
          <div className="admin-welcome-actions">
            <a href="/admin/articles/new">
              {t('Write an article')} <ArrowRight size={17} />
            </a>
            <a href="/admin/articles?status=draft">{t('View drafts')}</a>
          </div>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            name: t('Articles'),
            count: data?.counts.articles,
            icon: FileText,
            href: '/admin/articles',
            detail: t('Browse articles'),
          },
          {
            name: t('Drafts'),
            count: data?.counts.drafts,
            icon: FileText,
            href: '/admin/articles?status=draft',
            otherHref: '/admin/projects?status=draft',
            detail: t('Articles'),
          },
          {
            name: t('Projects'),
            count: data?.counts.projects,
            icon: FolderKanban,
            href: '/admin/projects',
            detail: t('Browse projects'),
          },
          {
            name: t('Trash'),
            count: data?.counts.trash,
            icon: Trash2,
            href: '/admin/articles?status=trash',
            detail: t('Articles'),
            otherHref: '/admin/projects?status=trash',
          },
        ].map((stat, i) => (
          <div className={`admin-stat stat-${i}`} key={stat.name}>
            <div>
              <span>{t(stat.name)}</span>
              <stat.icon size={19} />
            </div>
            <strong>{loading ? '—' : (stat.count ?? '—')}</strong>
            <div className="admin-stat-links">
              <a href={stat.href}>
                {t(stat.detail)}
                <ArrowUpRight size={14} />
              </a>
              {stat.otherHref && (
                <a href={stat.otherHref}>
                  {t('Projects')} <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="admin-dashboard-columns">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('Recently edited')}</h2>
              <p>{t('Pick up where you left off.')}</p>
            </div>
            <a href="/admin/articles">
              {t('All articles')} <ArrowRight size={15} />
            </a>
          </div>
          {loading ? (
            <p className="admin-loading">{t('Loading your workspace…')}</p>
          ) : error && !data ? (
            <p className="admin-loading">
              {t('Unable to load recent content. Use Reload to try again.')}
            </p>
          ) : !data?.recent.length ? (
            <Empty title={t('No recent edits')}>
              {t('Your recently edited articles and projects will appear here.')}{' '}
            </Empty>
          ) : (
            <div className="admin-recent-list">
              {data.recent.map((entry) => (
                <a href={editorUrl(entry)} key={entry.id}>
                  <span className="admin-file-icon">
                    {entry.kind === 'article' ? <FileText size={19} /> : <FolderKanban size={19} />}
                  </span>
                  <div>
                    <strong>{entry.content.title || t('Untitled draft')}</strong>
                    <small>
                      {entry.kind === 'article' ? t('Article') : t('Project')} ·{' '}
                      {dateLabel(entry.updatedAt, language)}
                    </small>
                  </div>
                  <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
                    {entry.deletedAt ? t('Trash') : entry.published ? t('Published') : t('Draft')}
                  </span>
                  <ChevronRight size={16} />
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="admin-panel admin-shortcuts">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('Make it yours')}</h2>
              <p>{t('A few useful places to start.')}</p>
            </div>
          </div>
          <a href="/admin/about">
            <span>
              <UserRound size={21} />
            </span>
            <div>
              <strong>{t('Introduce yourself')}</strong>
              <small>{t('Update your bio, avatar, and social links.')}</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/projects/new">
            <span>
              <FolderKanban size={21} />
            </span>
            <div>
              <strong>{t('Share a project')}</strong>
              <small>{t('Document something you have built.')}</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/settings">
            <span>
              <Settings size={21} />
            </span>
            <div>
              <strong>{t('Site identity')}</strong>
              <small>{t('Your site name, images, and search details.')}</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <div className="admin-note">
            <ShieldCheck size={17} />
            <p>
              {t(
                'Drafts stay private. Publishing is a separate action, so you control what readers see.',
              )}{' '}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
function EntryList({ kind }: { kind: 'article' | 'project' }) {
  const { t, language } = useAdminLanguage();
  const [ordering, setOrdering] = useState(false);
  const [sortingBusy, setSortingBusy] = useState(false);
  const orderButton = useRef<HTMLButtonElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const deleteFocus = useRef<{ id: string; previous: ListResult<Entry> | null } | null>(null);
  const failedDeleteFocus = useRef<string | null>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const { state, query, setQuery, update, setPage, clear, searchParams } =
    useListing(adminEntryList);
  const { status, category } = state;
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(false);
  const actionInFlight = useRef(false);
  const [notice, setNotice] = useState('');
  const { data: taxonomy } = useRemote<Taxonomies>('/api/admin/taxonomies');
  const listUrl = `/api/admin/entries?kind=${kind}&${searchParams}`;
  const { data, resolvedUrl, error, setError, loading, refresh } =
    useRemote<ListResult<Entry>>(listUrl);
  const dragEligible = state.sort === 'manual' && !query && !state.q && !category && !status;
  const writeBusy = !!busy || sortingBusy;
  useEffect(() => {
    if (!loading && data && resolvedUrl === listUrl) setPage(data.page);
  }, [data, resolvedUrl, listUrl, loading, setPage]);
  useEffect(() => {
    const pending = deleteFocus.current;
    if (!pending || loading || !refreshButton.current) return;
    const refreshed =
      data !== pending.previous && resolvedUrl === listUrl && data?.page === state.page;
    if (!error && (!refreshed || data?.items.some((entry) => entry.id === pending.id))) return;
    refreshButton.current.focus({ preventScroll: true });
    deleteFocus.current = null;
  }, [loading, data, error, resolvedUrl, listUrl, state.page]);
  useEffect(() => {
    if (!failedDeleteFocus.current || busy || loading) return;
    const button = deleteButtons.current.get(failedDeleteFocus.current) || refreshButton.current;
    if (!button) return;
    button.focus({ preventScroll: true });
    failedDeleteFocus.current = null;
  }, [busy, loading, error]);
  async function action(entry: Entry, actionName: 'trash' | 'restore' | 'unpublish' | 'delete') {
    if (actionInFlight.current || sortingBusy) return;
    if (
      actionName === 'trash' &&
      !window.confirm(
        t(
          'Move “{title}” to trash? Its public version will be removed. You can restore it later.',
          { title: entry.content.title || t('Untitled draft') },
        ),
      )
    )
      return;
    if (
      actionName === 'unpublish' &&
      !window.confirm(
        t(
          'Unpublish “{title}”? Readers will no longer be able to access it. Your draft will be kept.',
          { title: entry.content.title },
        ),
      )
    )
      return;
    if (
      actionName === 'delete' &&
      !window.confirm(
        t(
          'Delete “{title}” permanently? This cannot be undone.\n\nIts draft, published snapshot, version history, and old URL redirects will be deleted. Images will stay in the media library.',
          { title: entry.content.title || t('Untitled draft') },
        ),
      )
    )
      return;
    actionInFlight.current = true;
    setBusy(entry.id);
    setDeleting(actionName === 'delete');
    setError('');
    setNotice('');
    try {
      if (actionName === 'delete') {
        await api(`/api/admin/entries/${entry.id}`, json('DELETE', { version: entry.version }));
        deleteFocus.current = { id: entry.id, previous: data };
      } else {
        await api(
          `/api/admin/entries/${entry.id}/action`,
          json('POST', { action: actionName, version: entry.version }),
        );
      }
      setNotice(
        actionName === 'delete'
          ? 'Content permanently deleted.'
          : actionName === 'restore'
            ? 'Content restored as a draft.'
            : actionName === 'trash'
              ? 'Content moved to trash.'
              : 'Content unpublished. Your draft is kept.',
      );
      refresh();
    } catch (e) {
      if (actionName === 'delete') failedDeleteFocus.current = entry.id;
      setError(errorMessage(e));
    } finally {
      actionInFlight.current = false;
      setBusy('');
      setDeleting(false);
    }
  }
  return (
    <>
      <PageTitle
        label="CONTENT"
        title={kind === 'article' ? t('Articles') : t('Projects')}
        description={
          kind === 'article'
            ? t('Write, review, and publish your articles.')
            : t('Document your projects and the work behind them.')
        }
      >
        {!ordering && (
          <div className="admin-entry-list-actions">
            <button
              ref={orderButton}
              className="admin-button"
              type="button"
              onClick={() => setOrdering(true)}
              disabled={writeBusy}
            >
              <ArrowUpDown size={17} /> {t('Adjust order')}
            </button>
            <a
              className="admin-button primary"
              href={`/admin/${kind === 'article' ? 'articles' : 'projects'}/new`}
            >
              <Plus size={17} /> {t(kind === 'article' ? 'New article' : 'New project')}
            </a>
          </div>
        )}
      </PageTitle>
      {ordering ? (
        <Suspense fallback={<p className="admin-loading">{t('Loading content order…')}</p>}>
          <EntryOrderPanel
            kind={kind}
            initialPageSize={state.pageSize}
            onChanged={refresh}
            onClose={() => {
              setOrdering(false);
              update({ sort: 'manual' });
              refresh();
              requestAnimationFrame(() => orderButton.current?.focus());
            }}
          />
        </Suspense>
      ) : (
        <>
          <Alert message={error} />
          <Alert message={notice} success />
          <section className="admin-panel">
            <fieldset className="admin-list-toolbar admin-entry-list-controls" disabled={writeBusy}>
              <legend className="sr-only">{t('Content list filters')}</legend>
              <div className="admin-tabs" role="group" aria-label={t('Publication status')}>
                {[
                  ['', t('All content')],
                  ['draft', t('Draft')],
                  ['published', t('Published')],
                  ['trash', t('Trash')],
                ].map(([value, label]) => (
                  <button
                    className={status === value ? 'active' : ''}
                    key={value}
                    onClick={() => update({ status: value })}
                    aria-pressed={status === value}
                  >
                    {value === 'trash' && <Trash2 size={14} />}
                    {t(label)}
                  </button>
                ))}
              </div>
              <div className="admin-filter-row">
                <label className="admin-search">
                  <Search size={17} />
                  <input
                    aria-label={t(kind === 'article' ? 'Search articles' : 'Search projects')}
                    placeholder={t('Search titles or summaries…')}
                    type="search"
                    maxLength={200}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label={t('Filter by category')}
                  value={category}
                  onChange={(e) => update({ category: e.target.value })}
                >
                  <option value="">{t('All categories')}</option>
                  {taxonomy?.categories.map((c) => (
                    <option value={c.name} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {(query || category || status) && (
                  <button className="admin-button small" type="button" onClick={clear}>
                    {t('Clear filters')}{' '}
                  </button>
                )}
                <button
                  ref={refreshButton}
                  className="admin-icon-button"
                  type="button"
                  onClick={refresh}
                  aria-label={t('Refresh list')}
                  title={t('Refresh list')}
                  disabled={loading}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              <ListOrder
                config={adminEntryList}
                sort={state.sort}
                pageSize={state.pageSize}
                onChange={update}
              />
            </fieldset>
            <EntrySortableScope
              kind={kind}
              eligible={dragEligible}
              reason={
                status === 'trash'
                  ? 'Trashed content cannot be reordered. Restore it first.'
                  : 'Direct dragging is available in manual order with no filters.'
              }
              info={data}
              page={state.page}
              pageSize={state.pageSize}
              loading={loading || resolvedUrl !== listUrl}
              busy={!!busy}
              onPage={setPage}
              onChanged={refresh}
              onInteractionChange={setSortingBusy}
              onEnable={() => update({ sort: 'manual', q: '', category: '', status: '' })}
            >
              {loading ? (
                <p className="admin-loading">
                  {t(kind === 'article' ? 'Loading articles…' : 'Loading projects…')}
                </p>
              ) : error && !data ? (
                <div className="admin-loading">
                  {t('Unable to load content. Use Refresh list to try again.')}{' '}
                </div>
              ) : !data?.items.length ? (
                <Empty
                  title={
                    query || category
                      ? t('No matching content')
                      : status === 'trash'
                        ? t('Trash is empty')
                        : kind === 'article'
                          ? t('No articles yet')
                          : t('No projects yet')
                  }
                >
                  {query || category
                    ? t('Try another keyword or clear the filters.')
                    : status === 'trash'
                      ? t('Move content to the trash from its list or editor.')
                      : kind === 'article'
                        ? t('Create a new article to get started.')
                        : t('Create a new project to get started.')}
                </Empty>
              ) : (
                <div
                  className="admin-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={t('Content table. Scroll horizontally to see all columns.')}
                >
                  <table className="admin-table">
                    <caption className="sr-only">
                      {t(
                        kind === 'article'
                          ? 'Articles matching the current filters'
                          : 'Projects matching the current filters',
                      )}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('Title')}</th>
                        <th scope="col">{t('Status')}</th>
                        <th scope="col">{t('Category')}</th>
                        <th scope="col">{t('Last edited')}</th>
                        <th scope="col" className="admin-align-right">
                          {t('Actions')}{' '}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((entry, index) => (
                        <EntrySortableRow key={entry.id} entry={entry} position={data.from + index}>
                          <td>
                            <div className="admin-entry-title-group">
                              <EntryDragHandle entry={entry} />
                              <a
                                className="admin-entry-title"
                                href={editorUrl(entry)}
                                draggable={false}
                              >
                                <span className="admin-table-thumbnail">
                                  {entry.content.cover ? (
                                    <img src={entry.content.cover} alt="" />
                                  ) : (
                                    <FileText size={20} />
                                  )}
                                </span>
                                <span>
                                  <strong>
                                    {entry.content.title || t('Untitled draft')}
                                    {entry.content.featured && (
                                      <span className="admin-featured-label">{t('Featured')}</span>
                                    )}
                                  </strong>
                                  <small>
                                    {entry.content.slug
                                      ? `/${entry.content.slug}`
                                      : t('No slug yet')}
                                  </small>
                                </span>
                              </a>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`admin-badge ${entry.published && !entry.deletedAt ? 'published' : ''}`}
                            >
                              {entry.deletedAt
                                ? t('Trashed')
                                : entry.published
                                  ? t('Published')
                                  : t('Draft')}
                            </span>
                          </td>
                          <td>
                            {taxonomy?.categories.find((c) => c.name === entry.content.category)
                              ?.name ||
                              entry.content.category ||
                              '—'}
                          </td>
                          <td className="admin-nowrap">{dateLabel(entry.updatedAt, language)}</td>
                          <td>
                            <div className="admin-row-actions">
                              {entry.deletedAt ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={writeBusy}
                                    onClick={() => action(entry, 'restore')}
                                    className="admin-button small"
                                  >
                                    <RefreshCw size={14} /> {t('Restore')}{' '}
                                  </button>
                                  <button
                                    type="button"
                                    ref={(button) => {
                                      if (button) deleteButtons.current.set(entry.id, button);
                                      else deleteButtons.current.delete(entry.id);
                                    }}
                                    disabled={writeBusy}
                                    onClick={() => action(entry, 'delete')}
                                    className="admin-button small danger"
                                    aria-label={t('Delete {title} permanently', {
                                      title: entry.content.title || t('Untitled draft'),
                                    })}
                                    aria-busy={deleting && busy === entry.id}
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                    {t(
                                      deleting && busy === entry.id
                                        ? 'Deleting…'
                                        : 'Delete permanently',
                                    )}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <a
                                    className="admin-button small"
                                    href={editorUrl(entry)}
                                    aria-disabled={sortingBusy || undefined}
                                    onClick={(event) => {
                                      if (sortingBusy) event.preventDefault();
                                    }}
                                  >
                                    {t('Edit')}{' '}
                                  </a>
                                  {entry.published && (
                                    <button
                                      className="admin-button small"
                                      disabled={writeBusy}
                                      onClick={() => action(entry, 'unpublish')}
                                    >
                                      {t('Unpublish')}{' '}
                                    </button>
                                  )}
                                  <button
                                    className="admin-icon-button danger"
                                    aria-label={t('Move {title} to trash', {
                                      title: entry.content.title,
                                    })}
                                    disabled={writeBusy}
                                    onClick={() => action(entry, 'trash')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </EntrySortableRow>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </EntrySortableScope>
            <div className="admin-table-footer">
              <span>
                {t(
                  status === 'trash'
                    ? 'Trashed content can be restored or permanently deleted. Images remain in the media library.'
                    : 'Draft content is only visible to you.',
                )}
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSelect: (media: Media) => void;
}) {
  const { t } = useAdminLanguage();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-dialog-overlay" />
        <Dialog.Content className="admin-dialog admin-app">
          <div className="admin-dialog-heading">
            <div>
              <Dialog.Title>{t('Choose image')}</Dialog.Title>
              <Dialog.Description>
                {t('Select an image from your library or upload a new one.')}{' '}
              </Dialog.Description>
            </div>
            <Dialog.Close className="admin-icon-button" aria-label={t('Close image picker')}>
              <X size={20} />
            </Dialog.Close>
          </div>
          {open && (
            <MediaLibrary
              picker
              onSelect={(media) => {
                onSelect(media);
                onOpenChange(false);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function MediaLibrary({
  picker = false,
  onSelect,
}: {
  picker?: boolean;
  onSelect?: (media: Media) => void;
}) {
  const { t } = useAdminLanguage();
  const { state, query, setQuery, update, setPage, clear, searchParams, searchPending } =
    useListing(adminMediaList, !picker);
  const listUrl = `/api/admin/media?${searchParams}`;
  const {
    data,
    resolvedUrl,
    error,
    setError,
    loading: requestLoading,
    refresh,
  } = useRemote<ListResult<Media>>(listUrl);
  // 搜尋尚未提交、或畫面仍是上一個查詢時，舊頁碼不可用來翻頁
  const loading = requestLoading || searchPending || (!error && resolvedUrl !== listUrl);
  useEffect(() => {
    if (!loading && data && resolvedUrl === listUrl) setPage(data.page);
  }, [data, resolvedUrl, listUrl, loading, setPage]);
  const [busy, setBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ count: number; failed: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadInFlight = useRef(false);
  const [uploads, setUploads] = useState<
    { file: File; status: 'waiting' | 'uploading' | 'done' | 'error'; error?: string }[]
  >([]);
  async function upload(files: File[]) {
    if (!files.length || uploadInFlight.current) return;
    if (files.length > 20) {
      setError('Choose up to 20 images at a time.');
      return;
    }
    uploadInFlight.current = true;
    setBusy(true);
    setError('');
    setUploadResult(null);
    const queue: typeof uploads = files.map((file) => ({ file, status: 'waiting' }));
    setUploads([...queue]);
    let succeeded = 0;
    try {
      for (const item of queue) {
        item.status = 'uploading';
        setUploads(queue.map((item) => ({ ...item })));
        try {
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(item.file.type))
            throw new Error('Only PNG, JPEG, WebP, and GIF images are supported.');
          if (item.file.size > 10 * 1024 * 1024) throw new Error('Images cannot exceed 10 MB.');
          const form = new FormData();
          form.append('file', item.file);
          form.append('alt', '');
          await api<Media>('/api/admin/media', { method: 'POST', body: form });
          item.status = 'done';
          succeeded++;
        } catch (e) {
          item.status = 'error';
          item.error = errorMessage(e);
        }
        setUploads(queue.map((item) => ({ ...item })));
      }
      if (succeeded) {
        clear();
        update({ q: '', sort: 'newest' });
        refresh();
      }
      setUploadResult(
        succeeded ? { count: succeeded, failed: queue.some((i) => i.status === 'error') } : null,
      );
    } finally {
      uploadInFlight.current = false;
      setBusy(false);
    }
  }
  const uploadButton = (
    <div className="admin-upload-control">
      <button
        className="admin-button primary"
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload size={17} /> {busy ? t('Uploading…') : t('Upload image')}
      </button>
      <input
        ref={fileInput}
        hidden
        type="file"
        multiple
        aria-label={t('Upload image file')}
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={busy}
        onChange={(event) => {
          void upload(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
    </div>
  );
  return (
    <>
      {!picker && (
        <PageTitle
          label="MEDIA"
          title={t('Media library')}
          description="Manage covers, avatars, and images in one place."
        >
          {uploadButton}
        </PageTitle>
      )}
      {picker && (
        <div className="admin-picker-toolbar">
          {uploadButton}
          <small>{t('JPG, PNG, WebP, GIF · Up to 10 MB')}</small>
        </div>
      )}
      <Alert message={error} />
      <Alert
        message={
          uploadResult
            ? t(
                uploadResult.failed
                  ? '{count} images uploaded · Some files need attention'
                  : '{count} images uploaded',
                { count: uploadResult.count },
              )
            : ''
        }
        success
      />
      {uploads.length > 0 && (
        <section className="admin-panel admin-upload-queue" aria-label={t('Upload progress')}>
          <div className="admin-panel-heading">
            <h2>{t('Upload progress')}</h2>
            <span role="status">
              {t('{done} / {total} complete', {
                done: uploads.filter((i) => i.status === 'done').length,
                total: uploads.length,
              })}{' '}
            </span>
          </div>
          <ul>
            {uploads.map((item, index) => (
              <li key={index}>
                <span>{item.file.name}</span>
                <span role={item.status === 'error' ? 'alert' : undefined}>
                  {item.status === 'done'
                    ? t('Uploaded')
                    : item.status === 'error'
                      ? t(item.error || 'Upload failed')
                      : item.status === 'uploading'
                        ? t('Uploading…')
                        : t('Waiting')}
                </span>
              </li>
            ))}
          </ul>
          {!busy && uploads.some((item) => item.status === 'error') && (
            <button
              type="button"
              className="admin-button small"
              onClick={() =>
                void upload(uploads.filter((i) => i.status === 'error').map((i) => i.file))
              }
            >
              {t('Retry failed uploads')}{' '}
            </button>
          )}
        </section>
      )}
      <div className="admin-media-search">
        <label className="admin-search">
          <Search size={17} />
          <input
            type="search"
            aria-label={t('Search media')}
            placeholder={t('Search filenames or alt text…')}
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {query && (
          <button className="admin-button small" type="button" onClick={clear}>
            {t('Clear search')}{' '}
          </button>
        )}
        <button
          className="admin-icon-button"
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label={t('Refresh media')}
          title={t('Refresh media')}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <ListOrder
        config={adminMediaList}
        sort={state.sort}
        pageSize={state.pageSize}
        onChange={update}
      />
      {!picker && (
        <div className="admin-media-info">
          <span>
            <Image size={16} /> {t('{count} images', { count: data?.total ?? 0 })}{' '}
          </span>
          <span>{t('JPG, PNG, WebP, GIF · Up to 10 MB')}</span>
        </div>
      )}
      {loading ? (
        <p className="admin-loading">{t('Loading media library…')}</p>
      ) : error && (!data || resolvedUrl !== listUrl) ? (
        <p className="admin-loading">
          {t('Unable to load images. Use Refresh media to try again.')}
        </p>
      ) : !data?.items.length ? (
        state.q ? (
          <Empty title={t('No matching images')}>
            {t('Try another filename or description, or clear the search.')}{' '}
          </Empty>
        ) : (
          <Empty title={t('Your image library starts here')}>
            {t('Upload a cover, avatar, or article image. Files are stored on your server.')}{' '}
          </Empty>
        )
      ) : (
        <div className={`admin-media-grid ${picker ? 'picker' : ''}`}>
          {data.items.map((media) => (
            <MediaCard
              key={`${media.id}-${media.alt}`}
              media={media}
              picker={picker}
              onSelect={onSelect}
              refresh={refresh}
              onError={setError}
            />
          ))}
        </div>
      )}
      <ListPager
        info={error && resolvedUrl !== listUrl ? null : data}
        loading={loading}
        onPage={setPage}
        label="Media pagination"
      />
    </>
  );
}
function MediaCard({
  media,
  picker,
  onSelect,
  refresh,
  onError,
}: {
  media: Media;
  picker: boolean;
  onSelect?: (media: Media) => void;
  refresh: () => void;
  onError: (message: string) => void;
}) {
  const { t, language } = useAdminLanguage();
  const [alt, setAlt] = useState(media.alt);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    onError('');
    try {
      await api(`/api/admin/media/${media.id}`, json('PATCH', { alt }));
      setSaved(true);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        t('Permanently delete “{name}”? This cannot be undone.', { name: media.name }),
      )
    )
      return;
    setBusy(true);
    onError('');
    try {
      await api(`/api/admin/media/${media.id}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="admin-media-card">
      {picker ? (
        <button
          className="admin-media-select"
          type="button"
          aria-label={t('Choose image {name}', { name: media.name })}
          onClick={() => onSelect?.(media)}
        >
          <img src={`${media.url}?w=480`} alt={media.alt || media.name} loading="lazy" />
          <span>
            {t('Choose image')} <Plus size={16} />
          </span>
        </button>
      ) : (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="admin-media-image">
          <img src={`${media.url}?w=480`} alt={media.alt || media.name} loading="lazy" />
        </a>
      )}
      <div className="admin-media-details">
        <strong title={media.name}>{media.name}</strong>
        <small>
          {media.width} × {media.height} · {(media.size / 1024).toFixed(0)} KB
        </small>
        {!picker && (
          <>
            <label>
              {t('Alt text')}{' '}
              <input
                disabled={busy}
                maxLength={300}
                value={alt}
                onChange={(e) => {
                  setAlt(e.target.value);
                  setSaved(false);
                }}
                placeholder={t('Describe the image for readers using assistive technology')}
              />
            </label>
            <div className="admin-media-controls">
              <button
                disabled={busy || (alt === media.alt && !saved)}
                className="admin-button small"
                onClick={save}
              >
                {saved ? t('Saved') : t('Save description')}
              </button>
              <button
                className="admin-icon-button danger"
                disabled={busy || media.usedBy.length > 0}
                onClick={remove}
                aria-label={t('Delete image {name}', { name: media.name })}
                title={
                  media.usedBy.length
                    ? t('This image is in use and cannot be deleted.')
                    : t('Delete permanently')
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <details className="admin-media-usage">
              <summary>
                {media.usedBy.length
                  ? t('Used in {count} places', { count: media.usedBy.length })
                  : t('Not used yet')}
              </summary>
              {media.usedBy.length > 0 && (
                <ul>
                  {media.usedBy.map((usage, i) => (
                    <li key={i}>{mediaUsageLabel(usage, language)}</li>
                  ))}
                </ul>
              )}
            </details>
          </>
        )}
      </div>
    </article>
  );
}
function TaxonomyManager() {
  const { t } = useAdminLanguage();
  const { data, setData, error, setError, refresh } =
    useRemote<Taxonomies>('/api/admin/taxonomies');
  return (
    <>
      <PageTitle
        label="ORGANIZATION"
        title={t('Categories & tags')}
        description="Organize your content so readers can find related topics."
      />
      <Alert message={error} />
      <div className="admin-taxonomy-columns">
        {(['category', 'tag'] as const).map((kind) => (
          <TaxonomySection
            key={kind}
            kind={kind}
            items={(kind === 'category' ? data?.categories : data?.tags) || []}
            onSaved={(item) =>
              setData((old) => {
                const key = kind === 'category' ? 'categories' : 'tags';
                const current = old || { categories: [], tags: [] };
                return {
                  ...current,
                  [key]: [...current[key].filter((row) => row.id !== item.id), item],
                };
              })
            }
            onDeleted={(id) =>
              setData((old) => {
                if (!old) return old;
                const key = kind === 'category' ? 'categories' : 'tags';
                return { ...old, [key]: old[key].filter((row) => row.id !== id) };
              })
            }
            refresh={refresh}
            onError={setError}
          />
        ))}
      </div>
    </>
  );
}
function TaxonomySection({
  kind,
  items,
  onSaved,
  onDeleted,
  refresh,
  onError,
}: {
  kind: 'category' | 'tag';
  items: Taxonomy[];
  onSaved: (item: Taxonomy) => void;
  onDeleted: (id: string) => void;
  refresh: () => void;
  onError: (value: string) => void;
}) {
  const { t } = useAdminLanguage();
  const { state, query, setQuery, update, setPage } = useListing(taxonomyList, false);
  const [revealed, setRevealed] = useState<Taxonomy | null>(null);
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const savedRow = useRef<HTMLDivElement>(null);
  const matches = (item: Taxonomy) =>
    `${item.name} ${item.slug}`.toLocaleLowerCase().includes(state.q.toLocaleLowerCase());
  const filtered = items
    .filter((item) => matches(item) || item.id === revealed?.id)
    .sort(
      (a, b) =>
        (state.sort === 'name-desc' ? -1 : 1) *
        (a.name.localeCompare(b.name, 'zh-TW', { numeric: true, sensitivity: 'base' }) ||
          a.id.localeCompare(b.id)),
    );
  const page = paginate(filtered.length, state.page, state.pageSize);
  useEffect(() => {
    if (pendingReveal) return;
    setPage(page.page);
  }, [page.page, setPage, pendingReveal]);
  useEffect(() => {
    if (!pendingReveal) return;
    const index = filtered.findIndex((item) => item.id === pendingReveal);
    if (index < 0) return;
    const destination = Math.floor(index / page.pageSize) + 1;
    if (state.page !== destination) {
      setPage(destination);
      return;
    }
    savedRow.current?.focus({ preventScroll: true });
    savedRow.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    setPendingReveal(null);
  }, [filtered, page.pageSize, pendingReveal, setPage, state.page]);
  const dismissReveal = () => {
    setRevealed(null);
    setPendingReveal(null);
  };
  const pageItems = filtered.slice((page.page - 1) * page.pageSize, page.page * page.pageSize);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = kind === 'category' ? 'Category' : 'Tag';
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError('');
    try {
      const saved = await api<Taxonomy>(
        `/api/admin/taxonomies${edit ? `/${edit}` : ''}`,
        json(edit ? 'PATCH' : 'POST', { kind, name, slug }),
      );
      setName('');
      setSlug('');
      setEdit(null);
      setRevealed(saved);
      setPendingReveal(saved.id);
      onSaved(saved);
      refresh();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Taxonomy) {
    if (
      !window.confirm(
        t(
          kind === 'category'
            ? 'Delete category “{name}”? Items still in use cannot be deleted.'
            : 'Delete tag “{name}”? Items still in use cannot be deleted.',
          { name: item.name },
        ),
      )
    )
      return;
    onError('');
    setBusy(true);
    try {
      await api(`/api/admin/taxonomies/${item.id}`, { method: 'DELETE' });
      onDeleted(item.id);
      if (revealed?.id === item.id) dismissReveal();
      if (edit === item.id) {
        setEdit(null);
        setName('');
        setSlug('');
      }
      refresh();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>{t(label)}</h2>
          <p>
            {kind === 'category'
              ? t('Broad sections for organizing content.')
              : t('Specific topics, technologies, and keywords.')}
          </p>
        </div>
        <span className="admin-count">{items.length}</span>
      </div>
      <form className="admin-taxonomy-form" onSubmit={submit}>
        <label>
          {t(kind === 'category' ? 'Category name' : 'Tag name')}{' '}
          <input
            ref={nameInput}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              kind === 'category' ? t('For example: Development') : t('For example: Astro')
            }
          />
        </label>
        <label>
          {t('Slug')}{' '}
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t('Leave blank to generate automatically')}
          />
        </label>
        <div className="admin-form-actions">
          <button disabled={busy} className="admin-button primary" type="submit">
            {edit ? t('Save changes') : t(kind === 'category' ? 'Add category' : 'Add tag')}
          </button>
          {edit && (
            <button
              className="admin-button"
              type="button"
              onClick={() => {
                setEdit(null);
                setName('');
                setSlug('');
              }}
            >
              {t('Cancel')}{' '}
            </button>
          )}
        </div>
      </form>
      {revealed && !matches(revealed) && (
        <p className="admin-subtle" role="status">
          {t('Saved “{name}”. This item is temporarily shown while your search is preserved.', {
            name: revealed.name,
          })}{' '}
          <button className="admin-button small" type="button" onClick={dismissReveal}>
            {t('Show search results only')}{' '}
          </button>
        </p>
      )}
      <div className="admin-taxonomy-search">
        <label className="admin-search">
          <Search size={17} />
          <input
            type="search"
            maxLength={200}
            aria-label={t(kind === 'category' ? 'Search category items' : 'Search tag items')}
            placeholder={t('Search names or slugs…')}
            value={query}
            onChange={(event) => {
              dismissReveal();
              setQuery(event.target.value);
            }}
          />
        </label>
        <ListOrder
          config={taxonomyList}
          sort={state.sort}
          pageSize={state.pageSize}
          onChange={(patch) => {
            dismissReveal();
            update(patch);
          }}
        />
      </div>
      <div className="admin-taxonomy-list">
        {pageItems.length ? (
          pageItems.map((item) => (
            <div key={item.id} ref={item.id === revealed?.id ? savedRow : undefined} tabIndex={-1}>
              <span>
                <strong>
                  {kind === 'tag' && '# '}
                  {item.name}
                </strong>
                <small>/{item.slug}</small>
              </span>
              <button
                className="admin-button small"
                disabled={busy}
                onClick={() => {
                  setEdit(item.id);
                  setName(item.name);
                  setSlug(item.slug);
                  nameInput.current?.focus();
                  nameInput.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
                }}
              >
                {t('Edit')}{' '}
              </button>
              <button
                className="admin-icon-button danger"
                aria-label={t(
                  kind === 'category' ? 'Delete category {name}' : 'Delete tag {name}',
                  { name: item.name },
                )}
                disabled={busy}
                onClick={() => remove(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className="admin-subtle">
            {state.q
              ? t('No matching items. Try another search.')
              : t(
                  kind === 'category'
                    ? 'No category items yet. Add one above.'
                    : 'No tag items yet. Add one above.',
                )}
          </p>
        )}
      </div>
      <ListPager
        info={page}
        onPage={(page) => {
          dismissReveal();
          setPage(page);
        }}
        label={kind === 'category' ? 'Category pagination' : 'Tag pagination'}
      />
    </section>
  );
}
function SettingsForm({
  about,
  onDirtyChange,
}: {
  about: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useAdminLanguage();
  const { data, setData, error, setError, loading, refresh } =
    useRemote<SettingsSnapshot>('/api/admin/settings');
  const [baseline, setBaseline] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const saveInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imageField, setImageField] = useState<'logo' | 'avatar' | 'heroImage' | null>(null);
  const dirty = !!data && baseline !== null && JSON.stringify(data) !== baseline;
  useEffect(() => {
    if (data && baseline === null) setBaseline(JSON.stringify(data));
  }, [data, baseline]);
  useEffect(() => {
    onDirtyChange(dirty || busy);
    return () => onDirtyChange(false);
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const change = (key: keyof SiteSettings, value: unknown) => {
    setData((previous) => (previous ? { ...previous, [key]: value } : previous));
    setMessage('');
  };
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || saveInFlight.current || conflict) return;
    saveInFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const snapshot = JSON.stringify(data);
      const result = await api<SettingsSnapshot>('/api/admin/settings', json('PUT', data));
      setBaseline(JSON.stringify(result));
      setData((current) =>
        current && JSON.stringify(current) !== snapshot
          ? { ...current, version: result.version }
          : result,
      );
      setMessage('Settings saved.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      setError(errorMessage(e));
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }
  function downloadSettings() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = t('Unsaved site settings.json');
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadSettings() {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setBusy(true);
    try {
      const latest = await api<SettingsSnapshot>('/api/admin/settings');
      if (
        !window.confirm(
          t(
            'Reloading replaces unsaved changes in this tab. Download a copy first to keep your edits.',
          ),
        )
      )
        return;
      setData(latest);
      setBaseline(JSON.stringify(latest));
      setConflict(false);
      setError('');
      setMessage('Latest settings loaded');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }
  const fieldLimits: Partial<Record<keyof SiteSettings, number>> = {
    siteName: 80,
    tagline: 200,
    description: 500,
    homeIntro: 100000,
    authorName: 100,
    bio: 1000,
    about: 100000,
    siteUrl: 2048,
  };
  const field = (
    key: keyof SiteSettings,
    label: string,
    options: { multiline?: boolean; help?: string; required?: boolean; type?: string } = {},
  ) => (
    <label className="admin-field">
      {t(label)}
      {options.multiline ? (
        <textarea
          aria-label={t(label)}
          maxLength={fieldLimits[key]}
          value={String(data?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
          required={options.required}
          rows={key === 'about' ? 14 : key === 'homeIntro' ? 9 : 3}
        />
      ) : (
        <input
          aria-label={t(label)}
          maxLength={fieldLimits[key]}
          type={options.type || 'text'}
          required={options.required}
          value={String(data?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
      {options.help && <small>{t(options.help)}</small>}
    </label>
  );
  const imageControl = (key: 'logo' | 'avatar' | 'heroImage', label: string) => (
    <div className="admin-field">
      <span>{t(label)}</span>
      <div className="admin-setting-image">
        {data?.[key] ? (
          <img src={data[key]} alt={t(label)} />
        ) : (
          <div className="admin-image-placeholder">
            <Image size={25} />
          </div>
        )}
        <div>
          <button className="admin-button small" type="button" onClick={() => setImageField(key)}>
            {t('Choose image')}{' '}
          </button>
          {data?.[key] && (
            <button className="admin-button small" type="button" onClick={() => change(key, '')}>
              {t('Remove image')}{' '}
            </button>
          )}
        </div>
      </div>
      <input
        aria-label={t('{label} URL', { label: t(label) })}
        maxLength={2048}
        value={data?.[key] || ''}
        onChange={(e) => change(key, e.target.value)}
        placeholder={t('/media/… or /images/…')}
      />
    </div>
  );
  return (
    <>
      <PageTitle
        label={about ? t('PROFILE') : t('CONFIGURATION')}
        title={about ? t('About me') : t('Site settings')}
        description={
          about
            ? t('Introduce yourself and give readers a way to stay in touch.')
            : t('Manage your site identity, search details, and account security.')
        }
      />
      <Alert message={error} />
      {conflict && (
        <div className="admin-recovery" role="region" aria-label={t('Settings version conflict')}>
          <div>
            <strong>{t('Newer settings are available')}</strong>
            <p>
              {t(
                'Your changes in this tab are kept. Download a copy, then reload the latest settings to continue editing.',
              )}
            </p>
          </div>
          <button className="admin-button small" type="button" onClick={downloadSettings}>
            {t('Download unsaved copy')}{' '}
          </button>
          <button
            className="admin-button small"
            type="button"
            disabled={busy}
            onClick={reloadSettings}
          >
            {t('Reload latest settings')}{' '}
          </button>
        </div>
      )}
      <Alert
        message={
          message
            ? dirty
              ? t('Saved submitted settings. You still have unsaved changes.')
              : message
            : ''
        }
        success
      />
      {error && !data && (
        <button className="admin-button" type="button" onClick={refresh}>
          {t('Retry loading settings')}{' '}
        </button>
      )}
      {loading ? (
        <p className="admin-loading">{t('Loading settings…')}</p>
      ) : (
        data && (
          <form className="admin-settings-grid" onSubmit={save} aria-busy={busy}>
            <div>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>{about ? t('Your introduction') : t('Identity & search')}</h2>
                    <p>
                      {about
                        ? t('These details appear on your homepage and About page.')
                        : t('Help readers recognize your site in the browser and search results.')}
                    </p>
                  </div>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    <>
                      {field('authorName', t('Display name'), { required: true })}
                      {field('homeIntro', t('Homepage introduction (Markdown)'), {
                        multiline: true,
                        required: true,
                        help: t(
                          'Supports Markdown headings, links, and images. Saving immediately updates the homepage.',
                        ),
                      })}
                      {field('bio', t('Short bio'), {
                        multiline: true,
                        help: t('Appears in the sidebar and About page metadata.'),
                      })}
                      {field('about', t('About me'), {
                        multiline: true,
                        help: t('Use Markdown for headings, lists, links, and images.'),
                      })}
                    </>
                  ) : (
                    <>
                      {field('siteName', t('Site name'), { required: true })}
                      {field('tagline', t('Tagline'))}
                      {field('description', t('Site description'), {
                        multiline: true,
                        help: t(
                          'Used for search metadata. Edit your homepage introduction under About me.',
                        ),
                      })}
                      {field('siteUrl', t('Public site URL'), {
                        type: 'url',
                        help: t(
                          'For example, https://your-domain.com. Used by canonical URLs, RSS, and sitemap. The deployment SITE_URL must match.',
                        ),
                      })}
                    </>
                  )}
                </div>
              </section>
              {about && (
                <section className="admin-panel admin-form-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>{t('Social links')}</h2>
                      <p>{t('Help readers find you elsewhere.')}</p>
                    </div>
                    <button
                      className="admin-button small"
                      type="button"
                      disabled={data.socialLinks.length >= 12}
                      onClick={() =>
                        change('socialLinks', [...data.socialLinks, { label: '', url: '' }])
                      }
                    >
                      <Plus size={15} /> {t('Add link')}{' '}
                    </button>
                  </div>
                  <div className="admin-form-body">
                    {data.socialLinks.map((link, index) => (
                      <div className="admin-social-row" key={index}>
                        <label>
                          {t('Platform')}{' '}
                          <input
                            value={link.label}
                            required
                            maxLength={50}
                            placeholder={t('GitHub')}
                            onChange={(e) =>
                              change(
                                'socialLinks',
                                data.socialLinks.map((s, i) =>
                                  i === index ? { ...s, label: e.target.value } : s,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          {t('URL')}{' '}
                          <input
                            type="url"
                            value={link.url}
                            required
                            maxLength={2048}
                            placeholder={t('https://…')}
                            onChange={(e) =>
                              change(
                                'socialLinks',
                                data.socialLinks.map((s, i) =>
                                  i === index ? { ...s, url: e.target.value } : s,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          className="admin-icon-button danger"
                          type="button"
                          aria-label={t('Remove social link {number}', { number: index + 1 })}
                          onClick={() =>
                            change(
                              'socialLinks',
                              data.socialLinks.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                    {!data.socialLinks.length && (
                      <p className="admin-subtle">{t('No social links yet.')}</p>
                    )}
                  </div>
                </section>
              )}
            </div>
            <aside>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <h2>{about ? t('Your avatar') : t('Site images')}</h2>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    imageControl('avatar', t('Avatar'))
                  ) : (
                    <>
                      {imageControl('logo', t('Site logo'))}
                      {imageControl('heroImage', t('Homepage image'))}
                    </>
                  )}
                  <div className="admin-note">
                    <Image size={17} />
                    <p>
                      {t(
                        'Use your media library to keep image management and backups in one place.',
                      )}
                    </p>
                  </div>
                </div>
              </section>
            </aside>
            <div className="admin-settings-savebar">
              <div>
                <strong role="status">
                  {busy ? t('Saving…') : dirty ? t('Unsaved changes') : t('All settings saved')}
                </strong>
                <span>{t('Changes go live when you save.')}</span>
              </div>
              <button
                className="admin-button primary"
                disabled={busy || !dirty || conflict}
                type="submit"
              >
                <Check size={17} />
                {busy ? t('Saving…') : t('Save settings')}
              </button>
            </div>
          </form>
        )
      )}
      {!about && <PasswordForm />}
      <MediaPicker
        open={imageField !== null}
        onOpenChange={(value) => !value && setImageField(null)}
        onSelect={(media) => {
          if (imageField) change(imageField, media.url);
        }}
      />
    </>
  );
}
function PasswordForm() {
  const { t } = useAdminLanguage();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api(
        '/api/auth/change-password',
        json('POST', { currentPassword, newPassword, revokeOtherSessions: true }),
      );
      setCurrent('');
      setNew('');
      setConfirm('');
      setMessage('Password updated. Other sessions have been signed out.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel admin-password-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>{t('Account security')}</h2>
          <p>{t('Changing your password signs out your other sessions.')}</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      <form className="admin-form-body" onSubmit={submit}>
        <Alert message={error} />
        <Alert message={message} success />
        <div className="admin-password-fields">
          <label>
            {t('Current password')}{' '}
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            {t('New password')}{' '}
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
            <small>{t('At least 12 characters')}</small>
          </label>
          <label>
            {t('Confirm new password')}{' '}
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="admin-button" disabled={busy}>
          {busy ? t('Updating…') : t('Update password')}
        </button>
      </form>
    </section>
  );
}
