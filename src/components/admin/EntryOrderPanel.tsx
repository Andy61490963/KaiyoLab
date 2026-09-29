import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { ArrowDown, ArrowUp, Check, GripVertical, LoaderCircle, RotateCw } from 'lucide-react';
import { pageNumbers } from '../../lib/listing';
import type {
  EntryOrderItem as OrderItem,
  EntryOrderSnapshot as OrderSnapshot,
} from '../../lib/types';
import { useAdminLanguage } from './AdminLanguage';
import { ApiError, api, errorMessage, json } from './api';
import '../../styles/admin-entry-order.css';

interface PendingMove {
  id: string;
  position: number;
}
interface DropTarget {
  id: string;
  position: number;
  edge?: 'before' | 'after';
}
interface OrderStatus {
  key: string;
  values?: Record<string, string | number>;
}

function PageButton({
  number,
  current,
  disabled,
  onPage,
}: {
  number: number;
  current: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useAdminLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: `order-page-${number}`,
    data: { type: 'page', page: number },
    disabled: disabled || number === current,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`admin-button small${isOver ? ' order-page-hover' : ''}`}
      aria-label={t('Page {number}', { number })}
      aria-current={number === current ? 'page' : undefined}
      title={t('Hold here to open page {page}', { page: number })}
      disabled={disabled}
      data-order-page={number}
      onClick={() => onPage(number)}
    >
      {number}
    </button>
  );
}

function PageDropZone({
  direction,
  position,
  page,
  disabled,
  dragging,
}: {
  direction: 'previous' | 'next';
  position: number;
  page: number;
  disabled: boolean;
  dragging: boolean;
}) {
  const { t } = useAdminLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: `order-${direction}-page`,
    data: { type: 'position', position },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`entry-order-page-drop${isOver ? ' is-over' : ''}${dragging ? ' is-dragging' : ''}`}
      data-order-drop={direction}
      data-order-drop-page={page}
    >
      {direction === 'previous' ? (
        <ArrowUp size={16} aria-hidden="true" />
      ) : (
        <ArrowDown size={16} aria-hidden="true" />
      )}
      <span>
        {t(
          direction === 'previous'
            ? 'Drop at the end of the previous page'
            : 'Drop at the start of the next page',
        )}
      </span>
    </div>
  );
}

function OrderRow({
  item,
  index,
  total,
  pageSize,
  blocked,
  dragging,
  target,
  editing,
  position,
  onEditing,
  onPosition,
  onMove,
  handleRef,
  instructionsId,
}: {
  item: OrderItem;
  index: number;
  total: number;
  pageSize: number;
  blocked: boolean;
  dragging: boolean;
  target: DropTarget | null;
  editing: boolean;
  position: string;
  onEditing: (open: boolean) => void;
  onPosition: (value: string) => void;
  onMove: (position: number) => void;
  handleRef: (node: HTMLButtonElement | null) => void;
  instructionsId: string;
}) {
  const { t } = useAdminLanguage();
  const inputId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { title: item.title },
    disabled: blocked,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `order-row-${item.id}`,
    data: { type: 'row', index },
    disabled: blocked,
  });
  const candidate = Number(position);
  const valid =
    /^\d+$/.test(position) &&
    Number.isSafeInteger(candidate) &&
    candidate >= 1 &&
    candidate <= total;
  const edge = target?.id === `order-row-${item.id}` ? target.edge : undefined;
  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      className={`entry-order-row${isDragging ? ' is-source' : ''}${edge ? ` drop-${edge}` : ''}`}
      data-order-id={item.id}
      data-order-position={index + 1}
      data-order-target={edge}
    >
      <div className="entry-order-row-main">
        <button
          type="button"
          className="admin-icon-button entry-order-handle"
          ref={(node) => {
            setActivatorNodeRef(node);
            handleRef(node);
          }}
          {...attributes}
          {...listeners}
          disabled={blocked}
          aria-label={t('Drag “{title}”', { title: item.title })}
          aria-describedby={instructionsId}
          data-order-handle={item.id}
        >
          <GripVertical size={20} aria-hidden="true" />
        </button>
        <span className="entry-order-number" aria-hidden="true">
          {index + 1}
        </span>
        <div className="entry-order-content">
          <strong translate="no">{item.title || t('Untitled')}</strong>
          <span className="entry-order-state">{t(item.published ? 'Published' : 'Draft')}</span>
        </div>
        <div className="entry-order-actions">
          <button
            type="button"
            className="admin-icon-button"
            disabled={blocked || dragging || index === 0}
            aria-label={t('Move up: “{title}”', { title: item.title })}
            onClick={() => onMove(index)}
          >
            <ArrowUp size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="admin-icon-button"
            disabled={blocked || dragging || index === total - 1}
            aria-label={t('Move down: “{title}”', { title: item.title })}
            onClick={() => onMove(index + 2)}
          >
            <ArrowDown size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="admin-button small"
            disabled={blocked || dragging}
            aria-label={t('Move to position: “{title}”', { title: item.title })}
            aria-expanded={editing}
            aria-controls={inputId}
            onClick={() => onEditing(!editing)}
          >
            {t('Move to…')}
          </button>
        </div>
      </div>
      {editing && (
        <form
          id={inputId}
          className="entry-order-move-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !blocked && !dragging) onMove(candidate);
          }}
        >
          <label>
            {t('Position')}
            <input
              type="number"
              min={1}
              max={total}
              step={1}
              inputMode="numeric"
              value={position}
              autoFocus
              aria-label={t('Position for “{title}”', { title: item.title })}
              disabled={blocked || dragging}
              onChange={(event) => onPosition(event.target.value)}
              aria-describedby={`${inputId}-help`}
            />
          </label>
          <span id={`${inputId}-help`} className="entry-order-position-hint">
            {valid
              ? t('Target: page {page}, position {position}', {
                  page: Math.ceil(candidate / pageSize),
                  position: candidate,
                })
              : t('Enter a whole number from 1 to {total}', { total })}
          </span>
          <button
            className="admin-button primary"
            type="submit"
            disabled={blocked || dragging || !valid || candidate === index + 1}
          >
            {t('Move')}
          </button>
          <button
            className="admin-button"
            type="button"
            disabled={blocked || dragging}
            onClick={() => onEditing(false)}
          >
            {t('Cancel')}
          </button>
        </form>
      )}
      {edge && (
        <span className={`entry-order-insertion-label ${edge}`} aria-hidden="true">
          {t('Drop here: position {position}', { position: target!.position })}
        </span>
      )}
    </li>
  );
}

export default function EntryOrderPanel({
  kind,
  initialPageSize = 20,
  onClose,
  onChanged,
}: {
  kind: 'article' | 'project';
  initialPageSize?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useAdminLanguage();
  const instructionsId = useId();
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [status, setStatus] = useState<OrderStatus>({ key: 'Loading order…' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    [10, 20, 50].includes(initialPageSize) ? initialPageSize : 20,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [position, setPosition] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const dragOriginPage = useRef(1);
  const hoverPage = useRef<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const items = snapshot?.items || [];
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const visibleItems = items.slice(start, start + pageSize);
  const activeItem = items.find((item) => item.id === activeId);
  const blocked = loading || saving || Boolean(error);
  const collisionDetection: CollisionDetection = (args) => {
    // 使用視窗中的實際指標座標，避免清單自動捲動後把捲動位移重複加到落點
    dragPointer.current = args.pointerCoordinates;
    return pointerWithin(args);
  };

  function clearHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    hoverPage.current = null;
  }

  async function load() {
    const request = ++requestId.current;
    setLoading(true);
    setStatus({ key: 'Loading order…' });
    try {
      const result = await api<OrderSnapshot>(`/api/admin/entries/order?kind=${kind}`);
      if (!mounted.current || request !== requestId.current) return;
      setSnapshot(result);
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(result.items.length / pageSize))),
      );
      setError(null);
      setPending(null);
      setEditingId(null);
      setStatus({ key: 'Order loaded' });
      onChanged();
    } catch (cause) {
      if (!mounted.current || request !== requestId.current) return;
      setError({ message: errorMessage(cause), conflict: false });
      setStatus({ key: '' });
    } finally {
      if (mounted.current && request === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestId.current++;
      clearHover();
    };
    // 切換介面語言不重新讀取清單，也不清除尚未送出的移動位置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [kind]);

  useEffect(() => {
    if (!focusId || saving || loading) return;
    const frame = requestAnimationFrame(() => {
      const handle = handles.current.get(focusId);
      if (!handle) return;
      handle.focus({ preventScroll: true });
      handle.scrollIntoView({ block: 'nearest' });
      setFocusId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId, page, snapshot, saving, loading]);

  async function move(itemId: string, nextPosition: number) {
    if (!snapshot || savingRef.current || loading || nextPosition < 1 || nextPosition > total)
      return;
    const oldIndex = items.findIndex((item) => item.id === itemId);
    if (oldIndex < 0 || oldIndex + 1 === nextPosition) {
      if (oldIndex >= 0) setPage(Math.ceil((oldIndex + 1) / pageSize));
      setStatus({ key: 'Order unchanged' });
      setFocusId(itemId);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setPending({ id: itemId, position: nextPosition });
    setError(null);
    setStatus({ key: 'Saving order…' });
    try {
      const result = await api<OrderSnapshot>(
        '/api/admin/entries/order',
        json('PATCH', {
          kind,
          id: itemId,
          position: nextPosition,
          revision: snapshot.revision,
        }),
      );
      if (!mounted.current) return;
      setSnapshot(result);
      const finalIndex = result.items.findIndex((item) => item.id === itemId);
      setPage(Math.max(1, Math.ceil((finalIndex + 1) / pageSize)));
      setEditingId(null);
      setPending(null);
      setStatus({
        key: 'Moved “{title}” to position {position}',
        values: { title: items[oldIndex].title || t('Untitled'), position: finalIndex + 1 },
      });
      setFocusId(itemId);
      onChanged();
    } catch (cause) {
      if (!mounted.current) return;
      const conflict = cause instanceof ApiError && cause.status === 409;
      setError({
        message: conflict
          ? 'This order has changed in another tab. Reload the latest order before moving again.'
          : errorMessage(cause),
        conflict,
      });
      setStatus({ key: '' });
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function dropTarget(event: DragMoveEvent | DragOverEvent | DragEndEvent): DropTarget | null {
    const data = event.over?.data.current;
    if (!event.over || !data || !snapshot) return null;
    if (data.type === 'position') return { id: String(event.over.id), position: data.position };
    if (data.type !== 'row') return null;
    const translated = event.active.rect.current.translated;
    const y =
      dragPointer.current?.y ??
      (translated ? translated.top + translated.height / 2 : event.over.rect.top);
    const after = y >= event.over.rect.top + event.over.rect.height / 2;
    const source = items.findIndex((item) => item.id === String(event.active.id));
    const insertion = data.index + (after ? 1 : 0);
    const final = insertion - (source < insertion ? 1 : 0) + 1;
    return {
      id: String(event.over.id),
      position: Math.max(1, Math.min(total, final)),
      edge: after ? 'after' : 'before',
    };
  }

  function dragOver(event: DragOverEvent) {
    setTarget(dropTarget(event));
    const data = event.over?.data.current;
    if (data?.type !== 'page' || data.page === page) {
      clearHover();
      return;
    }
    if (hoverPage.current === data.page) return;
    clearHover();
    hoverPage.current = data.page;
    hoverTimer.current = setTimeout(() => {
      setPage(data.page);
      setTarget(null);
      setStatus({
        key: 'Page {page} opened. Drop on a row to choose its position.',
        values: { page: data.page },
      });
      clearHover();
    }, 600);
  }

  function finishDrag(event?: DragEndEvent) {
    clearHover();
    const result = event ? dropTarget(event) : null;
    const id = activeId;
    setActiveId(null);
    setTarget(null);
    if (event && result && id) void move(id, result.position);
    else {
      setPage(dragOriginPage.current);
      setFocusId(id);
      setStatus({
        key: event ? 'Drop cancelled. Choose a row or a page drop zone.' : 'Drag cancelled',
      });
    }
  }

  return (
    <section
      className="entry-order-panel"
      aria-label={t(kind === 'article' ? 'Article order' : 'Project order')}
      data-order-kind={kind}
      data-entry-order
    >
      <div className="entry-order-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {t(kind === 'article' ? 'Article order' : 'Project order')}
          </h2>
          <p>
            {t(
              kind === 'article'
                ? 'All articles outside the trash are shown here, regardless of your search or filters.'
                : 'All projects outside the trash are shown here, regardless of your search or filters.',
            )}
          </p>
          <p>
            {t('Each move is saved immediately and updates the public list. Drafts stay private.')}
          </p>
        </div>
        <button
          type="button"
          className="admin-button"
          onClick={onClose}
          disabled={saving || Boolean(activeId)}
        >
          <Check size={16} aria-hidden="true" />
          {t('Back to list')}
        </button>
      </div>
      <div className="entry-order-toolbar">
        <p id={instructionsId}>
          {t(
            'Drag a handle to reorder. For another page, use a page drop zone or hold over a page number.',
          )}
          <span className="sr-only">
            {' '}
            {t(
              'Use Move up, Move down, or Move to position to reorder with a keyboard. Press Escape to cancel a drag.',
            )}
          </span>
        </p>
        <label>
          {t('Per page')}
          <select
            aria-label={t('Per page')}
            value={pageSize}
            disabled={loading || saving || Boolean(activeId)}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
              setEditingId(null);
            }}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="entry-order-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-order-status
      >
        {(loading || saving) && (
          <LoaderCircle className="entry-order-spinner" size={16} aria-hidden="true" />
        )}
        {status.key && t(status.key, status.values)}
      </div>
      {error && (
        <div className="entry-order-error" role="alert">
          <p>{t(error.message)}</p>
          {pending && !error.conflict && (
            <p>
              {t(
                'The move could not be confirmed. Your displayed order has been kept. Retry or reload the latest order.',
              )}
            </p>
          )}
          <div>
            {pending && !error.conflict && (
              <button
                type="button"
                className="admin-button"
                disabled={saving || loading}
                onClick={() => void move(pending.id, pending.position)}
              >
                {t('Retry move')}
              </button>
            )}
            <button
              type="button"
              className="admin-button"
              disabled={saving || loading}
              onClick={() => void load()}
            >
              <RotateCw size={16} aria-hidden="true" />
              {t('Reload order')}
            </button>
          </div>
        </div>
      )}
      {!loading && snapshot && !total && (
        <div className="admin-empty">
          <h3>{t(kind === 'article' ? 'No articles to reorder' : 'No projects to reorder')}</h3>
          <p>{t('Create content first, then return here to arrange it.')}</p>
        </div>
      )}
      {total > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{
            restoreFocus: false,
            screenReaderInstructions: {
              draggable: t(
                'Use Move up, Move down, or Move to position to reorder with a keyboard. Press Escape to cancel a drag.',
              ),
            },
            announcements: {
              onDragStart: ({ active }) =>
                t('Dragging “{title}”', { title: active.data.current?.title || t('Untitled') }),
              onDragOver: () => undefined,
              onDragEnd: () => undefined,
              onDragCancel: () => t('Drag cancelled'),
            },
          }}
          onDragStart={(event) => {
            clearHover();
            dragOriginPage.current = page;
            setActiveId(String(event.active.id));
            setEditingId(null);
            setStatus({
              key: 'Dragging “{title}”',
              values: { title: event.active.data.current?.title || t('Untitled') },
            });
          }}
          onDragMove={(event) => setTarget(dropTarget(event))}
          onDragOver={dragOver}
          onDragEnd={(event) => finishDrag(event)}
          onDragCancel={() => finishDrag()}
        >
          {page > 1 && (
            <PageDropZone
              direction="previous"
              position={start}
              page={page - 1}
              disabled={blocked}
              dragging={Boolean(activeId)}
            />
          )}
          <ol className="entry-order-list" start={start + 1} aria-busy={saving || loading}>
            {visibleItems.map((item, offset) => (
              <OrderRow
                key={item.id}
                item={item}
                index={start + offset}
                total={total}
                pageSize={pageSize}
                blocked={blocked}
                dragging={Boolean(activeId)}
                target={target}
                editing={editingId === item.id}
                position={position}
                instructionsId={instructionsId}
                onEditing={(open) => {
                  setEditingId(open ? item.id : null);
                  setPosition(String(start + offset + 1));
                  if (!open) setFocusId(item.id);
                }}
                onPosition={setPosition}
                onMove={(value) => void move(item.id, value)}
                handleRef={(node) => {
                  if (node) handles.current.set(item.id, node);
                  else handles.current.delete(item.id);
                }}
              />
            ))}
          </ol>
          {page < pages && (
            <PageDropZone
              direction="next"
              position={Math.min(total, start + pageSize + 1)}
              page={page + 1}
              disabled={blocked}
              dragging={Boolean(activeId)}
            />
          )}
          <div className="entry-order-pagination">
            <span>
              {t('Showing {from}–{to} of {total}', {
                from: start + 1,
                to: Math.min(total, start + pageSize),
                total,
              })}
            </span>
            {pages > 1 && (
              <nav aria-label={t('Ordering pages')}>
                <button
                  type="button"
                  className="admin-button small"
                  disabled={blocked || Boolean(activeId) || page === 1}
                  onClick={() => {
                    setPage(page - 1);
                    setEditingId(null);
                  }}
                >
                  {t('Previous')}
                </button>
                {pageNumbers(page, pages).map((number, index) =>
                  number === 'gap' ? (
                    <span key={`gap-${index}`} aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <PageButton
                      key={number}
                      number={number}
                      current={page}
                      disabled={blocked}
                      onPage={(value) => {
                        if (!activeId) {
                          setPage(value);
                          setEditingId(null);
                        }
                      }}
                    />
                  ),
                )}
                <button
                  type="button"
                  className="admin-button small"
                  disabled={blocked || Boolean(activeId) || page === pages}
                  onClick={() => {
                    setPage(page + 1);
                    setEditingId(null);
                  }}
                >
                  {t('Next')}
                </button>
              </nav>
            )}
          </div>
          <DragOverlay
            dropAnimation={null}
            zIndex={1000}
            style={{ width: 'min(340px, calc(100vw - 32px))' } as CSSProperties}
          >
            {activeItem && (
              <div className="entry-order-overlay">
                <GripVertical size={20} aria-hidden="true" />
                <strong translate="no">{activeItem.title || t('Untitled')}</strong>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}
