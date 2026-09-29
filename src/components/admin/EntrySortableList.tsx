import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, GripVertical, RefreshCw } from 'lucide-react';
import type { Entry, EntryKind, EntryOrderSnapshot } from '../../lib/types';
import { pageNumbers, type ListResult } from '../../lib/listing';
import { ApiError, api, errorMessage, json } from './api';
import { useAdminLanguage } from './AdminLanguage';
import '../../styles/admin-entry-sortable.css';

// 整列任何位置都可抓取，縮小的浮層仍須跟隨滑鼠或手指，不能保留原表格欄位的偏移
const centerOverlayOnPointer: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
  windowRect,
}) => {
  if (!activatorEvent || !draggingNodeRect) return transform;
  const point =
    'touches' in activatorEvent
      ? (activatorEvent as TouchEvent).touches[0]
      : 'clientX' in activatorEvent
        ? (activatorEvent as MouseEvent)
        : null;
  if (!point) return transform;
  const x = transform.x + point.clientX - draggingNodeRect.left - draggingNodeRect.width / 2;
  const y = transform.y + point.clientY - draggingNodeRect.top - draggingNodeRect.height / 2;
  return {
    ...transform,
    x: windowRect
      ? Math.max(-draggingNodeRect.left, Math.min(x, windowRect.width - draggingNodeRect.right))
      : x,
    y: windowRect
      ? Math.max(-draggingNodeRect.top, Math.min(y, windowRect.height - draggingNodeRect.bottom))
      : y,
  };
};

interface Target {
  id: string;
  position: number;
  edge?: 'before' | 'after';
}
interface Move {
  id: string;
  position: number;
  baseline: EntryOrderSnapshot;
}
interface SortContextValue {
  disabled: boolean;
  dragging: boolean;
  instructionsId: string;
  target: Target | null;
  suppressClick: () => boolean;
  registerHandle: (id: string, node: HTMLButtonElement | null) => void;
}
const SortContext = createContext<SortContextValue | null>(null);
const RowContext = createContext<ReturnType<typeof useSortable> | null>(null);

function mayStartDragging(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-entry-drag-handle]')) return true;
  if (
    target.closest(
      'button, input, textarea, select, option, [contenteditable="true"], [role="checkbox"], [role="switch"]',
    )
  )
    return false;
  const link = target.closest('a');
  return !link || link.classList.contains('admin-entry-title');
}

export function EntrySortableRow({
  entry,
  position,
  children,
}: {
  entry: Entry;
  position: number;
  children: ReactNode;
}) {
  const context = useContext(SortContext)!;
  const sortable = useSortable({
    id: entry.id,
    disabled: context.disabled,
    data: { type: 'entry', title: entry.content.title },
  });
  const { setNodeRef, transform, transition, listeners, isDragging } = sortable;
  const edge = context.target?.id === entry.id ? context.target.edge : undefined;
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  return (
    <RowContext.Provider value={sortable}>
      <tr
        ref={setNodeRef}
        style={style}
        className={`admin-sortable-entry${context.disabled ? '' : ' can-drag'}${isDragging ? ' is-dragging' : ''}${edge ? ` drop-${edge}` : ''}`}
        data-sortable-entry-id={entry.id}
        data-sortable-position={position}
        data-entry-drop-edge={edge}
        data-entry-sort-disabled={context.disabled || undefined}
        onMouseDown={(event) => {
          if (!event.defaultPrevented && mayStartDragging(event.target))
            listeners?.onMouseDown?.(event);
        }}
        onTouchStart={(event) => {
          if (!event.defaultPrevented && mayStartDragging(event.target))
            listeners?.onTouchStart?.(event);
        }}
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          if (context.dragging) event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (context.dragging || (event.detail > 0 && context.suppressClick())) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </tr>
    </RowContext.Provider>
  );
}

export function EntryDragHandle({ entry }: { entry: Entry }) {
  const { t } = useAdminLanguage();
  const context = useContext(SortContext)!;
  const sortable = useContext(RowContext)!;
  return (
    <button
      type="button"
      className="admin-icon-button admin-entry-drag-handle"
      ref={(node) => {
        sortable.setActivatorNodeRef(node);
        context.registerHandle(entry.id, node);
      }}
      {...sortable.attributes}
      onKeyDown={(event) => sortable.listeners?.onKeyDown?.(event)}
      disabled={context.disabled}
      aria-label={t('Drag “{title}”', { title: entry.content.title || t('Untitled draft') })}
      aria-describedby={context.instructionsId}
      data-entry-drag-handle={entry.id}
    >
      <GripVertical size={18} aria-hidden="true" />
    </button>
  );
}

function PageDrop({
  page,
  position,
  direction,
  enabled,
}: {
  page: number;
  position: number;
  direction: 'previous' | 'next';
  enabled: boolean;
}) {
  const { t } = useAdminLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: `entry-page-drop-${page}`,
    data: { type: 'position', position },
    disabled: !enabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={`admin-entry-page-drop${isOver ? ' is-over' : ''}`}
      data-entry-drop-page={page}
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

function PageButton({
  page,
  current,
  disabled,
  droppable,
  onPage,
}: {
  page: number;
  current: number;
  disabled: boolean;
  droppable: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useAdminLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: `entry-sort-page-${page}`,
    data: { type: 'page', page },
    disabled: !droppable || page === current,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`admin-button small${isOver ? ' entry-page-hover' : ''}`}
      disabled={disabled}
      aria-label={t('Page {number}', { number: page })}
      aria-current={page === current ? 'page' : undefined}
      title={droppable ? t('Hold here to open page {page}', { page }) : undefined}
      data-entry-sort-page={page}
      onClick={() => onPage(page)}
    >
      {page}
    </button>
  );
}

export function EntrySortableScope({
  kind,
  eligible,
  reason,
  info,
  page,
  pageSize,
  loading,
  busy,
  onPage,
  onChanged,
  onInteractionChange,
  onEnable,
  children,
}: {
  kind: EntryKind;
  eligible: boolean;
  reason: string;
  info: ListResult<Entry> | null;
  page: number;
  pageSize: number;
  loading: boolean;
  busy: boolean;
  onPage: (page: number) => void;
  onChanged: () => void;
  onInteractionChange: (busy: boolean) => void;
  onEnable: () => void;
  children: ReactNode;
}) {
  const { t } = useAdminLanguage();
  const instructionsId = useId();
  const [snapshot, setSnapshot] = useState<EntryOrderSnapshot | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [failure, setFailure] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [status, setStatus] = useState<{ key: string; values?: Record<string, string | number> }>({
    key: '',
  });
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    previous?: ListResult<Entry> | null;
  } | null>(null);
  const mounted = useRef(true);
  const requestNumber = useRef(0);
  const loadedInfo = useRef<ListResult<Entry> | null>(null);
  const dragging = useRef(false);
  const dragSnapshot = useRef<EntryOrderSnapshot | null>(null);
  const savingRef = useRef(false);
  const failureRef = useRef(false);
  const originPage = useRef(1);
  const suppressUntil = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const keyboard = useRef(false);
  const handleNodes = useRef(new Map<string, HTMLButtonElement>());
  const errorSummary = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPage = useRef<number | null>(null);
  const callbacks = useRef({ onChanged, onPage, onInteractionChange });
  callbacks.current = { onChanged, onPage, onInteractionChange };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );
  const matchesList = (value: EntryOrderSnapshot, list: ListResult<Entry>) =>
    value.items.length === list.total &&
    value.items
      .slice(list.from - 1, list.to)
      .map((item) => item.id)
      .join(',') === list.items.map((item) => item.id).join(',');
  const listMatches = !!snapshot && !!info && matchesList(snapshot, info);
  const disabled =
    !eligible || busy || loading || orderLoading || saving || !!failure || !listMatches;
  const activeItem = snapshot?.items.find((item) => item.id === activeId);
  const currentPage = info?.page || page;
  const totalPages = info?.pages || 1;
  const previewIndex =
    target && info
      ? Math.max(0, Math.min(info.items.length - 1, target.position - info.from))
      : undefined;

  function clearHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    hoverPage.current = null;
  }

  async function loadOrder(refreshList = false) {
    const request = ++requestNumber.current;
    setOrderLoading(true);
    try {
      const value = await api<EntryOrderSnapshot>(`/api/admin/entries/order?kind=${kind}`);
      if (!mounted.current || request !== requestNumber.current) return;
      setSnapshot(value);
      if (!refreshList && info && !matchesList(value, info)) {
        setFailure({
          message:
            'The list changed while its order was loading. Reload the order before dragging.',
          conflict: true,
        });
        failureRef.current = true;
        return;
      }
      setFailure(null);
      failureRef.current = false;
      setPending(null);
      if (refreshList) {
        setStatus({ key: 'Order loaded' });
        callbacks.current.onChanged();
      }
    } catch (error) {
      if (!mounted.current || request !== requestNumber.current) return;
      setFailure({ message: errorMessage(error), conflict: false });
      failureRef.current = true;
    } finally {
      if (mounted.current && request === requestNumber.current) setOrderLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestNumber.current++;
      clearHover();
      callbacks.current.onInteractionChange(false);
    };
  }, []);
  useEffect(() => {
    if (
      !eligible ||
      !info ||
      loading ||
      busy ||
      dragging.current ||
      savingRef.current ||
      failureRef.current ||
      info === loadedInfo.current
    )
      return;
    loadedInfo.current = info;
    void loadOrder();
    // 語言變更不重新讀取，拖曳跨頁期間凍結 revision，避免覆蓋其他分頁的排序
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, kind, info, loading, busy]);
  useEffect(() => {
    callbacks.current.onInteractionChange(Boolean(activeId) || saving);
  }, [activeId, saving]);
  useEffect(() => {
    if (failure) errorSummary.current?.focus({ preventScroll: true });
  }, [failure]);
  useEffect(() => {
    if (
      !focusRequest ||
      loading ||
      saving ||
      orderLoading ||
      (focusRequest.previous && info === focusRequest.previous)
    )
      return;
    const frame = requestAnimationFrame(() => {
      const node = handleNodes.current.get(focusRequest.id);
      if (!node || node.disabled) return;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: 'nearest' });
      setFocusRequest(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, info, loading, saving, orderLoading, failure]);

  const collisionDetection: CollisionDetection = (args) => {
    pointer.current = args.pointerCoordinates;
    return args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
  };

  function getTarget(event: DragMoveEvent | DragEndEvent): Target | null {
    const over = event.over;
    const baseline = dragSnapshot.current;
    if (!over || !baseline) return null;
    const data = over.data.current;
    if (data?.type === 'position') return { id: String(over.id), position: data.position };
    if (data?.type !== 'entry') return null;
    const source = baseline.items.findIndex((item) => item.id === String(event.active.id));
    const index = baseline.items.findIndex((item) => item.id === String(over.id));
    if (source < 0 || index < 0) return null;
    const after = keyboard.current
      ? source < index
      : (pointer.current?.y ?? over.rect.top) >= over.rect.top + over.rect.height / 2;
    const insertion = index + (after ? 1 : 0);
    const position = insertion - (source < insertion ? 1 : 0) + 1;
    return {
      id: String(over.id),
      position,
      edge: position === source + 1 ? undefined : after ? 'after' : 'before',
    };
  }

  function hover(event: DragMoveEvent) {
    setTarget(getTarget(event));
    const data = event.over?.data.current;
    if (data?.type !== 'page' || data.page === currentPage || loading || keyboard.current) {
      clearHover();
      return;
    }
    if (hoverPage.current === data.page) return;
    clearHover();
    hoverPage.current = data.page;
    hoverTimer.current = setTimeout(() => {
      callbacks.current.onPage(data.page);
      setTarget(null);
      setStatus({
        key: 'Page {page} opened. Drop on a row to choose its position.',
        values: { page: data.page },
      });
      clearHover();
    }, 600);
  }

  async function move(id: string, position: number, baseline: EntryOrderSnapshot) {
    if (savingRef.current) return;
    const originalIndex = baseline.items.findIndex((item) => item.id === id);
    if (originalIndex < 0 || position < 1 || position > baseline.items.length) return;
    if (position === originalIndex + 1) {
      callbacks.current.onPage(Math.ceil(position / pageSize));
      setFocusRequest({ id });
      setStatus({ key: 'Order unchanged' });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setPending({ id, position, baseline });
    setFailure(null);
    failureRef.current = false;
    setStatus({ key: 'Saving order…' });
    try {
      const value = await api<EntryOrderSnapshot>(
        '/api/admin/entries/order',
        json('PATCH', { kind, id, position, revision: baseline.revision }),
      );
      if (!mounted.current) return;
      setSnapshot(value);
      const index = value.items.findIndex((item) => item.id === id);
      setPending(null);
      setStatus({
        key: 'Moved “{title}” to position {position}',
        values: { title: baseline.items[originalIndex].title, position: index + 1 },
      });
      setFocusRequest({ id, previous: info });
      callbacks.current.onPage(Math.max(1, Math.ceil((index + 1) / pageSize)));
      callbacks.current.onChanged();
    } catch (error) {
      if (!mounted.current) return;
      const conflict = error instanceof ApiError && error.status === 409;
      setFailure({
        message: conflict
          ? 'This order has changed in another tab. Reload the latest order before moving again.'
          : errorMessage(error),
        conflict,
      });
      failureRef.current = true;
      setStatus({ key: '' });
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function finish(event?: DragEndEvent) {
    clearHover();
    const next = event && eligible ? getTarget(event) : null;
    const id = activeId;
    dragging.current = false;
    suppressUntil.current = Date.now() + 80;
    setActiveId(null);
    setTarget(null);
    if (next && id && dragSnapshot.current) void move(id, next.position, dragSnapshot.current);
    else {
      callbacks.current.onPage(originPage.current);
      if (id) setFocusRequest({ id });
      setStatus({
        key: event ? 'Drop cancelled. Choose a row or a page drop zone.' : 'Drag cancelled',
      });
    }
  }

  return (
    <div
      className="admin-entry-sortable"
      data-entry-sortable
      data-entry-sort-enabled={eligible && !disabled}
    >
      <div className="admin-entry-sort-help" id={instructionsId}>
        <p>
          {t(
            eligible
              ? 'Drag a row to reorder. On touch screens, hold briefly before dragging. Changes are saved immediately.'
              : reason,
          )}
        </p>
        <span className="sr-only">
          {t(
            'For keyboard sorting, focus the handle and press Space, use the arrow keys, then press Space to save or Escape to cancel. For a distant position, use Adjust order.',
          )}
        </span>
        {!eligible && (
          <button type="button" className="admin-button small" disabled={busy} onClick={onEnable}>
            {t('Use manual order and clear filters')}
          </button>
        )}
      </div>
      <div
        className="admin-entry-sort-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-entry-sort-status
      >
        {orderLoading
          ? t('Loading order…')
          : activeId && target
            ? t('Drop here: position {position}', { position: target.position })
            : status.key && t(status.key, status.values)}
      </div>
      {failure && (
        <div ref={errorSummary} className="admin-entry-sort-error" role="alert" tabIndex={-1}>
          <p>{t(failure.message)}</p>
          {pending && !failure.conflict && (
            <p>
              {t(
                'The move could not be confirmed. Your displayed order has been kept. Retry or reload the latest order.',
              )}
            </p>
          )}
          <div>
            {pending && !failure.conflict && (
              <button
                type="button"
                className="admin-button small"
                disabled={saving || orderLoading || loading}
                onClick={() => void move(pending.id, pending.position, pending.baseline)}
              >
                {t('Retry move')}
              </button>
            )}
            <button
              type="button"
              className="admin-button small"
              disabled={saving || orderLoading || loading}
              onClick={() => void loadOrder(true)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {t('Reload order')}
            </button>
          </div>
        </div>
      )}
      <SortContext.Provider
        value={{
          disabled,
          dragging: Boolean(activeId),
          instructionsId,
          target,
          suppressClick: () => Date.now() < suppressUntil.current,
          registerHandle: (id, node) => {
            if (node) handleNodes.current.set(id, node);
            else handleNodes.current.delete(id);
          },
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{
            restoreFocus: false,
            screenReaderInstructions: {
              draggable: t(
                'For keyboard sorting, focus the handle and press Space, use the arrow keys, then press Space to save or Escape to cancel. For a distant position, use Adjust order.',
              ),
            },
            announcements: {
              onDragStart: ({ active }) =>
                t('Dragging “{title}”', {
                  title: active.data.current?.title || t('Untitled draft'),
                }),
              onDragOver: () => undefined,
              onDragEnd: () => undefined,
              onDragCancel: () => t('Drag cancelled'),
            },
          }}
          onDragStart={(event) => {
            clearHover();
            dragging.current = true;
            originPage.current = currentPage;
            dragSnapshot.current = snapshot;
            keyboard.current = event.activatorEvent instanceof KeyboardEvent;
            setActiveId(String(event.active.id));
            setStatus({
              key: 'Dragging “{title}”',
              values: { title: event.active.data.current?.title || t('Untitled draft') },
            });
          }}
          onDragMove={hover}
          onDragOver={hover}
          onDragEnd={(event) => finish(event)}
          onDragCancel={() => finish()}
        >
          {eligible && info && info.total > 0 && currentPage > 1 && (
            <PageDrop
              page={currentPage - 1}
              direction="previous"
              position={(currentPage - 1) * pageSize}
              enabled={!disabled}
            />
          )}
          <SortableContext
            items={info?.items.map((entry) => entry.id) || []}
            strategy={(args) =>
              args.activeIndex < 0 || (previewIndex === undefined && args.overIndex < 0)
                ? null
                : verticalListSortingStrategy({
                    ...args,
                    overIndex: previewIndex ?? args.overIndex,
                  })
            }
          >
            {children}
          </SortableContext>
          {eligible && info && info.total > 0 && currentPage < totalPages && (
            <PageDrop
              page={currentPage + 1}
              direction="next"
              position={Math.min(snapshot?.items.length || 0, currentPage * pageSize + 1)}
              enabled={!disabled}
            />
          )}
          {info && (
            <div className="admin-list-pagination">
              <span role="status" aria-live="polite">
                {loading
                  ? t('Updating results…')
                  : t('Showing {from}–{to} of {total}', {
                      from: info.from,
                      to: info.to,
                      total: info.total,
                    })}
              </span>
              {info.pages > 1 && (
                <nav aria-label={t('Content pagination')}>
                  <button
                    type="button"
                    className="admin-button small"
                    disabled={loading || saving || !!activeId || currentPage <= 1}
                    onClick={() => onPage(currentPage - 1)}
                  >
                    {t('Previous')}
                  </button>
                  {pageNumbers(currentPage, info.pages).map((number, index) =>
                    number === 'gap' ? (
                      <span className="list-page-gap" key={`gap-${index}`} aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <PageButton
                        key={number}
                        page={number}
                        current={currentPage}
                        disabled={loading || saving}
                        droppable={eligible && !disabled && !keyboard.current}
                        onPage={(value) => {
                          if (!activeId) onPage(value);
                        }}
                      />
                    ),
                  )}
                  <button
                    type="button"
                    className="admin-button small"
                    disabled={loading || saving || !!activeId || currentPage >= info.pages}
                    onClick={() => onPage(currentPage + 1)}
                  >
                    {t('Next')}
                  </button>
                </nav>
              )}
            </div>
          )}
          <DragOverlay
            modifiers={[centerOverlayOnPointer]}
            dropAnimation={null}
            zIndex={1000}
            style={{ width: 'min(400px, calc(100vw - 32px))' }}
          >
            {activeItem && (
              <div className="admin-entry-drag-overlay" data-entry-drag-overlay>
                <GripVertical size={18} aria-hidden="true" />
                <strong translate="no">{activeItem.title || t('Untitled draft')}</strong>
                <span>{t(activeItem.published ? 'Published' : 'Draft')}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </SortContext.Provider>
    </div>
  );
}
