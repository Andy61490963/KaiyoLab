import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
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
  Moon,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
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
      <p>{children || '新增內容後，資料會顯示在這裡'}</p>
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
      .then(setData)
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
export function ThemeButton() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('kaiyo-theme', next ? 'dark' : 'light');
    } catch {}
  }
  return (
    <button
      className="admin-icon-button"
      type="button"
      onClick={toggle}
      aria-label={dark ? '切換淺色主題' : '切換深色主題'}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
const navigation = [
  { href: '/admin', label: '網站總覽', icon: LayoutDashboard },
  { href: '/admin/articles', label: '文章管理', icon: FileText },
  { href: '/admin/projects', label: '作品管理', icon: FolderKanban },
  { href: '/admin/media', label: '媒體庫', icon: Image },
  { href: '/admin/taxonomies', label: '分類與標籤', icon: Tag },
  { href: '/admin/about', label: '關於我', icon: UserRound },
  { href: '/admin/settings', label: '網站設定', icon: Settings },
];
function Navigation({ path, close }: { path: string; close?: () => void }) {
  return (
    <>
      <a className="admin-brand" href="/admin">
        <span className="admin-brand-symbol">
          <Orbit size={24} />
        </span>
        <span>
          KaiyoLab<small>網站內容管理</small>
        </span>
      </a>
      <div className="admin-nav-caption">工作空間</div>
      <nav aria-label="管理功能">
        {navigation.map((item) => {
          const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href);
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
        <a className="admin-site-link" href="/" target="_blank" rel="noreferrer">
          <span>
            <Orbit size={18} /> 前往公開網站
          </span>
          <ArrowUpRight size={17} />
        </a>
        <div className="admin-owner">
          <span className="admin-owner-avatar">
            <UserRound size={19} />
          </span>
          <div>
            站長管理
            <small>僅站長可見</small>
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
  const current =
    navigation.find((item) => item.href !== '/admin' && path.startsWith(item.href)) ||
    navigation[0];
  let page: ReactNode;
  const match = path.match(/^\/admin\/(articles|projects)\/([^/]+)$/);
  if (match)
    page = (
      <Suspense fallback={<p className="admin-loading">正在載入編輯器…</p>}>
        <EntryEditor id={match[2]} kind={match[1] === 'articles' ? 'article' : 'project'} />
      </Suspense>
    );
  else if (path === '/admin') page = <Dashboard />;
  else if (path === '/admin/articles' || path === '/admin/projects')
    page = <EntryList kind={path.endsWith('articles') ? 'article' : 'project'} />;
  else if (path === '/admin/media') page = <MediaLibrary />;
  else if (path === '/admin/taxonomies') page = <TaxonomyManager />;
  else if (path === '/admin/about' || path === '/admin/settings')
    page = <SettingsForm about={path.endsWith('about')} />;
  else
    page = (
      <Empty title="找不到這個管理頁面">
        <a href="/admin">回到網站總覽</a>
      </Empty>
    );
  async function logout() {
    try {
      await api('/api/auth/sign-out', json('POST', {}));
      window.location.href = '/login';
    } catch (e) {
      setLogoutError(errorMessage(e));
    }
  }
  return (
    <div className="admin-app">
      <a className="admin-skip" href="#admin-main">
        跳至主要內容
      </a>
      <aside className="admin-sidebar">
        <Navigation path={path} />
      </aside>
      <div className="admin-workspace">
        <div className="admin-topbar">
          <div className="admin-breadcrumb">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <button className="admin-icon-button admin-mobile-menu" aria-label="開啟管理選單">
                  <Menu size={21} />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="admin-dialog-overlay" />
                <Dialog.Content className="admin-mobile-drawer admin-app">
                  <Dialog.Title className="sr-only">管理選單</Dialog.Title>
                  <Dialog.Description className="sr-only">選擇內容管理功能</Dialog.Description>
                  <Dialog.Close
                    className="admin-drawer-close admin-icon-button"
                    aria-label="關閉選單"
                  >
                    <X size={20} />
                  </Dialog.Close>
                  <Navigation path={path} close={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span>工作空間</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-private-badge">
              <ShieldCheck size={14} /> 私人空間
            </span>
            <ThemeButton />
            <button className="admin-icon-button" onClick={logout} aria-label="登出">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <main id="admin-main" className="admin-main">
          <Alert message={logoutError} />
          {page}
        </main>
        <footer className="admin-footer">
          <span>KaiyoLab · 網站內容管理</span>
          <a href="/" target="_blank" rel="noreferrer">
            查看網站 <ArrowUpRight size={13} />
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
      <PageTitle label="管理總覽" title="網站總覽" description="查看內容狀態與最近修改的文章、作品">
        <a className="admin-button primary" href="/admin/articles/new">
          <Plus size={17} /> 撰寫文章
        </a>
      </PageTitle>
      <Alert message={error} />
      {error && (
        <button className="admin-button" onClick={refresh}>
          <RefreshCw size={16} /> 重新載入
        </button>
      )}
      <section className="admin-welcome">
        <div className="admin-welcome-content">
          <span className="admin-eyebrow">內容管理</span>
          <h2>新增文章</h2>
          <p>撰寫草稿、預覽內容，準備好後再發布到網站</p>
          <div className="admin-welcome-actions">
            <a href="/admin/articles/new">
              建立文章草稿 <ArrowRight size={17} />
            </a>
            <a href="/admin/articles?status=draft">查看草稿</a>
          </div>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            name: '文章總數',
            count: data?.counts.articles,
            icon: FileText,
            href: '/admin/articles',
            detail: '查看所有文章',
          },
          {
            name: '編輯中草稿',
            count: data?.counts.drafts,
            icon: FileText,
            href: '/admin/articles?status=draft',
            detail: '查看草稿',
          },
          {
            name: '作品總數',
            count: data?.counts.projects,
            icon: FolderKanban,
            href: '/admin/projects',
            detail: '管理作品',
          },
          {
            name: '垃圾桶',
            count: data?.counts.trash,
            icon: Trash2,
            href: '/admin/articles?status=trash',
            detail: '查看與還原',
          },
        ].map((stat, i) => (
          <a className={`admin-stat stat-${i}`} href={stat.href} key={stat.name}>
            <div>
              <span>{stat.name}</span>
              <stat.icon size={19} />
            </div>
            <strong>{loading ? '—' : (stat.count ?? '—')}</strong>
            <small>
              {stat.detail}
              <ArrowUpRight size={15} />
            </small>
          </a>
        ))}
      </div>
      <div className="admin-dashboard-columns">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>最近編輯</h2>
              <p>最近修改的文章與作品</p>
            </div>
            <a href="/admin/articles">
              全部內容 <ArrowRight size={15} />
            </a>
          </div>
          {loading ? (
            <p className="admin-loading">正在載入你的工作空間…</p>
          ) : !data?.recent.length ? (
            <Empty title="尚無編輯紀錄">新增文章或作品後，最近修改的內容會顯示在這裡</Empty>
          ) : (
            <div className="admin-recent-list">
              {data.recent.map((entry) => (
                <a href={editorUrl(entry)} key={entry.id}>
                  <span className="admin-file-icon">
                    {entry.kind === 'article' ? <FileText size={19} /> : <FolderKanban size={19} />}
                  </span>
                  <div>
                    <strong>{entry.content.title || '未命名草稿'}</strong>
                    <small>
                      {entry.kind === 'article' ? '文章' : '作品'} · {dateLabel(entry.updatedAt)}
                    </small>
                  </div>
                  <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
                    {entry.deletedAt ? '垃圾桶' : entry.published ? '已發布' : '草稿'}
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
              <h2>常用設定</h2>
              <p>編輯關於我、作品與網站資料</p>
            </div>
          </div>
          <a href="/admin/about">
            <span>
              <UserRound size={21} />
            </span>
            <div>
              <strong>介紹你自己</strong>
              <small>更新簡介、頭像與社群連結</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/projects/new">
            <span>
              <FolderKanban size={21} />
            </span>
            <div>
              <strong>分享一個作品</strong>
              <small>把實作成果整理成作品集</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <a href="/admin/settings">
            <span>
              <Settings size={21} />
            </span>
            <div>
              <strong>設定網站品牌</strong>
              <small>站名、首頁視覺與 SEO</small>
            </div>
            <ArrowUpRight size={17} />
          </a>
          <div className="admin-note">
            <ShieldCheck size={17} />
            <p>草稿只屬於你；完成編輯後，點選「發布」才會在公開網站顯示</p>
          </div>
        </section>
      </div>
    </>
  );
}
function EntryList({ kind }: { kind: 'article' | 'project' }) {
  const name = kind === 'article' ? '文章' : '作品';
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('status') || ''
      : '',
  );
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState('');
  const { data: taxonomy } = useRemote<Taxonomies>('/api/admin/taxonomies');
  const { data, error, setError, loading, refresh } = useRemote<{ items: Entry[] }>(
    `/api/admin/entries?kind=${kind}&q=${encodeURIComponent(search)}&status=${status}&category=${encodeURIComponent(category)}`,
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  async function action(entry: Entry, actionName: string) {
    if (
      actionName === 'trash' &&
      !window.confirm(
        `將「${entry.content.title || '未命名草稿'}」移至垃圾桶？公開內容也會下架，之後可以還原`,
      )
    )
      return;
    setBusy(entry.id);
    setError('');
    try {
      await api(
        `/api/admin/entries/${entry.id}/action`,
        json('POST', { action: actionName, version: entry.version }),
      );
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        label="內容管理"
        title={`${name}管理`}
        description={
          kind === 'article'
            ? '把零散的想法，整理成值得分享的內容'
            : '收集你的實作、實驗，以及一路走來的成果'
        }
      >
        <a
          className="admin-button primary"
          href={`/admin/${kind === 'article' ? 'articles' : 'projects'}/new`}
        >
          <Plus size={17} /> 新增{name}
        </a>
      </PageTitle>
      <Alert message={error} />
      <section className="admin-panel">
        <div className="admin-list-toolbar">
          <div className="admin-tabs" aria-label="發布狀態">
            {[
              ['', '全部內容'],
              ['draft', '草稿'],
              ['published', '已發布'],
              ['trash', '垃圾桶'],
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
                aria-label={`搜尋${name}`}
                placeholder={`搜尋${name}標題或內容…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="篩選分類"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">全部分類</option>
              {taxonomy?.categories.map((c) => (
                <option value={c.name} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="admin-icon-button" onClick={refresh} aria-label="重新載入列表">
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
        {loading ? (
          <p className="admin-loading">載入{name}中…</p>
        ) : !data?.items.length ? (
          <Empty
            title={
              query || category
                ? '找不到符合條件的內容'
                : status === 'trash'
                  ? '垃圾桶目前是空的'
                  : `還沒有${name}`
            }
          >
            {query || category
              ? '試著換個關鍵字或調整分類'
              : status === 'trash'
                ? '移除的內容會保留在這裡，隨時可以還原'
                : `點選右上方「新增${name}」，開始你的第一份內容`}
          </Empty>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{name}名稱</th>
                  <th>狀態</th>
                  <th>分類</th>
                  <th>最後編輯</th>
                  <th className="admin-align-right">操作</th>
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
                            {entry.content.title || '未命名草稿'}
                            {entry.content.featured && (
                              <span className="admin-featured-label">精選</span>
                            )}
                          </strong>
                          <small>/{entry.content.slug || '尚未設定網址'}</small>
                        </span>
                      </a>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${entry.published && !entry.deletedAt ? 'published' : ''}`}
                      >
                        {entry.deletedAt ? '已移除' : entry.published ? '已發布' : '草稿'}
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
                            disabled={busy === entry.id}
                            onClick={() => action(entry, 'restore')}
                            className="admin-button small"
                          >
                            <RefreshCw size={14} /> 還原
                          </button>
                        ) : (
                          <>
                            <a className="admin-button small" href={editorUrl(entry)}>
                              編輯
                            </a>
                            {entry.published && (
                              <button
                                className="admin-button small"
                                disabled={busy === entry.id}
                                onClick={() => action(entry, 'unpublish')}
                              >
                                下架
                              </button>
                            )}
                            <button
                              className="admin-icon-button danger"
                              aria-label={`刪除${entry.content.title}`}
                              disabled={busy === entry.id}
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
          <span>
            {data?.items.length ?? 0} 筆{name}
          </span>
          <span>草稿內容僅對站長可見</span>
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
              <Dialog.Title>選擇圖片</Dialog.Title>
              <Dialog.Description>從媒體庫選擇，或上傳新的圖片</Dialog.Description>
            </div>
            <Dialog.Close className="admin-icon-button" aria-label="關閉圖片選擇">
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
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('file', file);
    form.append('alt', '');
    try {
      await api<Media>('/api/admin/media', { method: 'POST', body: form });
      refresh();
      setMessage('圖片已加入媒體庫');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const uploadButton = (
    <label className={`admin-button primary admin-file-input ${busy ? 'disabled' : ''}`}>
      <Upload size={17} /> {busy ? '上傳中…' : '上傳圖片'}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
  return (
    <>
      {!picker && (
        <PageTitle
          label="媒體管理"
          title="媒體庫"
          description="集中管理圖片，讓每份內容都有適合的視覺"
        >
          {uploadButton}
        </PageTitle>
      )}
      {picker && (
        <div className="admin-picker-toolbar">
          {uploadButton}
          <small>JPG、PNG、WebP · 最大 10 MB</small>
        </div>
      )}
      <Alert message={error} />
      <Alert message={message} success />
      {!picker && (
        <div className="admin-media-info">
          <span>
            <Image size={16} /> {data?.items.length ?? 0} 張圖片
          </span>
          <span>JPG、PNG、WebP · 最大 10 MB</span>
        </div>
      )}
      {loading ? (
        <p className="admin-loading">正在載入媒體庫…</p>
      ) : !data?.items.length ? (
        <Empty title="給你的內容一些色彩">
          上傳封面、頭像或文章插圖，所有圖片都會保存在你的伺服器
        </Empty>
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
    if (!window.confirm(`永久刪除圖片「${media.name}」？此動作無法還原`)) return;
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
        <button className="admin-media-select" onClick={() => onSelect?.(media)}>
          <img src={media.url} alt={media.alt || media.name} loading="lazy" />
          <span>
            選擇圖片 <Plus size={16} />
          </span>
        </button>
      ) : (
        <a href={media.url} target="_blank" rel="noreferrer" className="admin-media-image">
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
              替代文字
              <input
                disabled={busy}
                value={alt}
                onChange={(e) => {
                  setAlt(e.target.value);
                  setSaved(false);
                }}
                placeholder="描述圖片，協助無障礙閱讀"
              />
            </label>
            <div className="admin-media-controls">
              <button
                disabled={busy || (alt === media.alt && !saved)}
                className="admin-button small"
                onClick={save}
              >
                {saved ? '已儲存' : '儲存描述'}
              </button>
              <button
                className="admin-icon-button danger"
                disabled={busy || media.usedBy.length > 0}
                onClick={remove}
                aria-label={`刪除圖片 ${media.name}`}
                title={media.usedBy.length ? '圖片使用中，無法刪除' : '永久刪除'}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <details className="admin-media-usage">
              <summary>
                {media.usedBy.length ? `${media.usedBy.length} 處使用中` : '尚未被使用'}
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
        label="內容架構"
        title="分類與標籤"
        description="替內容建立清楚的脈絡，讓讀者更容易找到想看的主題"
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
  const [busy, setBusy] = useState(false);
  const label = kind === 'category' ? '分類' : '標籤';
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
    if (!window.confirm(`刪除${label}「${item.name}」？若仍被內容使用，系統會阻止刪除`)) return;
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
          <p>{kind === 'category' ? '用於整理文章的主要分類' : '用於標記文章主題的關鍵字'}</p>
        </div>
        <span className="admin-count">{items.length}</span>
      </div>
      <form className="admin-taxonomy-form" onSubmit={submit}>
        <label>
          {label}名稱
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'category' ? '例如：開發筆記' : '例如：Astro'}
          />
        </label>
        <label>
          網址代稱
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="可留空，自動產生"
          />
        </label>
        <div className="admin-form-actions">
          <button disabled={busy} className="admin-button primary" type="submit">
            {edit ? '儲存修改' : `新增${label}`}
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
              取消
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
                }}
              >
                編輯
              </button>
              <button
                className="admin-icon-button danger"
                aria-label={`刪除${label} ${item.name}`}
                disabled={busy}
                onClick={() => remove(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <p className="admin-subtle">還沒有{label}，從上方新增</p>
        )}
      </div>
    </section>
  );
}
function SettingsForm({ about }: { about: boolean }) {
  const { data, setData, error, setError, loading } =
    useRemote<SiteSettings>('/api/admin/settings');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imageField, setImageField] = useState<'logo' | 'avatar' | 'heroImage' | null>(null);
  const change = (key: keyof SiteSettings, value: unknown) => {
    setData((previous) => (previous ? { ...previous, [key]: value } : previous));
    setMessage('');
  };
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const snapshot = JSON.stringify(data);
      const result = await api<SiteSettings>('/api/admin/settings', json('PUT', data));
      setData((current) => (current && JSON.stringify(current) === snapshot ? result : current));
      setMessage('已儲存送出的設定；若送出期間繼續編輯，請再儲存一次');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
          value={String(data?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
          required={options.required}
          rows={key === 'about' ? 14 : key === 'homeIntro' ? 9 : 3}
        />
      ) : (
        <input
          aria-label={label}
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
            選擇圖片
          </button>
          {data?.[key] && (
            <button className="admin-button small" type="button" onClick={() => change(key, '')}>
              使用預設
            </button>
          )}
        </div>
      </div>
      <input
        aria-label={`${label}網址`}
        value={data?.[key] || ''}
        onChange={(e) => change(key, e.target.value)}
        placeholder="/media/… 或 /images/…"
      />
    </div>
  );
  return (
    <>
      <PageTitle
        label={about ? '個人檔案' : '網站控制台'}
        title={about ? '讓讀者認識你' : '網站設定'}
        description={about ? '編輯個人介紹與社群連結' : '調整網站名稱、品牌圖片與基本資訊'}
      />
      <Alert message={error} />
      <Alert message={message} success />
      {loading ? (
        <p className="admin-loading">正在載入設定…</p>
      ) : (
        data && (
          <form className="admin-settings-grid" onSubmit={save}>
            <div>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>{about ? '個人介紹' : '品牌與搜尋資訊'}</h2>
                    <p>
                      {about
                        ? '這些資訊會顯示在首頁及「關於我」'
                        : '讓公開網站與搜尋結果清楚表達你的風格'}
                    </p>
                  </div>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    <>
                      {field('authorName', '顯示名稱', { required: true })}
                      {field('homeIntro', '首頁自我介紹（Markdown）', {
                        multiline: true,
                        required: true,
                        help: '整段首頁文字可直接編輯，支援標題、段落、連結與圖片；儲存後立即更新首頁',
                      })}
                      {field('bio', '個人簡介', {
                        multiline: true,
                        help: '顯示在側欄與關於我頁面',
                      })}
                      {field('about', '關於我', {
                        multiline: true,
                        help: '支援 Markdown，可加入小標題、清單與連結',
                      })}
                    </>
                  ) : (
                    <>
                      {field('siteName', '網站名稱', { required: true })}
                      {field('tagline', '一句話介紹')}
                      {field('description', '網站描述', {
                        multiline: true,
                        help: '用於搜尋引擎摘要；首頁文字請到「關於我」編輯',
                      })}
                      {field('siteUrl', '網站公開網址', {
                        type: 'url',
                        help: '例如 https://your-domain.com，影響 canonical、RSS 與 sitemap；部署時的 SITE_URL 也須一致',
                      })}
                    </>
                  )}
                </div>
              </section>
              {about && (
                <section className="admin-panel admin-form-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>社群連結</h2>
                      <p>讓讀者在其他地方找到你</p>
                    </div>
                    <button
                      className="admin-button small"
                      type="button"
                      onClick={() =>
                        change('socialLinks', [...data.socialLinks, { label: '', url: '' }])
                      }
                    >
                      <Plus size={15} /> 新增連結
                    </button>
                  </div>
                  <div className="admin-form-body">
                    {data.socialLinks.map((link, index) => (
                      <div className="admin-social-row" key={index}>
                        <label>
                          平台
                          <input
                            value={link.label}
                            required
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
                          網址
                          <input
                            type="url"
                            value={link.url}
                            required
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
                          aria-label={`移除社群連結 ${index + 1}`}
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
                    {!data.socialLinks.length && <p className="admin-subtle">尚未設定社群連結</p>}
                  </div>
                </section>
              )}
            </div>
            <aside>
              <section className="admin-panel admin-form-panel">
                <div className="admin-panel-heading">
                  <h2>{about ? '你的頭像' : '品牌視覺'}</h2>
                </div>
                <div className="admin-form-body">
                  {about ? (
                    imageControl('avatar', '個人頭像')
                  ) : (
                    <>
                      {imageControl('logo', '網站 Logo')}
                      {imageControl('heroImage', '首頁主視覺')}
                    </>
                  )}
                  <div className="admin-note">
                    <Image size={17} />
                    <p>使用媒體庫中的圖片，方便日後管理與備份</p>
                  </div>
                </div>
              </section>
              <button
                className="admin-button primary admin-save-settings"
                disabled={busy}
                type="submit"
              >
                <Check size={17} />
                {busy ? '正在儲存…' : '儲存設定'}
              </button>
            </aside>
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
      setError('兩次輸入的新密碼不相同');
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
      setMessage('密碼已更新，其他裝置的登入已登出');
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
          <h2>登入與安全</h2>
          <p>變更密碼後，其他裝置需要重新登入</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      <form className="admin-form-body" onSubmit={submit}>
        <Alert message={error} />
        <Alert message={message} success />
        <div className="admin-password-fields">
          <label>
            目前密碼
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            新密碼
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
            <small>至少 12 個字元</small>
          </label>
          <label>
            再次輸入新密碼
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
          {busy ? '更新中…' : '更新密碼'}
        </button>
      </form>
    </section>
  );
}
