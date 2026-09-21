import { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
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

const bodyExtensions = [markdown()];
const serialize = (value: EntryContent) => JSON.stringify(value);
type Recovery = { content: EntryContent; at: string; version: number };
export default function EntryEditor({ id, kind }: { id: string; kind: 'article' | 'project' }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [content, setContent] = useState<EntryContent | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState('');
  const [taxonomy, setTaxonomy] = useState<Taxonomies>({ categories: [], tags: [] });
  const [preview, setPreview] = useState<{ html: string; readingMinutes: number }>({
    html: '',
    readingMinutes: 0,
  });
  const [previewError, setPreviewError] = useState('');
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [picker, setPicker] = useState<'body' | 'cover' | null>(null);
  const [dark, setDark] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
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
          const local = JSON.parse(
            localStorage.getItem(draftKey(result.id)) || 'null',
          ) as Recovery | null;
          if (local?.content && serialize(local.content) !== stored.current) setRecovery(local);
        } catch {}
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
    } catch {
      /* 伺服器儲存仍可正常使用。 */
    }
  }
  function update<K extends keyof EntryContent>(key: K, value: EntryContent[K]) {
    if (!current.current) return;
    const next = { ...current.current, [key]: value };
    current.current = next;
    setContent(next);
    remember(next);
    setNotice('');
    if (!blocked.current) setSaveState('pending');
  }
  async function persist(): Promise<Entry | null> {
    if (saving.current) return saving.current;
    if (blocked.current) return null;
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
    const handler = (event: BeforeUnloadEvent) => {
      if (current.current && serialize(current.current) !== stored.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    if (!content) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ html: string; readingMinutes: number }>('/api/admin/preview', {
        ...json('POST', { body: content.body }),
        signal: controller.signal,
      })
        .then((result) => {
          setPreview(result);
          setPreviewError('');
        })
        .catch((e) => {
          if (!controller.signal.aborted) setPreviewError(errorMessage(e));
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [content?.body]);
  async function act(action: 'publish' | 'unpublish' | 'trash' | 'restore') {
    if (
      action === 'trash' &&
      !window.confirm('將這份內容移至垃圾桶？公開版本也會下架，之後可以還原。')
    )
      return;
    setActing(true);
    setNotice('');
    try {
      const saved = action === 'restore' ? currentEntry.current : await persist();
      if (!saved) return;
      const result = await api<Entry>(
        `/api/admin/entries/${saved.id}/action`,
        json('POST', { action, version: saved.version }),
      );
      currentEntry.current = result;
      setEntry(result);
      setNotice(
        {
          publish: '已發布，讀者現在可以在公開網站閱讀最新內容。',
          unpublish: '已下架，內容保留為私人草稿。',
          trash: '已移至垃圾桶，可以隨時還原。',
          restore: '已還原為草稿，確認內容後即可重新發布。',
        }[action],
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
    } finally {
      setActing(false);
    }
  }
  async function saveCopy() {
    if (!current.current) return;
    setActing(true);
    try {
      const fresh = await api<Entry>(
        '/api/admin/entries',
        json('POST', { kind, title: `${current.current.title.slice(0, 185)}（復原副本）` }),
      );
      const copy = {
        ...current.current,
        title: `${current.current.title.slice(0, 185)}（復原副本）`,
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
      setActing(false);
    }
  }
  function downloadDraft() {
    if (!current.current) return;
    const blob = new Blob([current.current.body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.current.slug || '未儲存草稿'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function insert(before: string, after = '', placeholder = '文字') {
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
      if (!current.current) return;
      const next = { ...current.current, cover: media.url, coverAlt: media.alt };
      current.current = next;
      setContent(next);
      remember(next);
      setSaveState('pending');
    } else insert('![', `](${media.url})`, media.alt || '圖片描述');
  }
  const labels = {
    saved: '所有變更已儲存',
    pending: '等待儲存…',
    saving: '正在儲存…',
    error: '儲存失敗，內容已保留',
  };
  if (!entry || !content)
    return (
      <>
        <Alert message={error} />
        {!error ? (
          <div className="admin-loading">正在開啟編輯工作室…</div>
        ) : (
          <a
            className="admin-button"
            href={`/admin/${kind === 'article' ? 'articles' : 'projects'}`}
          >
            <ArrowLeft size={16} /> 返回列表
          </a>
        )}
      </>
    );
  const publicUrl = `/${kind === 'article' ? 'articles' : 'projects'}/${entry.published?.slug || content.slug}`;
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
          disabled={acting || !!entry.deletedAt}
          rows={3}
          value={String(content[key] || '')}
          onChange={(e) => update(key, e.target.value as never)}
        />
      ) : (
        <input
          aria-label={label}
          disabled={acting || !!entry.deletedAt}
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
            <ArrowLeft size={15} /> 返回{kind === 'article' ? '文章' : '作品'}列表
          </a>
          <h1>
            {kind === 'article' ? '文章' : '作品'}編輯工作室{' '}
            <span className={`admin-badge ${entry.published ? 'published' : ''}`}>
              {entry.deletedAt ? '垃圾桶' : entry.published ? '已發布' : '草稿'}
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
            {labels[saveState]}
          </span>
          {entry.deletedAt ? (
            <button
              className="admin-button primary"
              disabled={acting}
              onClick={() => act('restore')}
            >
              <RefreshCw size={16} /> 還原內容
            </button>
          ) : (
            <>
              <button
                className="admin-button"
                disabled={acting || conflict}
                onClick={() => void persist()}
              >
                <Save size={16} /> 儲存草稿
              </button>
              <button
                className="admin-button primary"
                disabled={acting || conflict || !!recovery}
                onClick={() => act('publish')}
              >
                <Send size={16} />
                {acting ? '處理中…' : entry.published ? '發布更新' : '發布內容'}
              </button>
            </>
          )}
        </div>
      </div>
      <Alert message={error} />
      <Alert message={notice} success />
      {recovery && (
        <div className="admin-recovery">
          <div>
            <strong>發現尚未送出的本機草稿</strong>
            <p>上次編輯於 {dateLabel(recovery.at)}。恢復後會以這份內容繼續編輯。</p>
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
            恢復本機內容
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
            使用伺服器版本
          </button>
        </div>
      )}
      {conflict && (
        <div className="admin-recovery">
          <div>
            <strong>這份內容已在其他分頁修改</strong>
            <p>目前輸入已保留。你可以另存新草稿，或先下載內容再重新載入。</p>
          </div>
          <button className="admin-button primary small" disabled={acting} onClick={saveCopy}>
            另存新草稿
          </button>
          <button className="admin-button small" onClick={downloadDraft}>
            <Download size={15} /> 下載 Markdown
          </button>
          <button className="admin-button small" onClick={() => window.location.reload()}>
            重新載入
          </button>
        </div>
      )}
      {entry.published && !entry.deletedAt && (
        <div className="admin-editor-info">
          <span className="admin-status-dot" />
          <span>修改會先保留為私人草稿，按「發布更新」後才會公開。</span>
          <a href={publicUrl} target="_blank" rel="noreferrer">
            查看公開版本 <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      <div className="admin-editor-grid">
        <section className="admin-panel admin-writing-panel">
          <div className="admin-title-input">
            <label htmlFor="entry-title">{kind === 'article' ? '文章' : '作品'}標題</label>
            <input
              id="entry-title"
              placeholder="為這個想法，取個名字…"
              value={content.title}
              disabled={acting || !!entry.deletedAt}
              onChange={(e) => update('title', e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="admin-editor-toolbar">
            <div className="admin-format-tools">
              {[
                { label: '粗體', icon: Bold, before: '**', after: '**' },
                { label: '斜體', icon: Italic, before: '*', after: '*' },
                { label: '二級標題', icon: Heading2, before: '\n## ', after: '' },
                { label: '清單', icon: List, before: '\n- ', after: '' },
                { label: '程式碼', icon: Code2, before: '`', after: '`' },
                { label: '連結', icon: Link, before: '[', after: '](https://example.com)' },
              ].map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  className="admin-icon-button"
                  title={tool.label}
                  aria-label={tool.label}
                  disabled={acting || !!entry.deletedAt}
                  onClick={() => insert(tool.before, tool.after)}
                >
                  <tool.icon size={17} />
                </button>
              ))}
              <button
                className="admin-icon-button"
                title="插入圖片"
                aria-label="插入圖片"
                disabled={acting || !!entry.deletedAt}
                onClick={() => setPicker('body')}
              >
                <Image size={17} />
              </button>
            </div>
            <div className="admin-editor-pane-tabs">
              <button
                aria-pressed={pane === 'edit'}
                className={pane === 'edit' ? 'active' : ''}
                onClick={() => setPane('edit')}
              >
                <Code2 size={14} /> 編輯
              </button>
              <button
                aria-pressed={pane === 'preview'}
                className={pane === 'preview' ? 'active' : ''}
                onClick={() => setPane('preview')}
              >
                <Eye size={14} /> 預覽
              </button>
            </div>
          </div>
          <div className={`admin-editor-panes show-${pane}`}>
            <div className="admin-markdown-input">
              <div className="admin-pane-label">
                MARKDOWN <span>內容自動儲存</span>
              </div>
              <CodeMirror
                value={content.body}
                extensions={bodyExtensions}
                theme={dark ? 'dark' : 'light'}
                minHeight="480px"
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                editable={!acting && !entry.deletedAt}
                onCreateEditor={(view) => {
                  editor.current = view;
                }}
                onChange={(value) => update('body', value)}
                aria-label="Markdown 內容"
              />
            </div>
            <div className="admin-markdown-preview">
              <div className="admin-pane-label">
                即時預覽{' '}
                <span>
                  <Eye size={13} /> 僅自己可見
                </span>
              </div>
              <Alert message={previewError} />
              {!content.body ? (
                <div className="admin-preview-placeholder">
                  <Code2 size={31} strokeWidth={1.2} />
                  <p>
                    開始寫下第一行文字，
                    <br />
                    你的內容會在這裡展開。
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
            <span>{Array.from(content.body).length.toLocaleString('zh-TW')} 字元</span>
            <span>約 {preview.readingMinutes || 1} 分鐘閱讀</span>
            <span>Markdown</span>
          </div>
        </section>
        <aside className="admin-editor-meta">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>發布設定</h2>
              <span className="admin-badge">v{entry.version}</span>
            </div>
            <div className="admin-form-body">
              {formField('slug', '網址代稱', { help: '用於公開網址，需保持唯一。' })}
              <label className="admin-field">
                分類
                <select
                  value={content.category}
                  disabled={acting || !!entry.deletedAt}
                  onChange={(e) => update('category', e.target.value)}
                >
                  <option value="">未分類</option>
                  {taxonomy.categories.map((category) => (
                    <option value={category.name} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="admin-tag-options" disabled={acting || !!entry.deletedAt}>
                <legend>標籤</legend>
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
                  <a href="/admin/taxonomies" target="_blank" rel="noreferrer">
                    新增標籤 <ArrowUpRight size={12} />
                  </a>
                )}
              </fieldset>
              <label className="admin-toggle-row">
                <span>
                  <strong>設為精選</strong>
                  <small>優先展示在首頁與列表。</small>
                </span>
                <input
                  type="checkbox"
                  checked={content.featured}
                  disabled={acting || !!entry.deletedAt}
                  onChange={(e) => update('featured', e.target.checked)}
                />
              </label>
            </div>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>封面與摘要</h2>
            </div>
            <div className="admin-form-body">
              <button
                className="admin-cover-picker"
                disabled={acting || !!entry.deletedAt}
                onClick={() => setPicker('cover')}
              >
                {content.cover ? (
                  <img src={content.cover} alt={content.coverAlt || '內容封面'} />
                ) : (
                  <>
                    <Image size={28} />
                    <span>選擇封面圖片</span>
                    <small>建議橫向 16:9</small>
                  </>
                )}
              </button>
              {content.cover && (
                <button
                  className="admin-button small"
                  disabled={acting || !!entry.deletedAt}
                  onClick={() => update('cover', '')}
                >
                  移除封面
                </button>
              )}
              {formField('coverAlt', '封面替代文字')}
              {formField('excerpt', '內容摘要', {
                multiline: true,
                help: '顯示於文章卡片，讓讀者快速了解內容。',
              })}
            </div>
          </section>
          {kind === 'project' && (
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <h2>作品連結</h2>
              </div>
              <div className="admin-form-body">
                {formField('demoUrl', '展示網址', { type: 'url' })}
                {formField('repoUrl', '原始碼網址', { type: 'url' })}
              </div>
            </section>
          )}
          <details className="admin-panel admin-seo">
            <summary>
              搜尋引擎設定 <Plus size={15} />
            </summary>
            <div className="admin-form-body">
              {formField('seoTitle', 'SEO 標題', { help: '留空時使用內容標題。' })}
              {formField('seoDescription', 'SEO 描述', {
                multiline: true,
                help: '留空時使用內容摘要。',
              })}
            </div>
          </details>
          <div className="admin-editor-danger">
            {entry.published && !entry.deletedAt && (
              <button
                className="admin-button"
                disabled={acting || conflict}
                onClick={() => act('unpublish')}
              >
                <PanelLeftClose size={15} /> 下架內容
              </button>
            )}
            {!entry.deletedAt && (
              <button
                className="admin-button danger"
                disabled={acting || conflict}
                onClick={() => act('trash')}
              >
                <Trash2 size={15} /> 移至垃圾桶
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
    </>
  );
}
