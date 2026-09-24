import { useEffect, useRef, useState } from 'react';
import { readRecovery, type DraftRecovery } from './draft-recovery';
import EntryHistory from './EntryHistory';
import PublishReview from './PublishReview';
import type { ContentReview } from '../../lib/content-review';
import './editor-extensions.css';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  Code2,
  Download,
  Eye,
  Heading2,
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

const bodyExtensions = [markdown(), EditorView.lineWrapping];
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
  const draftKey = (entryId: string) => `kaiyo-draft-${entryId}`;
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
  async function persist(): Promise<Entry | null> {
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
          setSaveState('saving');
          const result = await api<Entry>(
            `/api/admin/entries/${currentEntry.current.id}`,
            json('PATCH', { version: currentEntry.current.version, content: snapshot }),
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
        if (!acting && !conflict && !recovery && !currentEntry.current?.deletedAt) void persist();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [acting, conflict, recovery]);
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
        'Move this content to trash? Its public version will be removed. You can restore it later.',
      )
    )
      return;
    if (
      action === 'unpublish' &&
      !window.confirm(
        'Unpublish this content? Readers will no longer be able to access it. Your draft will be kept.',
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
        json('POST', { kind, title: `${current.current.title.slice(0, 183)} (recovered copy)` }),
      );
      const copy = {
        ...current.current,
        title: `${current.current.title.slice(0, 183)} (recovered copy)`,
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
  function insert(before: string, after = '', placeholder = 'text') {
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
    } else insert('![', `](${media.url})`, media.alt || 'Image description');
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
          <div className="admin-loading">Loading editor…</div>
        ) : (
          <a
            className="admin-button"
            href={`/admin/${kind === 'article' ? 'articles' : 'projects'}`}
          >
            <ArrowLeft size={16} /> Back to list
          </a>
        )}
      </>
    );
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
      {label}
      {options.multiline ? (
        <textarea
          aria-label={label}
          maxLength={fieldLimits[key]}
          disabled={editorLocked || !!entry.deletedAt || !!recovery}
          rows={3}
          value={String(content[key] || '')}
          onChange={(e) => update(key, e.target.value as never)}
        />
      ) : (
        <input
          aria-label={label}
          maxLength={fieldLimits[key]}
          disabled={editorLocked || !!entry.deletedAt || !!recovery}
          type={options.type || 'text'}
          value={String(content[key] || '')}
          onChange={(e) => update(key, e.target.value as never)}
        />
      )}
      {options.help && <small>{options.help}</small>}
    </label>
  );
  return (
    <>
      <div className="admin-editor-heading">
        <div>
          <a className="admin-back" href={`/admin/${kind === 'article' ? 'articles' : 'projects'}`}>
            <ArrowLeft size={15} /> Back to {kind === 'article' ? 'articles' : 'projects'}
          </a>
          <h1>
            {kind === 'article' ? 'Article' : 'Project'} editor{' '}
            <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
              {entry.deletedAt ? 'Trash' : entry.published ? 'Published' : 'Draft'}
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
            {recovery ? 'Recovery decision required' : labels[saveState]}
          </span>
          {entry.deletedAt ? (
            <button
              className="admin-button primary"
              disabled={editorLocked || !!recovery}
              onClick={() => act('restore')}
            >
              <RefreshCw size={16} /> Restore content
            </button>
          ) : (
            <>
              <button
                className="admin-button"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => void persist()}
                title="Save draft (Ctrl/Cmd+S)"
                aria-keyshortcuts="Control+s Meta+s"
              >
                <Save size={16} /> Save draft
              </button>
              <button
                ref={publishButton}
                className="admin-button primary"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => void prepareReview()}
              >
                <Send size={16} />
                {acting ? 'Working…' : entry.published ? 'Publish changes' : 'Publish content'}
              </button>
            </>
          )}
        </div>
      </div>
      <Alert message={error} />
      <Alert message={notice} success />
      {backupUnavailable && (
        <div className="admin-alert admin-storage-warning" role="status">
          Local draft backup is unavailable. Keep this tab open until your changes are saved to the
          server.
        </div>
      )}
      {recovery && (
        <div className="admin-recovery">
          <div>
            <strong>An unsaved local draft was found</strong>
            <p>Last edited {dateLabel(recovery.at)}. Restore it to continue where you left off.</p>
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
            Restore local draft
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
            Use server version
          </button>
        </div>
      )}
      {conflict && (
        <div className="admin-recovery">
          <div>
            <strong>This content was changed in another tab</strong>
            <p>
              Your edits are still in this tab. Save a new draft, or download the Markdown before
              reloading.
            </p>
          </div>
          <button className="admin-button primary small" disabled={acting} onClick={saveCopy}>
            Save as new draft
          </button>
          <button className="admin-button small" onClick={downloadDraft}>
            <Download size={15} /> Download Markdown
          </button>
          <button className="admin-button small" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
      {entry.published && !entry.deletedAt && (
        <div className="admin-editor-info">
          <span className="admin-status-dot" />
          <span>
            Edits are saved privately. Choose Publish changes to update the public version.
          </span>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            View published version <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      <div className="admin-editor-grid">
        <section className="admin-panel admin-writing-panel">
          <div className="admin-title-input">
            <label htmlFor="entry-title">{kind === 'article' ? 'Article' : 'Project'} title</label>
            <input
              id="entry-title"
              placeholder="Give this a clear, descriptive title…"
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
                  title={tool.label}
                  aria-label={tool.label}
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onClick={() => insert(tool.before, tool.after)}
                >
                  <tool.icon size={17} />
                </button>
              ))}
              <button
                className="admin-icon-button"
                title="Insert image"
                aria-label="Insert image"
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
                onClick={() => setPicker('body')}
              >
                <Image size={17} />
              </button>
            </div>
            <div className="admin-editor-pane-tabs" role="group" aria-label="Editor view">
              <button
                type="button"
                aria-pressed={pane === 'edit'}
                className={pane === 'edit' ? 'active' : ''}
                onClick={() => setPane('edit')}
              >
                <Code2 size={14} /> Write
              </button>
              <button
                type="button"
                aria-pressed={pane === 'preview'}
                className={pane === 'preview' ? 'active' : ''}
                onClick={() => setPane('preview')}
              >
                <Eye size={14} /> Preview
              </button>
              <button
                type="button"
                aria-pressed={pane === 'split'}
                className={pane === 'split' ? 'active' : ''}
                onClick={() => setPane('split')}
              >
                Split view
              </button>
            </div>
          </div>
          <div className={`admin-editor-panes show-${pane}`}>
            <div className="admin-markdown-input">
              <div className="admin-pane-label">
                MARKDOWN <span>Autosaves after changes</span>
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
                aria-label="Markdown content"
              />
            </div>
            <div
              className="admin-markdown-preview"
              role="region"
              aria-label="Content preview"
              aria-busy={previewPending}
            >
              <div className="admin-pane-label">
                {previewPending ? 'Updating preview…' : 'Live preview'}{' '}
                <span>
                  <Eye size={13} /> Only you can see this
                </span>
              </div>
              <Alert message={previewError} />
              {!content.body ? (
                <div className="admin-preview-placeholder">
                  <Code2 size={31} strokeWidth={1.2} />
                  <p>
                    Start writing in Markdown.
                    <br />
                    Your preview will appear here.
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
            <span>{Array.from(content.body).length.toLocaleString('en-US')} characters</span>
            <span>
              {content.body.trim()
                ? `About ${preview.readingMinutes || 1} min read`
                : 'Start writing to estimate reading time'}
            </span>
            <span>Markdown</span>
          </div>
        </section>
        <aside className="admin-editor-meta">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Publication</h2>
              <span className="admin-badge">v{entry.version}</span>
            </div>
            <div className="admin-form-body">
              {formField('slug', 'Slug', { help: 'Used in the public URL. Must be unique.' })}
              <label className="admin-field">
                Category
                <select
                  value={content.category}
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onChange={(e) => update('category', e.target.value)}
                >
                  <option value="">Uncategorized</option>
                  {taxonomy.categories.map((category) => (
                    <option value={category.name} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset
                className="admin-tag-options"
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
              >
                <legend>Tag</legend>
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
                    Add tag <ArrowUpRight size={12} />
                  </a>
                )}
              </fieldset>
              <label className="admin-toggle-row">
                <span>
                  <strong>Featured content</strong>
                  <small>Eligible for featured sections on the homepage.</small>
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
                  <summary>Article series</summary>
                  <div className="admin-form-body">
                    {formField('series', 'Series name', {
                      help: 'Use the same name for related articles',
                    })}
                    <label className="admin-field">
                      Position in series
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
              <h2>Cover & summary</h2>
            </div>
            <div className="admin-form-body">
              <button
                className="admin-cover-picker"
                aria-label={content.cover ? 'Change cover image' : 'Choose cover image'}
                disabled={editorLocked || !!entry.deletedAt || !!recovery}
                onClick={() => setPicker('cover')}
              >
                {content.cover ? (
                  <img
                    src={content.cover}
                    alt={content.coverAlt || 'Content cover'}
                    style={{
                      objectPosition: `${content.coverPosition?.x ?? 50}% ${content.coverPosition?.y ?? 50}%`,
                    }}
                  />
                ) : (
                  <>
                    <Image size={28} />
                    <span>Choose cover image</span>
                    <small>Recommended: landscape, 16:9</small>
                  </>
                )}
              </button>
              {content.cover && (
                <button
                  className="admin-button small"
                  disabled={editorLocked || !!entry.deletedAt || !!recovery}
                  onClick={() => update('cover', '')}
                >
                  Remove cover
                </button>
              )}
              {formField('coverAlt', 'Cover alt text')}
              {content.cover && (
                <details className="admin-cover-focus">
                  <summary>Cover crop focus</summary>
                  {(['x', 'y'] as const).map((axis) => (
                    <label className="admin-field" key={axis}>
                      {axis === 'x' ? 'Horizontal focus' : 'Vertical focus'} (
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
                    Center focus
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
                <h2>Project links</h2>
              </div>
              <div className="admin-form-body">
                {formField('demoUrl', 'Demo URL', { type: 'url' })}
                {formField('repoUrl', 'Source code URL', { type: 'url' })}
              </div>
            </section>
          )}
          <details className="admin-panel admin-seo">
            <summary>
              Search engine settings <Plus size={15} />
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
                <PanelLeftClose size={15} /> Unpublish content
              </button>
            )}
            {!entry.deletedAt && (
              <button
                className="admin-button danger"
                disabled={editorLocked || conflict || !!recovery}
                onClick={() => act('trash')}
              >
                <Trash2 size={15} /> Move to trash
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
