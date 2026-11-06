'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { tmListBoard, tmSetStatus } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLockBodyScroll } from '@/hooks/useVisualViewport';
import { formatDue } from '@/lib/tasks/dates';
import { OwnerChip } from '@/components/tasks/uiBits';
import type { TmStatus, TmTask } from '@/lib/tasks/types';

const COLS: { id: Exclude<TmStatus, 'cancelled'>; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

class DesktopPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0) return false;
        return nativeEvent.pointerType !== 'touch';
      },
    },
  ];
}

function statusClass(task: TmTask) {
  if (task.status === 'done') return 'is-done';
  if (task.overdue) return 'is-overdue';
  if (task.status === 'in_progress') return 'is-progress';
  return '';
}

function dropStatus(overId: string): Exclude<TmStatus, 'cancelled'> | null {
  const raw = overId.replace(/^(strip-|tab-|col-|bar-)/, '');
  return COLS.some((c) => c.id === raw) ? (raw as Exclude<TmStatus, 'cancelled'>) : null;
}

function isBarId(id: string) {
  return id.startsWith('bar-') || id.startsWith('strip-');
}

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) {
    const bars = pointerHits.filter((c) => isBarId(String(c.id)) || String(c.id).startsWith('tab-'));
    return bars.length ? bars : pointerHits;
  }
  return closestCenter(args);
};

const snapLeftCenterToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  overlayNodeRect,
  transform,
}) => {
  if (!activatorEvent || !draggingNodeRect) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  const height = overlayNodeRect?.height ?? 44;
  return {
    ...transform,
    x: transform.x + (coords.x - draggingNodeRect.left),
    y: transform.y + (coords.y - draggingNodeRect.top) - height / 2,
  };
};

function GripDots() {
  return (
    <span className="grid grid-cols-2 gap-[3px]" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="h-1 w-1 rounded-full bg-white/35" />
      ))}
    </span>
  );
}

function CardBody({ task, ghost }: { task: TmTask; ghost?: boolean }) {
  const owner = task.owners[0];
  return (
    <>
      <span className={`tm-status m-3 shrink-0 self-start ${statusClass(task)}`} aria-hidden data-testid={ghost ? undefined : `tm-board-status-${task.id}`} />
      <span className="w-1.5 shrink-0" style={{ background: task.folder_color || '#8A8A8A' }} aria-hidden />
      <span className="min-w-0 flex-1 px-3 py-2.5">
        <span className="block text-sm font-medium leading-snug text-[#f4f1ea]">{task.title}</span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
          <span className={task.overdue ? 'text-[#E24B4A]' : 'text-white/40'}>
            {formatDue(task.due_date, task.due_time)}
          </span>
          {owner && <OwnerChip name={owner.full_name} />}
        </span>
      </span>
    </>
  );
}

function CardFace({ task, ghost }: { task: TmTask; ghost?: boolean }) {
  return (
    <div className={`tm-board-card flex overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] ${ghost ? 'tm-board-card-ghost' : ''}`}>
      <CardBody task={task} ghost={ghost} />
      <span className="tm-board-handle flex h-11 w-11 shrink-0 items-center justify-center self-center">
        <GripDots />
      </span>
    </div>
  );
}

function DragPill({ task }: { task: TmTask }) {
  return (
    <div data-testid="tm-board-pill" className="tm-board-pill">
      <span className="h-full w-1.5 shrink-0" style={{ background: task.folder_color || '#8A8A8A' }} aria-hidden />
      <span className="min-w-0 truncate px-3 text-sm font-medium text-[#f4f1ea]">{task.title}</span>
    </div>
  );
}

function BoardCard({ task }: { task: TmTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div
      ref={setNodeRef}
      data-testid={`tm-board-card-${task.id}`}
      className={`tm-board-card flex overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] ${isDragging ? 'opacity-40' : ''}`}
    >
      <Link
        href={`/admin/tasks/t/${task.id}`}
        tabIndex={-1}
        className="flex min-w-0 flex-1 items-start no-underline text-inherit"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <CardBody task={task} />
      </Link>
      <button
        type="button"
        data-testid={`tm-board-handle-${task.id}`}
        className="tm-board-handle flex h-11 w-11 shrink-0 items-center justify-center self-center"
        aria-label={`Move ${task.title}`}
        {...listeners}
        {...attributes}
        onContextMenu={(e) => e.preventDefault()}
      >
        <GripDots />
      </button>
    </div>
  );
}

function Column({ id, label, tasks }: { id: string; label: string; tasks: TmTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${id}` });
  return (
    <section
      ref={setNodeRef}
      data-testid={`tm-board-col-${id}`}
      className={`flex h-full min-w-0 flex-col rounded-xl border border-white/[0.06] bg-[#101010] p-2 ${isOver ? 'ring-1 ring-[#C6A664]' : ''}`}
    >
      <p className="hidden px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 md:block">
        {label} <span className="text-white/25">{tasks.length}</span>
      </p>
      <div
        data-tm-col-scroll={id}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto"
        style={{ maxHeight: 'calc(100dvh - 14rem)' }}
      >
        {tasks.length === 0 ? <TmEmpty>Nothing here</TmEmpty> : tasks.map((t) => <BoardCard key={t.id} task={t} />)}
      </div>
    </section>
  );
}

function StripTarget({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `strip-${id}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={`tm-board-strip-${id}`}
      className={`flex min-h-14 flex-1 items-center justify-center rounded-xl px-2 text-sm font-semibold ${
        isOver ? 'bg-[#C6A664] text-black' : 'bg-white/10 text-white/80'
      }`}
    >
      {label}
    </div>
  );
}

function BarTarget({ id, label, current }: { id: string; label: string; current: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bar-${id}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={`tm-board-bar-${id}`}
      className={`flex min-h-[72px] flex-1 items-center justify-center px-2 text-sm font-semibold ${
        current ? 'bg-white/5 text-white/30' : isOver ? 'bg-[#C6A664] text-black' : 'bg-white/10 text-white/80'
      }`}
    >
      {label}
    </div>
  );
}

function TabTarget({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab-${id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`tm-board-tab-${id}`}
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm ${
        isOver ? 'bg-[#C6A664] text-black' : active ? 'bg-[#C6A664] text-black' : 'bg-white/8 text-white/60'
      }`}
    >
      {label}
    </button>
  );
}

function scrollColumnNearEdge(clientY: number) {
  document.querySelectorAll<HTMLElement>('[data-tm-col-scroll]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (clientY < r.top || clientY > r.bottom) return;
    const edge = 56;
    if (clientY - r.top < edge) el.scrollTop -= 18;
    else if (r.bottom - clientY < edge) el.scrollTop += 18;
  });
}

export function BoardView() {
  const { markFetchFailed } = useTasks();
  const isPhone = useIsMobile();
  const [cols, setCols] = useState<{ open: TmTask[]; in_progress: TmTask[]; done: TmTask[] } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragging = !!activeId;
  const overBar = !!overId && isBarId(overId);
  useLockBodyScroll(dragging);

  const sensors = useSensors(
    useSensor(DesktopPointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 4 } }),
    useSensor(KeyboardSensor)
  );

  async function load() {
    const res = await tmListBoard();
    if (!res.ok) {
      markFetchFailed();
      return;
    }
    setCols(res.data);
  }

  useEffect(() => {
    void load();
  }, []);

  const activeTask =
    activeId && cols
      ? (['open', 'in_progress', 'done'] as const).flatMap((k) => cols[k]).find((t) => t.id === activeId) ?? null
      : null;

  async function applyStatus(id: string, status: Exclude<TmStatus, 'cancelled'>, previous: Exclude<TmStatus, 'cancelled'> | undefined) {
    const res = await tmSetStatus(id, status);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await load();
    toast.success(`Moved to ${COLS.find((c) => c.id === status)?.label ?? status}`, {
      duration: 10000,
      action:
        previous && previous !== status
          ? {
              label: 'Undo',
              onClick: () => {
                void tmSetStatus(id, previous).then((u) => {
                  if (!u.ok) {
                    toast.error(u.error);
                    return;
                  }
                  toast.success('Undone');
                  return load();
                });
              },
            }
          : undefined,
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setOverId(null);
  }

  function onDragOver(e: DragOverEvent) {
    setOverId(e.over?.id ? String(e.over.id) : null);
  }

  function onDragMove(e: DragMoveEvent) {
    const over = e.over?.id ? String(e.over.id) : '';
    if (isBarId(over)) return;
    const ev = e.activatorEvent as PointerEvent | KeyboardEvent | undefined;
    const startY = ev && 'clientY' in ev ? ev.clientY : 0;
    scrollColumnNearEdge(startY + (e.delta?.y ?? 0));
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : '';
    setActiveId(null);
    setOverId(null);
    const next = dropStatus(over);
    if (!next || !cols) return;
    const current = (['open', 'in_progress', 'done'] as const).find((k) => cols[k].some((t) => t.id === id));
    if (!current || current === next) return;
    await applyStatus(id, next, current);
  }

  function scrollToTab(index: number) {
    setActiveTab(index);
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  }

  return (
    <div data-testid="tm-board">
      <h1 className="tm-display mb-4 text-3xl">Board</h1>
      {!cols ? (
        <TmSkeleton rows={6} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          autoScroll={!overBar}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setOverId(null);
          }}
        >
          <div className="mb-2 flex md:hidden" data-testid="tm-board-tabs">
            {COLS.map((c, i) => (
              <TabTarget key={c.id} id={c.id} label={c.label} active={activeTab === i} onClick={() => scrollToTab(i)} />
            ))}
          </div>
          {dragging && (
            <div
              className="fixed inset-x-0 top-0 z-[80] flex items-stretch gap-2 bg-[#0B0B0B]/95 px-3 pb-3 pt-[max(10px,env(safe-area-inset-top))]"
              data-testid="tm-board-drop-strip"
            >
              {COLS.map((c) => (
                <StripTarget key={c.id} id={c.id} label={c.label} />
              ))}
            </div>
          )}
          <div
            ref={scrollerRef}
            data-testid="tm-board-scroller"
            className={`flex ${dragging ? 'overflow-hidden' : 'snap-x snap-mandatory overflow-x-auto'} md:gap-3 md:overflow-visible md:snap-none`}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (!el.clientWidth || dragging) return;
              setActiveTab(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {COLS.map((c) => (
              <div key={c.id} className="w-full min-w-full shrink-0 snap-start px-0.5 md:min-w-0 md:w-auto md:flex-1 md:px-0">
                <Column id={c.id} label={c.label} tasks={cols[c.id]} />
              </div>
            ))}
          </div>
          {dragging && (
            <div
              className="fixed inset-x-0 z-[80] flex bg-[#0B0B0B]/95"
              style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}
              data-testid="tm-board-drop-bar"
            >
              {COLS.map((c) => (
                <BarTarget
                  key={c.id}
                  id={c.id}
                  label={c.label}
                  current={activeTask?.status === c.id}
                />
              ))}
            </div>
          )}
          <DragOverlay modifiers={isPhone ? [snapLeftCenterToCursor] : undefined}>
            {activeTask ? (isPhone ? <DragPill task={activeTask} /> : <CardFace task={activeTask} ghost />) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
