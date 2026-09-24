import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { History, X } from 'lucide-react';
import { api, dateLabel, errorMessage, json, type Entry, type EntryContent } from './api';
import { contentDiff } from '../../lib/content-diff';
import ContentDifference from './ContentDifference';

interface Revision {
  id: string;
  entryId: string;
  content: EntryContent;
  source: 'draft' | 'published' | 'restore';
  createdAt: string;
  version: number;
}
interface HistoryPage {
  items: Revision[];
  nextCursor?: string | null;
}

export default function EntryHistory({
  disabled,
  prepare,
  onRestored,
  onOpenChange,
}: {
  disabled: boolean;
  prepare: () => Promise<Entry | null>;
  onRestored: (entry: Entry) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [items, setItems] = useState<Revision[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = items.find((item) => item.id === selectedId);
  const diff = useMemo(
    () => (selected && entry ? contentDiff(entry.content, selected.content) : null),
    [selected, entry],
  );
  const changeOpen = (value: boolean) => {
    if (busy) return;
    setOpen(value);
    onOpenChange(value);
  };
  async function load(saved: Entry, before?: string) {
    const page = await api<HistoryPage>(
      `/api/admin/history/${saved.id}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    );
    setItems((old) => (before ? [...old, ...page.items] : page.items));
    setCursor(page.nextCursor || null);
    if (!before) setSelectedId(page.items[0]?.id || '');
  }
  async function show() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await prepare();
      if (!saved) return;
      setEntry(saved);
      setItems([]);
      setOpen(true);
      onOpenChange(true);
      await load(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!entry || !selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const restored = await api<Entry>(
        `/api/admin/history/${entry.id}`,
        json('POST', { revisionId: selected.id, version: entry.version }),
      );
      onRestored(restored);
      setOpen(false);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="admin-button"
        disabled={disabled || busy}
        onClick={() => void show()}
      >
        <History size={16} /> {busy && !open ? 'Saving draft…' : 'Version history'}
      </button>
      {!open && error && <p role="alert">{error}</p>}
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="admin-dialog-overlay" />
          <Dialog.Content
            className="admin-dialog admin-app admin-history-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <div className="admin-dialog-heading">
              <div>
                <Dialog.Title>Version history</Dialog.Title>
                <Dialog.Description>
                  Your current edits are saved before opening history. Restoring changes the draft
                  only
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="admin-icon-button"
                disabled={busy}
                aria-label="Close version history"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <div className="admin-review-body">
              {error && (
                <div className="admin-alert" role="alert">
                  {error}
                </div>
              )}
              {busy && !items.length && <p role="status">Loading versions…</p>}
              {!busy && !items.length && !error && <p>No saved versions yet</p>}
              {items.length > 0 && (
                <>
                  <label className="admin-field">
                    Saved version
                    <select
                      value={selectedId}
                      disabled={busy}
                      onChange={(event) => setSelectedId(event.target.value)}
                    >
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          v{item.version} ·{' '}
                          {item.source === 'published'
                            ? 'Published'
                            : item.source === 'restore'
                              ? 'Before restore'
                              : 'Draft'}{' '}
                          · {dateLabel(item.createdAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {cursor && (
                    <button
                      className="admin-button small"
                      disabled={busy}
                      onClick={async () => {
                        if (!entry) return;
                        setBusy(true);
                        setError('');
                        try {
                          await load(entry, cursor);
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Load older versions
                    </button>
                  )}
                  <p className="admin-diff-note">Comparison: current draft → selected version</p>
                  {diff && <ContentDifference diff={diff} />}
                </>
              )}
              {error && !items.length && (
                <button
                  className="admin-button"
                  disabled={busy}
                  onClick={async () => {
                    if (!entry) return;
                    setBusy(true);
                    setError('');
                    try {
                      await load(entry);
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Retry
                </button>
              )}
            </div>
            <div className="admin-review-actions">
              <Dialog.Close className="admin-button" disabled={busy}>
                Cancel
              </Dialog.Close>
              <button
                className="admin-button primary"
                disabled={busy || !selected || !!error}
                onClick={() => void restore()}
              >
                {busy ? 'Working…' : 'Restore as draft'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
