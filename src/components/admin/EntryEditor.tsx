import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminLanguage } from './AdminLanguage';
import { editorCodeMirrorPhrases } from '../../lib/admin-messages-editor';
import { LAB_CATEGORY } from '../../lib/lab';
import {
  bodyClearConfirmationMessage,
  needsBodyClearConfirmation,
} from '../../lib/draft-body-safety';
import { readRecovery, type DraftRecovery } from './draft-recovery';
import EntryHistory from './EntryHistory';
import PublishReview from './PublishReview';
import type { ContentReview } from '../../lib/content-review';
import './editor-extensions.css';
import CodeMirror, { EditorState } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import {
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search';
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  Code2,
  Download,
  Eye,
  Heading2,
  GitBranch,
  Image,
  Italic,
  Link,
  List,
  LoaderCircle,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { Alert, MediaPicker } from './AdminApp';
import {
  api,
  ApiError,
  dateLabel,
  editorUrl,
  errorMessage,
  json,
  type Entry,
  type EntryContent,
  type Media,
  type Taxonomies,
} from './api';

const serialize = (value: EntryContent) => JSON.stringify(value);
export default function EntryEditor({
  id,
  kind,
  onDirtyChange,
}: {
  id: string;
  kind: 'article' | 'project';
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, language } = useAdminLanguage();
  const bodyExtensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      // 搜尋狀態必須屬於固定設定，避免 React 重新設定 extensions 時移除臨時附加的狀態
      search(),
      EditorState.phrases.of(language === 'zh-TW' ? editorCodeMirrorPhrases : {}),
    ],
    [language],
  );
  const [entry, setEntry] = useState<Entry | null>(null);
  const [content, setContent] = useState<EntryContent | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [acting, setActing] = useState(false);
  const [review, setReview] = useState<ContentReview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const editorLocked = acting || !!review || historyOpen;
  const [notice, setNotice] = useState('');
  const [taxonomy, setTaxonomy] = useState<Taxonomies>({ categories: [], tags: [] });
  const [preview, setPreview] = useState<{ html: string; readingMinutes: number }>({
    html: '',
    readingMinutes: 0,
  });
  const [previewError, setPreviewError] = useState('');
  const [pane, setPane] = useState<'edit' | 'preview' | 'split'>(() =>
    typeof window !== 'undefined' && matchMedia('(min-width: 1440px)').matches ? 'split' : 'edit',
  );
  const [previewPending, setPreviewPending] = useState(false);
  const [backupUnavailable, setBackupUnavailable] = useState(false);
  const actionInFlight = useRef(false);
  const [picker, setPicker] = useState<'body' | 'cover' | null>(null);
  const [dark, setDark] = useState(false);
  const [recovery, setRecovery] = useState<DraftRecovery | null>(null);
  const current = useRef<EntryContent | null>(null);
  const stored = useRef('');
  const currentEntry = useRef<Entry | null>(null);
  const saving = useRef<Promise<Entry | null> | null>(null);
  const blocked = useRef(false);
  const editor = useRef<EditorView | null>(null);
  const previousEditorLanguage = useRef(language);
  const draftKey = (entryId: string) => `kaiyo-draft-${entryId}`;
  useEffect(() => {
    if (previousEditorLanguage.current === language) return;
    previousEditorLanguage.current = language;
    const view = editor.current;
    if (!view || !searchPanelOpen(view.state)) return;
    const query = getSearchQuery(view.state);
    const active = view.root.activeElement;
    const panel = view.dom.querySelector('.cm-search');
    const panelControl = panel?.contains(active) ? active?.getAttribute('name') : null;
    const inputSelection =
      active instanceof HTMLInputElement && active.selectionStart !== null
        ? {
            start: active.selectionStart,
            end: active.selectionEnd ?? active.selectionStart,
            direction: active.selectionDirection ?? 'none',
          }
        : null;
    const scroll = { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
    // 套件只在建立搜尋面板時讀取 phrases；重開面板，不重建編輯器與復原紀錄
    closeSearchPanel(view);
    openSearchPanel(view);
    // openSearchPanel 可能以目前選取文字建立查詢，這裡保留切換前的完整搜尋條件
    view.dispatch({ effects: setSearchQuery.of(query) });
    const nextFocus = panelControl
      ? view.dom.querySelector<HTMLElement>(`.cm-search [name="${CSS.escape(panelControl)}"]`)
      : active instanceof HTMLElement && active.isConnected
        ? active
        : null;
    nextFocus?.focus({ preventScroll: true });
    if (nextFocus instanceof HTMLInputElement && inputSelection)
      nextFocus.setSelectionRange(
        inputSelection.start,
        inputSelection.end,
        inputSelection.direction,
      );
    view.scrollDOM.scrollTop = scroll.top;
    view.scrollDOM.scrollLeft = scroll.left;
  }, [language]);
  useEffect(() => {
    let active = true;
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    setDark(document.documentElement.dataset.theme === 'dark');
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    api<Taxonomies>('/api/admin/taxonomies')
      .then((result) => active && setTaxonomy(result))
      .catch((e) => active && setError(errorMessage(e)));
    async function load() {
      try {
        const result =
          id === 'new'
            ? await api<Entry>('/api/admin/entries', json('POST', { kind }))
            : await api<Entry>(`/api/admin/entries/${id}`);
        if (!active) return;
        if (typeof result?.content?.body !== 'string')
          throw new Error(
            'The server did not return a valid draft body. Editing has been stopped to protect your content.',
          );
        if (id === 'new') window.history.replaceState({}, '', editorUrl(result));
        currentEntry.current = result;
        current.current = result.content;
        stored.current = serialize(result.content);
        setEntry(result);
        setContent(result.content);
        try {
          const local = readRecovery(localStorage.getItem(draftKey(result.id)));
          if (local?.content && serialize(local.content) !== stored.current) setRecovery(local);
        } catch {
          setBackupUnavailable(true);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id, kind]);
  function remember(value: EntryContent) {
    if (!currentEntry.current) return;
    try {
      localStorage.setItem(
        draftKey(currentEntry.current.id),
        JSON.stringify({
          content: value,
          at: new Date().toISOString(),
          version: currentEntry.current.version,
        }),
      );
      setBackupUnavailable(false);
    } catch {
      setBackupUnavailable(true);
    }
  }
  function update<K extends keyof EntryContent>(key: K, value: EntryContent[K]) {
    if (!current.current || recovery || editorLocked) return;
    const next = { ...current.current, [key]: value };
    current.current = next;
    setContent(next);
    remember(next);
    setNotice('');
    if (!blocked.current) setSaveState(serialize(next) === stored.current ? 'saved' : 'pending');
  }
  async function persist(confirmedSnapshot?: string): Promise<Entry | null> {
    if (saving.current) return saving.current;
    if (blocked.current || recovery) return null;
    const task = async () => {
      try {
        while (
          current.current &&
          currentEntry.current &&
          serialize(current.current) !== stored.current
        ) {
          const snapshot = structuredClone(current.current);
          const clearsBody = needsBodyClearConfirmation(
            currentEntry.current.content.body,
            snapshot.body,
          );
          // Approval applies only to the exact snapshot explicitly confirmed by the author.
          const confirmEmptyBody = clearsBody && serialize(snapshot) === confirmedSnapshot;
          if (clearsBody && !confirmEmptyBody) {
            setSaveState('pending');
            return null;
          }
          setSaveState('saving');
          const result = await api<Entry>(
            `/api/admin/entries/${currentEntry.current.id}`,
            json('PATCH', {
              version: currentEntry.current.version,
              content: snapshot,
              ...(confirmEmptyBody ? { confirmEmptyBody: true } : {}),
            }),
          );
          currentEntry.current = result;
          stored.current = serialize(snapshot);
          setEntry(result);
        }
        setSaveState('saved');
        setError('');
        if (currentEntry.current) {
          try {
            localStorage.removeItem(draftKey(currentEntry.current.id));
          } catch {}
        }
        return currentEntry.current;
      } catch (e) {
        setSaveState('error');
        setError(errorMessage(e));
        if (e instanceof ApiError && e.status === 409) {
          blocked.current = true;
          setConflict(true);
        }
        return null;
      }
    };
    saving.current = task();
    try {
      return await saving.current;
    } finally {
      saving.current = null;
    }
  }
  async function saveDraft() {
    if (actionInFlight.current || editorLocked || recovery || blocked.current) return;
    if (!current.current || !currentEntry.current || currentEntry.current.deletedAt) return;
    actionInFlight.current = true;
    setActing(true);
    try {
      // Wait for an earlier autosave before deciding which persisted body would be cleared.
      if (saving.current) await saving.current;
      if (blocked.current || !current.current || !currentEntry.current) return;
      const snapshot = serialize(current.current);
      if (
        needsBodyClearConfirmation(currentEntry.current.content.body, current.current.body) &&
        !window.confirm(
          t(
            'Save an empty draft body? The previous body will be kept in version history. The public version will not change.',
          ),
        )
      )
        return;
      await persist(snapshot);
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  async function restoreBody() {
    if (actionInFlight.current || editorLocked || recovery || blocked.current) return;
    if (
      !current.current ||
      !currentEntry.current ||
      currentEntry.current.deletedAt ||
      current.current.body.trim() ||
      currentEntry.current.content.body.trim()
    )
      return;
    actionInFlight.current = true;
    setActing(true);
    setError('');
    setNotice('');
    try {
      // Save pending metadata first. The recovery endpoint replaces only the stored body.
      const saved = await persist();
      if (!saved) return;
      const result = await api<Entry>(
        `/api/admin/entries/${saved.id}/restore-body`,
        json('POST', { version: saved.version }),
      );
      restoreVersion(result);
      setNotice(
        'Published body restored to the draft. Draft settings and the public version have not changed.',
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  useEffect(() => {
    if (
      !content ||
      !entry ||
      entry.deletedAt ||
      conflict ||
      recovery ||
      serialize(content) === stored.current
    )
      return;
    const timer = setTimeout(() => {
      void persist();
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, conflict, recovery]);
  useEffect(() => {
    const dirty = !!content && serialize(content) !== stored.current;
    onDirtyChange(dirty || !!recovery || acting);
    return () => onDirtyChange(false);
  }, [content, entry, recovery, acting, saveState, onDirtyChange]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!editorLocked && !conflict && !recovery && !currentEntry.current?.deletedAt)
          void saveDraft();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [editorLocked, conflict, recovery, language]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (current.current && serialize(current.current) !== stored.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    if (!content) return;
    setPreviewPending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ html: string; readingMinutes: number }>('/api/admin/preview', {
        ...json('POST', { body: content.body }),
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setPreview(result);
            setPreviewError('');
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setPreviewError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewPending(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [content?.body]);
  async function prepareReview() {
    if (actionInFlight.current || recovery || blocked.current) return;
    actionInFlight.current = true;
    setActing(true);
    setError('');
    try {
      const saved = await persist();
      if (!saved) return;
      setReview(
        await api<ContentReview>(
          `/api/admin/entries/${saved.id}/checks`,
          json('POST', { version: saved.version }),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  async function prepareHistory() {
    if (actionInFlight.current || recovery || blocked.current) return null;
    actionInFlight.current = true;
    setActing(true);
    try {
      return await persist();
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  function restoreVersion(result: Entry) {
    currentEntry.current = result;
    current.current = result.content;
    stored.current = serialize(result.content);
    setEntry(result);
    setContent(result.content);
    setSaveState('saved');
    setError('');
    try {
      localStorage.removeItem(draftKey(result.id));
    } catch {}
    setNotice('Version restored as a draft. The public version has not changed.');
  }
  async function act(action: 'publish' | 'unpublish' | 'trash' | 'restore') {
    if (actionInFlight.current || recovery) return;
    if (
      action === 'trash' &&
      !window.confirm(
        t(
          'Move this content to trash? Its public version will be removed. You can restore it later.',
        ),
      )
    )
      return;
    if (
      action === 'unpublish' &&
      !window.confirm(
        t(
          'Unpublish this content? Readers will no longer be able to access it. Your draft will be kept.',
        ),
      )
    )
      return;
    actionInFlight.current = true;
    setActing(true);
    setNotice('');
    try {
      const saved = action === 'restore' ? currentEntry.current : await persist();
      if (!saved) return;
      if (action === 'publish' && (!review || review.version !== saved.version)) {
        setReview(null);
        throw new Error('The draft changed after review. Review it again before publishing');
      }
      const result = await api<Entry>(
        `/api/admin/entries/${saved.id}/action`,
        json('POST', { action, version: saved.version }),
      );
      currentEntry.current = result;
      setEntry(result);
      if (action === 'publish') setReview(null);
      setNotice(
        {
          publish: 'Published. Readers can now see this version on your website.',
          unpublish: 'Unpublished. The content is kept as a private draft.',
          trash: 'Moved to trash. You can restore it at any time.',
          restore: 'Restored as a draft. Review the content before publishing again.',
        }[action],
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  async function saveCopy() {
    if (!current.current || actionInFlight.current) return;
    actionInFlight.current = true;
    setActing(true);
    try {
      const fresh = await api<Entry>(
        '/api/admin/entries',
        json('POST', {
          kind,
          title: `${current.current.title.slice(0, 183)} ${t('(recovered copy)')}`,
        }),
      );
      const copy = {
        ...current.current,
        title: `${current.current.title.slice(0, 183)} ${t('(recovered copy)')}`,
        slug: fresh.content.slug,
      };
      const result = await api<Entry>(
        `/api/admin/entries/${fresh.id}`,
        json('PATCH', { version: fresh.version, content: copy }),
      );
      stored.current = serialize(current.current);
      window.location.href = editorUrl(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }
  function downloadDraft() {
    if (!current.current) return;
    const blob = new Blob([current.current.body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.current.slug || 'unsaved-draft'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function insert(before: string, after = '', placeholder = t('text')) {
    const view = editor.current;
    if (view) {
      const range = view.state.selection.main;
      const selected = view.state.sliceDoc(range.from, range.to) || placeholder;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: before + selected + after },
        selection: {
          anchor: range.from + before.length,
          head: range.from + before.length + selected.length,
        },
      });
      view.focus();
    } else update('body', (current.current?.body || '') + '\n' + before + placeholder + after);
  }
  function selectImage(media: Media) {
    if (picker === 'cover') {
      if (!current.current || recovery) return;
      const next = {
        ...current.current,
        cover: media.url,
        coverAlt: media.alt,
        coverPosition: { x: 50, y: 50 },
      };
      current.current = next;
      setContent(next);
      remember(next);
      setSaveState('pending');
    } else insert('![', `](${media.url})`, media.alt || t('Image description'));
  }
  const labels = {
    saved: 'All changes saved',
    pending: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Save failed. Keep this tab open.',
  };
  if (!entry || !content)
    return (
      <>
        <Alert message={error} />
        {!error ? (
          <div className="admin-loading">{t('Loading editor…')}</div>
        ) : (
          <a
            className="admin-button"
            href={`/admin/${kind === 'article' ? 'articles' : 'projects'}`}
          >
            <ArrowLeft size={16} /> {t('Back to list')}
          </a>
        )}
      </>
    );
  const bodyClearPending = needsBodyClearConfirmation(entry.content.body, content.body);
  const bodyRecoveryAvailable =
    !entry.deletedAt &&
    !entry.content.body.trim() &&
    !content.body.trim() &&
    !!entry.published?.body.trim();
  const publicUrl = `/${kind === 'article' ? 'articles' : 'projects'}/${encodeURIComponent(entry.published?.slug || content.slug)}`;
  const fieldLimits: Partial<Record<keyof EntryContent, number>> = {
    slug: 160,
    excerpt: 1000,
    coverAlt: 300,
    seoTitle: 200,
    seoDescription: 500,
    demoUrl: 2048,
    repoUrl: 2048,
    series: 100,
  };
  const formField = (
    key: keyof EntryContent,
    label: string,
    options: { multiline?: boolean; help?: string; type?: string } = {},
  ) => (
    <label className="admin-field">
      {t(label)}
      {options.multiline ? (
        <textarea
          aria-label={t(label)}
          maxLength={fieldLimits[key]}
          disabled={editorLocked || !!entry.deletedAt || !!recovery}
          rows={3}
          value={String(content[key] || '')}
          onChange={(e) => update(key, e.target.value as never)}
        />
      ) : (
        <input
          aria-label={t(label)}
          maxLength={fieldLimits[key]}
          disabled={editorLocked || !!entry.deletedAt || !!recovery}
          type={options.type || 'text'}
          value={String(content[key] || '')}
          onChange={(e) => update(key, e.target.value as never)}
        />
      )}
      {options.help && <small>{t(options.help)}</small>}
    </label>
  );
  return (
    <>
      <div className="admin-editor-heading">
        <div>
          <a className="admin-back" href={`/admin/${kind === 'article' ? 'articles' : 'projects'}`}>
            <ArrowLeft size={15} />{' '}
            {t(kind === 'article' ? 'Back to articles' : 'Back to projects')}
          </a>
          <h1>
            {t(kind === 'article' ? 'Article editor' : 'Project editor')}{' '}
            <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
              {t(entry.deletedAt ? 'Trash' : entry.published ? 'Published' : 'Draft')}
            </span>
          </h1>
        </div>
        <div className="admin-editor-actions">
          <span className={`admin-save-state ${saveState}`} role="status">
            {saveState === 'saving' ? (
              <LoaderCircle className="admin-spin" size={14} />
            ) : saveState === 'saved' ? (
              <Check size={14} />
            ) : (
              <span className="admin-status-dot" />
            )}
            {t(
              recovery
                ? 'Recovery decision required'
                : bodyRecoveryAvailable && saveState === 'saved'
                  ? 'Saved draft body is empty'
                  : labels[saveState],
            )}
          </span>
          {entry.deletedAt ? (
            <button
              className="admin-button primary"
              disabled={editorLocked || !!recovery}
              onClick={() => act('restore')}
            >
              <RefreshCw size={16} /> {t('Restore content')}
            </button>
          ) : (
            <>
              <button
                className="admin-button"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => void saveDraft()}
                title={t('Save draft (Ctrl/Cmd+S)')}
                aria-keyshortcuts="Control+s Meta+s"
              >
                <Save size={16} /> {t('Save draft')}
              </button>
              <button
                ref={publishButton}
                className="admin-button primary"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => void prepareReview()}
              >
                <Send size={16} />
                {t(acting ? 'Working…' : entry.published ? 'Publish changes' : 'Publish content')}
              </button>
            </>
          )}
        </div>
      </div>
      <Alert message={error} />
      <Alert message={notice} success />
      {bodyClearPending && !recovery && !entry.deletedAt && (
        <div className="admin-recovery" role="alert">
          <p>{t(bodyClearConfirmationMessage)}</p>
          <button
            className="admin-button small"
            type="button"
            disabled={editorLocked || conflict}
            onClick={() => {
              update('body', entry.content.body);
              if (error === bodyClearConfirmationMessage) setError('');
            }}
          >
            {t('Keep saved body')}
          </button>
        </div>
      )}
      {bodyRecoveryAvailable && !recovery && (
        <div className="admin-recovery" role="status">
          <div>
            <strong>{t('Saved draft body is empty')}</strong>
            <p>
              {t(
                'The published version still has a body. Restore only that body while keeping your current title, slug, tags and other draft settings. This does not publish changes.',
              )}
            </p>
          </div>
          <button
            className="admin-button primary small"
            type="button"
            disabled={editorLocked || conflict}
            onClick={() => void restoreBody()}
          >
            <RefreshCw size={15} /> {t('Restore published body')}
          </button>
        </div>
      )}
      {backupUnavailable && (
        <div className="admin-alert admin-storage-warning" role="status">
          {t(
            'Local draft backup is unavailable. Keep this tab open until your changes are saved to the server.',
          )}
        </div>
      )}
      {recovery && (
        <div className="admin-recovery">
          <div>
            <strong>{t('An unsaved local draft was found')}</strong>
            <p>
              {t('Last edited {date}. Restore it to continue where you left off.', {
                date: dateLabel(recovery.at, language),
              })}
            </p>
          </div>
          <button
            className="admin-button primary small"
            onClick={() => {
              current.current = recovery.content;
              setContent(recovery.content);
              setRecovery(null);
              setSaveState('pending');
            }}
          >
            {t('Restore local draft')}
          </button>
          <button
            className="admin-button small"
            onClick={() => {
              try {
                localStorage.removeItem(draftKey(entry.id));
              } catch {}
              setRecovery(null);
            }}
          >
            {t('Use server version')}
          </button>
        </div>
      )}
      {conflict && (
        <div className="admin-recovery">
          <div>
            <strong>{t('This content was changed in another tab')}</strong>
            <p>
              {t(
                'Your edits are still in this tab. Save a new draft, or download the Markdown before reloading.',
              )}
            </p>
          </div>
          <button className="admin-button primary small" disabled={acting} onClick={saveCopy}>
            {t('Save as new draft')}
          </button>
          <button className="admin-button small" onClick={downloadDraft}>
            <Download size={15} /> {t('Download Markdown')}
          </button>
          <button className="admin-button small" onClick={() => window.location.reload()}>
            {t('Reload')}
          </button>
        </div>
      )}
      {entry.published && !entry.deletedAt && (
        <div className="admin-editor-info">
          <span className="admin-status-dot" />
          <span>
            {t('Edits are saved privately. Choose Publish changes to update the public version.')}
          </span>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            {t('View published version')} <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      <div className="admin-editor-grid">
        <section className="admin-panel admin-writing-panel">
          <div className="admin-title-input">
            <label htmlFor="entry-title">
              {t(kind === 'article' ? 'Article title' : 'Project title')}
            </label>
            <input
              id="entry-title"
              placeholder={t('Give this a clear, descriptive title…')}
              value={content.title}
              disabled={editorLocked || !!entry.deletedAt || !!recovery}
              onChange={(e) => update('title', e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="admin-editor-toolbar">
            <div className="admin-format-tools" hidden={pane === 'preview'}>
              {[
                { label: 'Bold', icon: Bold, before: '**', after: '**' },
                { label: 'Italic', icon: Italic, before: '*', after: '*' },
                { label: 'Heading 2', icon: Heading2, before: '\n## ', after: '' },
                { label: 'List', icon: List, before: '\n- ', after: '' },
                { label: 'Inline code', icon: Code2, before: '`', after: '`' },
                { label: 'Link', icon: Link, before: '[', after: '](https://example.com)' },
              ].map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  className="admin-icon-button"
                  title={t(tool.label)}
                  aria-label={t(tool.label)}
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onClick={() => insert(tool.before, tool.after)}
                >
                  <tool.icon size={17} />
                </button>
              ))}
              <button
                type="button"
                className="admin-icon-button"
                title={t('Insert flowchart')}
                aria-label={t('Insert flowchart')}
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
                onClick={() =>
                  insert(
                    language === 'zh-TW'
                      ? '\n```mermaid\nflowchart TD\n  A[工單下達] --> B{前置條件通過}\n  B -->|是| C[開始作業]\n  B -->|否| D[保留原因並等待處理]\n'
                      : '\n```mermaid\nflowchart TD\n  A[Work order released] --> B{Prerequisites met}\n  B -->|Yes| C[Start operation]\n  B -->|No| D[Record reason and wait for resolution]\n',
                    '\n```\n',
                  )
                }
              >
                <GitBranch size={17} />
              </button>
              <button
                className="admin-icon-button"
                title={t('Insert image')}
                aria-label={t('Insert image')}
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
                onClick={() => setPicker('body')}
              >
                <Image size={17} />
              </button>
            </div>
            <div className="admin-editor-pane-tabs" role="group" aria-label={t('Editor view')}>
              <button
                type="button"
                aria-pressed={pane === 'edit'}
                className={pane === 'edit' ? 'active' : ''}
                onClick={() => setPane('edit')}
              >
                <Code2 size={14} /> {t('Write')}
              </button>
              <button
                type="button"
                aria-pressed={pane === 'preview'}
                className={pane === 'preview' ? 'active' : ''}
                onClick={() => setPane('preview')}
              >
                <Eye size={14} /> {t('Preview')}
              </button>
              <button
                type="button"
                aria-pressed={pane === 'split'}
                className={pane === 'split' ? 'active' : ''}
                onClick={() => setPane('split')}
              >
                {t('Split view')}
              </button>
            </div>
          </div>
          <div className={`admin-editor-panes show-${pane}`}>
            <div className="admin-markdown-input">
              <div className="admin-pane-label">
                MARKDOWN <span>{t('Autosaves after changes')}</span>
              </div>
              <CodeMirror
                value={content.body}
                extensions={bodyExtensions}
                theme={dark ? 'dark' : 'light'}
                minHeight="480px"
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                editable={!editorLocked && !entry.deletedAt && !recovery}
                onCreateEditor={(view) => {
                  editor.current = view;
                }}
                onChange={(value) => update('body', value)}
                aria-label={t('Markdown content')}
              />
            </div>
            <div
              className="admin-markdown-preview"
              role="region"
              aria-label={t('Content preview')}
              aria-busy={previewPending}
            >
              <div className="admin-pane-label">
                {t(previewPending ? 'Updating preview…' : 'Live preview')}{' '}
                <span>
                  <Eye size={13} /> {t('Only you can see this')}
                </span>
              </div>
              <Alert message={previewError} />
              {!content.body ? (
                <div className="admin-preview-placeholder">
                  <Code2 size={31} strokeWidth={1.2} />
                  <p>
                    {t('Start writing in Markdown.')}
                    <br />
                    {t('Your preview will appear here.')}
                  </p>
                </div>
              ) : (
                <div
                  className="prose admin-prose"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
          </div>
          <div className="admin-editor-bottom">
            <span>
              {t('{count} characters', {
                count: Array.from(content.body).length.toLocaleString(language),
              })}
            </span>
            <span>
              {content.body.trim()
                ? t('About {count} min read', { count: preview.readingMinutes || 1 })
                : t('Start writing to estimate reading time')}
            </span>
            <span>Markdown</span>
          </div>
        </section>
        <aside className="admin-editor-meta">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>{t('Publication')}</h2>
              <span className="admin-badge">v{entry.version}</span>
            </div>
            <div className="admin-form-body">
              {formField('slug', 'Slug', { help: 'Used in the public URL. Must be unique.' })}
              <label className="admin-field">
                {t('Category')}
                <select
                  value={content.category}
                  aria-label={t('Category')}
                  aria-describedby={entry.kind === 'project' ? 'project-lab-help' : undefined}
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onChange={(e) => update('category', e.target.value)}
                >
                  <option value="">{t('Uncategorized')}</option>
                  {entry.kind === 'project' &&
                    !taxonomy.categories.some((category) => category.name === LAB_CATEGORY) && (
                      <option value={LAB_CATEGORY}>{LAB_CATEGORY}</option>
                    )}
                  {taxonomy.categories.map((category) => (
                    <option value={category.name} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {entry.kind === 'project' && (
                  <small id="project-lab-help">
                    {t('Choose LAB to also show this project on the LAB page after publication.')}
                  </small>
                )}
              </label>
              <fieldset
                className="admin-tag-options"
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
              >
                <legend>{t('Tag')}</legend>
                {taxonomy.tags.length ? (
                  taxonomy.tags.map((tag) => (
                    <label key={tag.id}>
                      <input
                        type="checkbox"
                        checked={content.tags.includes(tag.name)}
                        onChange={(e) =>
                          update(
                            'tags',
                            e.target.checked
                              ? [...content.tags, tag.name]
                              : content.tags.filter((value) => value !== tag.name),
                          )
                        }
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))
                ) : (
                  <a href="/admin/taxonomies" target="_blank" rel="noopener noreferrer">
                    {t('Add tag')} <ArrowUpRight size={12} />
                  </a>
                )}
              </fieldset>
              <label className="admin-toggle-row">
                <span>
                  <strong>{t('Featured content')}</strong>
                  <small>{t('Eligible for featured sections on the homepage.')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={content.featured}
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onChange={(e) => update('featured', e.target.checked)}
                />
              </label>
              {kind === 'article' && (
                <details className="admin-series-fields">
                  <summary>{t('Article series')}</summary>
                  <div className="admin-form-body">
                    {formField('series', 'Series name', {
                      help: 'Use the same name for related articles',
                    })}
                    <label className="admin-field">
                      {t('Position in series')}
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={content.seriesOrder ?? 0}
                        disabled={editorLocked || !!entry.deletedAt || !!recovery}
                        onChange={(event) =>
                          update(
                            'seriesOrder',
                            Math.min(
                              100000,
                              Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </details>
              )}
              <EntryHistory
                disabled={editorLocked || conflict || !!recovery || !!entry.deletedAt}
                prepare={prepareHistory}
                onRestored={restoreVersion}
                onOpenChange={setHistoryOpen}
              />
            </div>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>{t('Cover & summary')}</h2>
            </div>
            <div className="admin-form-body">
              <button
                className="admin-cover-picker"
                aria-label={t(content.cover ? 'Change cover image' : 'Choose cover image')}
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
                onClick={() => setPicker('cover')}
              >
                {content.cover ? (
                  <img
                    src={content.cover}
                    alt={content.coverAlt || t('Content cover')}
                    style={{
                      objectPosition: `${content.coverPosition?.x ?? 50}% ${content.coverPosition?.y ?? 50}%`,
                    }}
                  />
                ) : (
                  <>
                    <Image size={28} />
                    <span>{t('Choose cover image')}</span>
                    <small>{t('Recommended: landscape, 16:9')}</small>
                  </>
                )}
              </button>
              {content.cover && (
                <button
                  className="admin-button small"
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onClick={() => update('cover', '')}
                >
                  {t('Remove cover')}
                </button>
              )}
              {formField('coverAlt', 'Cover alt text')}
              {content.cover && (
                <details className="admin-cover-focus">
                  <summary>{t('Cover crop focus')}</summary>
                  {(['x', 'y'] as const).map((axis) => (
                    <label className="admin-field" key={axis}>
                      {t(axis === 'x' ? 'Horizontal focus' : 'Vertical focus')} (
                      {content.coverPosition?.[axis] ?? 50}%)
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={content.coverPosition?.[axis] ?? 50}
                        disabled={editorLocked || !!entry.deletedAt || !!recovery}
                        onChange={(event) =>
                          update('coverPosition', {
                            x: content.coverPosition?.x ?? 50,
                            y: content.coverPosition?.y ?? 50,
                            [axis]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="admin-button small"
                    disabled={editorLocked || !!entry.deletedAt || !!recovery}
                    onClick={() => update('coverPosition', { x: 50, y: 50 })}
                  >
                    {t('Center focus')}
                  </button>
                </details>
              )}
              {formField('excerpt', 'Summary', {
                multiline: true,
                help: 'A short introduction for content cards and search results.',
              })}
            </div>
          </section>
          {kind === 'project' && (
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <h2>{t('Project links')}</h2>
              </div>
              <div className="admin-form-body">
                {formField('demoUrl', 'Demo URL', { type: 'url' })}
                {formField('repoUrl', 'Source code URL', { type: 'url' })}
              </div>
            </section>
          )}
          <details className="admin-panel admin-seo">
            <summary>
              {t('Search engine settings')} <Plus size={15} />
            </summary>
            <div className="admin-form-body">
              {formField('seoTitle', 'SEO title', {
                help: 'Leave blank to use the content title.',
              })}
              {formField('seoDescription', 'SEO description', {
                multiline: true,
                help: 'Leave blank to use the summary.',
              })}
            </div>
          </details>
          <div className="admin-editor-danger">
            {entry.published && !entry.deletedAt && (
              <button
                className="admin-button"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => act('unpublish')}
              >
                <PanelLeftClose size={15} /> {t('Unpublish content')}
              </button>
            )}
            {!entry.deletedAt && (
              <button
                className="admin-button danger"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => act('trash')}
              >
                <Trash2 size={15} /> {t('Move to trash')}
              </button>
            )}
          </div>
        </aside>
      </div>
      <MediaPicker
        open={picker !== null}
        onOpenChange={(value) => !value && setPicker(null)}
        onSelect={selectImage}
      />
      <PublishReview
        review={review}
        busy={acting}
        error={error}
        onClose={() => setReview(null)}
        onPublish={() => void act('publish')}
        returnFocus={() => publishButton.current?.focus()}
      />
    </>
  );
}
