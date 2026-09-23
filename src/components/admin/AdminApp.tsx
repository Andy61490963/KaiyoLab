import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  ArrowUpRight,
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
  UserRound,
  X,
} from 'lucide-react';
import {
  api,
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
import ThemeButton from './ThemeButton';
const EntryEditor = lazy(() => import('./EntryEditor'));

export function Alert({ message, success = false }: { message: string; success?: boolean }) {
  return message ? (
    <div className={`admin-alert ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>
      {success ? <Check size={17} /> : <CircleHelp size={17} />}
      <span>{message}</span>
    </div>
  ) : null;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="admin-empty">
      <Orbit size={36} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children || 'Content you create will appear here.'}</p>
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
  return (
    <header className="admin-page-title">
      <div>
        <div className="admin-eyebrow">{label}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
function useRemote<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<T>(url, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, revision]);
  return { data, setData, error, setError, loading, refresh: () => setRevision((v) => v + 1) };
}
const navigation = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/articles', label: 'Articles', icon: FileText },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/media', label: 'Media library', icon: Image },
  { href: '/admin/taxonomies', label: 'Categories & tags', icon: Tag },
  { href: '/admin/about', label: 'About me', icon: UserRound },
  { href: '/admin/settings', label: 'Site settings', icon: Settings },
];
function Navigation({ path, close }: { path: string; close?: () => void }) {
  return (
    <>
      <a className="admin-brand" href="/admin">
        <span>
          KaiyoLab<span className="admin-brand-dot">.</span>
          <small>Publishing workspace</small>
        </span>
      </a>
      <div className="admin-nav-caption">Workspace</div>
      <nav aria-label="Admin navigation">
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
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="admin-sidebar-bottom">
        <a className="admin-site-link" href="/" target="_blank" rel="noopener noreferrer">
          <span>
            <Orbit size={18} /> View website
          </span>
          <ArrowUpRight size={17} />
        </a>
        <div className="admin-owner">
          <span className="admin-owner-avatar">
            <UserRound size={19} />
          </span>
          <div>
            Site owner<small>Private workspace</small>
          </div>
          <ShieldCheck size={17} />
        </div>
      </div>
    </>
  );
}
export default function AdminApp({ path: rawPath }: { path: string }) {
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
      <Suspense fallback={<p className="admin-loading">Loading editor…</p>}>
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
  else
    page = (
      <Empty title="Admin page not found">
        <a href="/admin">Back to overview</a>
      </Empty>
    );
  useEffect(() => {
    document.title = `${current.label} · KaiyoLab Admin`;
  }, [current.label]);
  async function logout() {
    if (logoutInFlight.current) return;
    if (
      dirty &&
      !window.confirm(
        'You have unsaved changes. Sign out anyway? Keep this tab open or save your work first.',
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
        Skip to main content
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
                  aria-label="Open admin menu"
                >
                  <Menu size={21} />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="admin-dialog-overlay" />
                <Dialog.Content className="admin-mobile-drawer admin-app">
                  <Dialog.Title className="sr-only">Admin menu</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Choose a section of your workspace.
                  </Dialog.Description>
                  <Dialog.Close
                    className="admin-drawer-close admin-icon-button"
                    aria-label="Close menu"
                  >
                    <X size={20} />
                  </Dialog.Close>
                  <Navigation path={path} close={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-private-badge">
              <ShieldCheck size={14} /> Private
            </span>
            <ThemeButton />
            <button
              className="admin-icon-button"
              type="button"
              onClick={logout}
              disabled={signingOut}
              aria-label={signingOut ? 'Signing out…' : 'Sign out'}
              title="Sign out"
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
          <span>KaiyoLab · Content workspace</span>
          <a href="/" target="_blank" rel="noopener noreferrer">
            View website <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
    </div>
  );
}
function Dashboard() {
  const { data, error, loading, refresh } = useRemote<{
    counts: { articles: number; drafts: number; projects: number; trash: number };
    recent: Entry[];
  }>('/api/admin/dashboard');
  return (
    <>
      <PageTitle
        label="YOUR WORKSPACE"
        title="Overview"
        description="Manage your writing, projects, and the details that make this site yours."
      >
        <a className="admin-button primary" href="/admin/articles/new">
          <Plus size={17} /> New article
        </a>
      </PageTitle>
      <Alert message={error} />
      {error && (
        <button className="admin-button" onClick={refresh}>
          <RefreshCw size={16} /> Reload
        </button>
      )}
      <section className="admin-welcome">
        <div className="admin-welcome-content">
          <span className="admin-eyebrow">CONTENT</span>
          <h2>New article</h2>
          <p>Start with a draft. Preview your work, then publish when it is ready.</p>
          <div className="admin-welcome-actions">
            <a href="/admin/articles/new">
              Write an article <ArrowRight size={17} />
            </a>
            <a href="/admin/articles?status=draft">View drafts</a>
          </div>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            name: 'Articles',
            count: data?.counts.articles,
            icon: FileText,
            href: '/admin/articles',
            detail: 'Browse articles',
          },
          {
            name: 'Drafts',
            count: data?.counts.drafts,
            icon: FileText,
            href: '/admin/articles?status=draft',
            otherHref: '/admin/projects?status=draft',
            detail: 'Articles',
          },
          {
            name: 'Projects',
            count: data?.counts.projects,
            icon: FolderKanban,
            href: '/admin/projects',
            detail: 'Browse projects',
          },
          {
            name: 'Trash',
            count: data?.counts.trash,
            icon: Trash2,
            href: '/admin/articles?status=trash',
            detail: 'Articles',
            otherHref: '/admin/projects?status=trash',
          },
        ].map((stat, i) => (
          <div className={`admin-stat stat-${i}`} key={stat.name}>
            <div>
              <span>{stat.name}</span>
              <stat.icon size={19} />
            </div>
            <strong>{loading ? '—' : (stat.count ?? '—')}</strong>
            <div className="admin-stat-links">
              <a href={stat.href}>
                {stat.detail}
                <ArrowUpRight size={14} />
              </a>
              {stat.otherHref && (
                <a href={stat.otherHref}>
                  Projects
                  <ArrowUpRight size={14} />
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
              <h2>Recently edited</h2>
              <p>Pick up where you left off.</p>
            </div>
            <a href="/admin/articles">
              All articles <ArrowRight size={15} />
            </a>
          </div>
          {loading ? (
            <p className="admin-loading">Loading your workspace…</p>
          ) : error && !data ? (
            <p className="admin-loading">Unable to load recent content. Use Reload to try again.</p>
          ) : !data?.recent.length ? (
            <Empty title="No recent edits">
              Your recently edited articles and projects will appear here.
            </Empty>
          ) : (
            <div className="admin-recent-list">
              {data.recent.map((entry) => (
                <a href={editorUrl(entry)} key={entry.id}>
                  <span className="admin-file-icon">
                    {entry.kind === 'article' ? <FileText size={19} /> : <FolderKanban size={19} />}
                  </span>
                  <div>
                    <strong>{entry.content.title || 'Untitled draft'}</strong>
                    <small>
                      {entry.kind === 'article' ? 'Article' : 'Project'} ·{' '}
                      {dateLabel(entry.updatedAt)}
                    </small>
                  </div>
                  <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
                    {entry.deletedAt ? 'Trash' : entry.published ? 'Published' : 'Draft'}
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
              <h2>Make it yours</h2>
              <p>A few useful places to start.</p>
            </div>
          </div>
          <a href="/admin/about">
            <span>
              <UserRound size={21} />
            </span>
            <div>
              <strong>Introduce yourself</strong>
              <small>Update your bio, avatar, and social links.</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/projects/new">
            <span>
              <FolderKanban size={21} />
            </span>
            <div>
              <strong>Share a project</strong>
              <small>Document something you have built.</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/settings">
            <span>
              <Settings size={21} />
            </span>
            <div>
              <strong>Site identity</strong>
              <small>Your site name, images, and search details.</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <div className="admin-note">
            <ShieldCheck size={17} />
            <p>
              Drafts stay private. Publishing is a separate action, so you control what readers see.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
function EntryList({ kind }: { kind: 'article' | 'project' }) {
  const name = kind === 'article' ? 'Article' : 'Project';
  const initialFilters = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const [query, setQuery] = useState(() => (initialFilters.get('q') || '').slice(0, 200));
  const [search, setSearch] = useState(() => (initialFilters.get('q') || '').slice(0, 200));
  const [status, setStatus] = useState(() => initialFilters.get('status') || '');
  const [category, setCategory] = useState(() => initialFilters.get('category') || '');
  const [busy, setBusy] = useState('');
  const actionInFlight = useRef(false);
  const [notice, setNotice] = useState('');
  const { data: taxonomy } = useRemote<Taxonomies>('/api/admin/taxonomies');
  const { data, error, setError, loading, refresh } = useRemote<{ items: Entry[] }>(
    `/api/admin/entries?kind=${kind}&q=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&category=${encodeURIComponent(category)}`,
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of [
      ['q', search],
      ['status', status],
      ['category', category],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', url);
  }, [search, status, category]);
  function clearFilters() {
    setQuery('');
    setSearch('');
    setCategory('');
    setStatus('');
  }
  async function action(entry: Entry, actionName: 'trash' | 'restore' | 'unpublish') {
    if (actionInFlight.current) return;
    if (
      actionName === 'trash' &&
      !window.confirm(
        `Move “${entry.content.title || 'Untitled draft'}” to trash? Its public version will be removed. You can restore it later.`,
      )
    )
      return;
    if (
      actionName === 'unpublish' &&
      !window.confirm(
        `Unpublish “${entry.content.title}”? Readers will no longer be able to access it. Your draft will be kept.`,
      )
    )
      return;
    actionInFlight.current = true;
    setBusy(entry.id);
    setError('');
    setNotice('');
    try {
      await api(
        `/api/admin/entries/${entry.id}/action`,
        json('POST', { action: actionName, version: entry.version }),
      );
      setNotice(
        actionName === 'restore'
          ? 'Content restored as a draft.'
          : actionName === 'trash'
            ? 'Content moved to trash.'
            : 'Content unpublished. Your draft is kept.',
      );
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      actionInFlight.current = false;
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        label="CONTENT"
        title={kind === 'article' ? 'Articles' : 'Projects'}
        description={
          kind === 'article'
            ? 'Write, review, and publish your articles.'
            : 'Document your projects and the work behind them.'
        }
      >
        <a
          className="admin-button primary"
          href={`/admin/${kind === 'article' ? 'articles' : 'projects'}/new`}
        >
          <Plus size={17} /> New {name.toLowerCase()}
        </a>
      </PageTitle>
      <Alert message={error} />
      <Alert message={notice} success />
      <section className="admin-panel">
        <div className="admin-list-toolbar">
          <div className="admin-tabs" role="group" aria-label="Publication status">
            {[
              ['', 'All content'],
              ['draft', 'Draft'],
              ['published', 'Published'],
              ['trash', 'Trash'],
            ].map(([value, label]) => (
              <button
                className={status === value ? 'active' : ''}
                key={value}
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
              >
                {value === 'trash' && <Trash2 size={14} />}
                {label}
              </button>
            ))}
          </div>
          <div className="admin-filter-row">
            <label className="admin-search">
              <Search size={17} />
              <input
                aria-label={`Search ${name.toLowerCase()}s`}
                placeholder="Search titles or summaries…"
                type="search"
                maxLength={200}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {taxonomy?.categories.map((c) => (
                <option value={c.name} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {(query || category || status) && (
              <button className="admin-button small" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            <button
              className="admin-icon-button"
              type="button"
              onClick={refresh}
              aria-label="Refresh list"
              title="Refresh list"
              disabled={loading}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
        {loading ? (
          <p className="admin-loading">Loading {name.toLowerCase()}s…</p>
        ) : error && !data ? (
          <div className="admin-loading">
            Unable to load content. Use Refresh list to try again.
          </div>
        ) : !data?.items.length ? (
          <Empty
            title={
              query || category
                ? 'No matching content'
                : status === 'trash'
                  ? 'Trash is empty'
                  : `No ${name.toLowerCase()}s yet`
            }
          >
            {query || category
              ? 'Try another keyword or clear the filters.'
              : status === 'trash'
                ? 'Trashed content stays here until you restore it.'
                : `Create a new ${name.toLowerCase()} to get started.`}
          </Empty>
        ) : (
          <div
            className="admin-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Content table. Scroll horizontally to see all columns."
          >
            <table className="admin-table">
              <caption className="sr-only">{name}s matching the current filters</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Category</th>
                  <th scope="col">Last edited</th>
                  <th scope="col" className="admin-align-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <a className="admin-entry-title" href={editorUrl(entry)}>
                        <span className="admin-table-thumbnail">
                          {entry.content.cover ? (
                            <img src={entry.content.cover} alt="" />
                          ) : (
                            <FileText size={20} />
                          )}
                        </span>
                        <span>
                          <strong>
                            {entry.content.title || 'Untitled draft'}
                            {entry.content.featured && (
                              <span className="admin-featured-label">Featured</span>
                            )}
                          </strong>
                          <small>/{entry.content.slug || 'no-slug-yet'}</small>
                        </span>
                      </a>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${entry.published && !entry.deletedAt ? 'published' : ''}`}
                      >
                        {entry.deletedAt ? 'Trashed' : entry.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      {taxonomy?.categories.find((c) => c.name === entry.content.category)?.name ||
                        entry.content.category ||
                        '—'}
                    </td>
                    <td className="admin-nowrap">{dateLabel(entry.updatedAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        {entry.deletedAt ? (
                          <button
                            disabled={!!busy}
                            onClick={() => action(entry, 'restore')}
                            className="admin-button small"
                          >
                            <RefreshCw size={14} /> Restore
                          </button>
                        ) : (
                          <>
                            <a className="admin-button small" href={editorUrl(entry)}>
                              Edit
                            </a>
                            {entry.published && (
                              <button
                                className="admin-button small"
                                disabled={!!busy}
                                onClick={() => action(entry, 'unpublish')}
                              >
                                Unpublish
                              </button>
                            )}
                            <button
                              className="admin-icon-button danger"
                              aria-label={`Move ${entry.content.title} to trash`}
                              disabled={!!busy}
                              onClick={() => action(entry, 'trash')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-table-footer">
          <span role="status" aria-live="polite">
            {loading ? 'Updating results…' : `${data?.items.length ?? 0} ${name.toLowerCase()}s`}
          </span>
          <span>Draft content is only visible to you.</span>
        </div>
      </section>
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
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-dialog-overlay" />
        <Dialog.Content className="admin-dialog admin-app">
          <div className="admin-dialog-heading">
            <div>
              <Dialog.Title>Choose image</Dialog.Title>
              <Dialog.Description>
                Select an image from your library or upload a new one.
              </Dialog.Description>
            </div>
            <Dialog.Close className="admin-icon-button" aria-label="Close image picker">
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
  const { data, error, setError, loading, refresh } = useRemote<{ items: Media[] }>(
    '/api/admin/media',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadInFlight = useRef(false);
  const filteredMedia =
    data?.items.filter((item) =>
      `${item.name} ${item.alt}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) || [];
  async function upload(file?: File) {
    if (!file || uploadInFlight.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPEG, and WebP images are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Images cannot exceed 10 MB.');
      return;
    }
    uploadInFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('file', file);
    form.append('alt', '');
    try {
      await api<Media>('/api/admin/media', { method: 'POST', body: form });
      refresh();
      setMessage('Image added to your media library.');
    } catch (e) {
      setError(errorMessage(e));
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
        <Upload size={17} /> {busy ? 'Uploading…' : 'Upload image'}
      </button>
      <input
        ref={fileInput}
        hidden
        type="file"
        aria-label="Upload image file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
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
          title="Media library"
          description="Manage covers, avatars, and images in one place."
        >
          {uploadButton}
        </PageTitle>
      )}
      {picker && (
        <div className="admin-picker-toolbar">
          {uploadButton}
          <small>JPG, PNG, WebP · Up to 10 MB</small>
        </div>
      )}
      <Alert message={error} />
      <Alert message={message} success />
      <div className="admin-media-search">
        <label className="admin-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search media"
            placeholder="Search filenames or alt text…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {query && (
          <button className="admin-button small" type="button" onClick={() => setQuery('')}>
            Clear search
          </button>
        )}
        <button
          className="admin-icon-button"
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh media"
          title="Refresh media"
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {!picker && (
        <div className="admin-media-info">
          <span>
            <Image size={16} /> {data?.items.length ?? 0} images
          </span>
          <span>JPG, PNG, WebP · Up to 10 MB</span>
        </div>
      )}
      {loading ? (
        <p className="admin-loading">Loading media library…</p>
      ) : error && !data ? (
        <p className="admin-loading">Unable to load images. Use Refresh media to try again.</p>
      ) : !data?.items.length ? (
        <Empty title="Your image library starts here">
          Upload a cover, avatar, or article image. Files are stored on your server.
        </Empty>
      ) : !filteredMedia.length ? (
        <Empty title="No matching images">
          Try another filename or description, or clear the search.
        </Empty>
      ) : (
        <div className={`admin-media-grid ${picker ? 'picker' : ''}`}>
          {filteredMedia.map((media) => (
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
    if (!window.confirm(`Permanently delete “${media.name}”? This cannot be undone.`)) return;
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
          aria-label={`Choose image ${media.name}`}
          onClick={() => onSelect?.(media)}
        >
          <img src={media.url} alt={media.alt || media.name} loading="lazy" />
          <span>
            Choose image <Plus size={16} />
          </span>
        </button>
      ) : (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="admin-media-image">
          <img src={media.url} alt={media.alt || media.name} loading="lazy" />
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
              Alt text
              <input
                disabled={busy}
                maxLength={300}
                value={alt}
                onChange={(e) => {
                  setAlt(e.target.value);
                  setSaved(false);
                }}
                placeholder="Describe the image for readers using assistive technology"
              />
            </label>
            <div className="admin-media-controls">
              <button
                disabled={busy || (alt === media.alt && !saved)}
                className="admin-button small"
                onClick={save}
              >
                {saved ? 'Saved' : 'Save description'}
              </button>
              <button
                className="admin-icon-button danger"
                disabled={busy || media.usedBy.length > 0}
                onClick={remove}
                aria-label={`Delete image ${media.name}`}
                title={
                  media.usedBy.length
                    ? 'This image is in use and cannot be deleted.'
                    : 'Delete permanently'
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <details className="admin-media-usage">
              <summary>
                {media.usedBy.length ? `Used in ${media.usedBy.length} places` : 'Not used yet'}
              </summary>
              {media.usedBy.length > 0 && (
                <ul>
                  {media.usedBy.map((usage, i) => (
                    <li key={i}>{usage}</li>
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
  const { data, error, setError, refresh } = useRemote<Taxonomies>('/api/admin/taxonomies');
  return (
    <>
      <PageTitle
        label="ORGANIZATION"
        title="Categories & tags"
        description="Organize your content so readers can find related topics."
      />
      <Alert message={error} />
      <div className="admin-taxonomy-columns">
        {(['category', 'tag'] as const).map((kind) => (
          <TaxonomySection
            key={kind}
            kind={kind}
            items={(kind === 'category' ? data?.categories : data?.tags) || []}
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
  refresh,
  onError,
}: {
  kind: 'category' | 'tag';
  items: Taxonomy[];
  refresh: () => void;
  onError: (value: string) => void;
}) {
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
      await api(
        `/api/admin/taxonomies${edit ? `/${edit}` : ''}`,
        json(edit ? 'PATCH' : 'POST', { kind, name, slug }),
      );
      setName('');
      setSlug('');
      setEdit(null);
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
        `Delete ${label.toLowerCase()} “${item.name}”? Items still in use cannot be deleted.`,
      )
    )
      return;
    onError('');
    setBusy(true);
    try {
      await api(`/api/admin/taxonomies/${item.id}`, { method: 'DELETE' });
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
          <h2>{label}</h2>
          <p>
            {kind === 'category'
              ? 'Broad sections for organizing content.'
              : 'Specific topics, technologies, and keywords.'}
          </p>
        </div>
        <span className="admin-count">{items.length}</span>
      </div>
      <form className="admin-taxonomy-form" onSubmit={submit}>
        <label>
          {label} name
          <input
            ref={nameInput}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'category' ? 'For example: Development' : 'For example: Astro'}
          />
        </label>
        <label>
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Leave blank to generate automatically"
          />
        </label>
        <div className="admin-form-actions">
          <button disabled={busy} className="admin-button primary" type="submit">
            {edit ? 'Save changes' : `Add ${label.toLowerCase()}`}
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
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="admin-taxonomy-list">
        {items.length ? (
          items.map((item) => (
            <div key={item.id}>
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
                Edit
              </button>
              <button
                className="admin-icon-button danger"
                aria-label={`Delete ${label.toLowerCase()} ${item.name}`}
                disabled={busy}
                onClick={() => remove(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className="admin-subtle">No {label.toLowerCase()} items yet. Add one above.</p>
        )}
      </div>
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
  const { data, setData, error, setError, loading, refresh } =
    useRemote<SiteSettings>('/api/admin/settings');
  const [baseline, setBaseline] = useState<string | null>(null);
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
    if (!data || saveInFlight.current) return;
    saveInFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const snapshot = JSON.stringify(data);
      const result = await api<SiteSettings>('/api/admin/settings', json('PUT', data));
      setBaseline(JSON.stringify(result));
      setData((current) => (current && JSON.stringify(current) === snapshot ? result : current));
      setMessage('Settings saved.');
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
      {label}
      {options.multiline ? (
        <textarea
          aria-label={label}
          maxLength={fieldLimits[key]}
          value={String(data?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
          required={options.required}
          rows={key === 'about' ? 14 : key === 'homeIntro' ? 9 : 3}
        />
      ) : (
        <input
          aria-label={label}
          maxLength={fieldLimits[key]}
          type={options.type || 'text'}
          required={options.required}
          value={String(data?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
      {options.help && <small>{options.help}</small>}
    </label>
  );
  const imageControl = (key: 'logo' | 'avatar' | 'heroImage', label: string) => (
    <div className="admin-field">
      <span>{label}</span>
      <div className="admin-setting-image">
        {data?.[key] ? (
          <img src={data[key]} alt={label} />
        ) : (
          <div className="admin-image-placeholder">
            <Image size={25} />
          </div>
        )}
        <div>
          <button className="admin-button small" type="button" onClick={() => setImageField(key)}>
            Choose image
          </button>
          {data?.[key] && (
            <button className="admin-button small" type="button" onClick={() => change(key, '')}>
              Remove image
            </button>
          )}
        </div>
      </div>
      <input
        aria-label={`${label} URL`}
        maxLength={2048}
        value={data?.[key] || ''}
        onChange={(e) => change(key, e.target.value)}
        placeholder="/media/… or /images/…"
      />
    </div>
  );
  return (
    <>
      <PageTitle
        label={about ? 'PROFILE' : 'CONFIGURATION'}
        title={about ? 'About me' : 'Site settings'}
        description={
          about
            ? 'Introduce yourself and give readers a way to stay in touch.'
            : 'Manage your site identity, search details, and account security.'
        }
      />
      <Alert message={error} />
      <Alert
        message={
          message
            ? dirty
              ? 'Saved submitted settings. You still have unsaved changes.'
              : message
            : ''
        }
        success
      />
      {error && !data && (
        <button className="admin-button" type="button" onClick={refresh}>
          Retry loading settings
        </button>
      )}
      {loading ? (
        <p className="admin-loading">Loading settings…</p>
      ) : (
        data && (
          <form className="admin-settings-grid" onSubmit={save} aria-busy={busy}>
            <div>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>{about ? 'Your introduction' : 'Identity & search'}</h2>
                    <p>
                      {about
                        ? 'These details appear on your homepage and About page.'
                        : 'Help readers recognize your site in the browser and search results.'}
                    </p>
                  </div>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    <>
                      {field('authorName', 'Display name', { required: true })}
                      {field('homeIntro', 'Homepage introduction (Markdown)', {
                        multiline: true,
                        required: true,
                        help: 'Supports Markdown headings, links, and images. Saving immediately updates the homepage.',
                      })}
                      {field('bio', 'Short bio', {
                        multiline: true,
                        help: 'Appears in the sidebar and About page metadata.',
                      })}
                      {field('about', 'About me', {
                        multiline: true,
                        help: 'Use Markdown for headings, lists, links, and images.',
                      })}
                    </>
                  ) : (
                    <>
                      {field('siteName', 'Site name', { required: true })}
                      {field('tagline', 'Tagline')}
                      {field('description', 'Site description', {
                        multiline: true,
                        help: 'Used for search metadata. Edit your homepage introduction under About me.',
                      })}
                      {field('siteUrl', 'Public site URL', {
                        type: 'url',
                        help: 'For example, https://your-domain.com. Used by canonical URLs, RSS, and sitemap. The deployment SITE_URL must match.',
                      })}
                    </>
                  )}
                </div>
              </section>
              {about && (
                <section className="admin-panel admin-form-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Social links</h2>
                      <p>Help readers find you elsewhere.</p>
                    </div>
                    <button
                      className="admin-button small"
                      type="button"
                      disabled={data.socialLinks.length >= 12}
                      onClick={() =>
                        change('socialLinks', [...data.socialLinks, { label: '', url: '' }])
                      }
                    >
                      <Plus size={15} /> Add link
                    </button>
                  </div>
                  <div className="admin-form-body">
                    {data.socialLinks.map((link, index) => (
                      <div className="admin-social-row" key={index}>
                        <label>
                          Platform
                          <input
                            value={link.label}
                            required
                            maxLength={50}
                            placeholder="GitHub"
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
                          URL
                          <input
                            type="url"
                            value={link.url}
                            required
                            maxLength={2048}
                            placeholder="https://…"
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
                          aria-label={`Remove social link ${index + 1}`}
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
                      <p className="admin-subtle">No social links yet.</p>
                    )}
                  </div>
                </section>
              )}
            </div>
            <aside>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <h2>{about ? 'Your avatar' : 'Site images'}</h2>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    imageControl('avatar', 'Avatar')
                  ) : (
                    <>
                      {imageControl('logo', 'Site logo')}
                      {imageControl('heroImage', 'Homepage image')}
                    </>
                  )}
                  <div className="admin-note">
                    <Image size={17} />
                    <p>Use your media library to keep image management and backups in one place.</p>
                  </div>
                </div>
              </section>
            </aside>
            <div className="admin-settings-savebar">
              <div>
                <strong role="status">
                  {busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'All settings saved'}
                </strong>
                <span>Changes go live when you save.</span>
              </div>
              <button className="admin-button primary" disabled={busy || !dirty} type="submit">
                <Check size={17} />
                {busy ? 'Saving…' : 'Save settings'}
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
          <h2>Account security</h2>
          <p>Changing your password signs out your other sessions.</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      <form className="admin-form-body" onSubmit={submit}>
        <Alert message={error} />
        <Alert message={message} success />
        <div className="admin-password-fields">
          <label>
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
            <small>At least 12 characters</small>
          </label>
          <label>
            Confirm new password
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
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}
