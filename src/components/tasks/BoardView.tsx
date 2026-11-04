'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { tmListBoard, tmSetStatus } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { formatDue } from '@/lib/tasks/dates';
import { personInitials } from '@/lib/tasks/names';
import type { TmStatus, TmTask } from '@/lib/tasks/types';
import { Button } from '@/components/ui/button';

const COLS: { id: Exclude<TmStatus, 'cancelled'>; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

function statusClass(task: TmTask) {
  if (task.status === 'done') return 'is-done';
  if (task.overdue) return 'is-overdue';
  if (task.status === 'in_progress') return 'is-progress';
  return '';
}

function nextCycle(status: TmStatus): Exclude<TmStatus, 'cancelled'> | null {
  if (status === 'open') return 'in_progress';
  if (status === 'in_progress') return 'done';
  if (status === 'done') return 'open';
  return null;
}

function BoardCard({
  task,
  onCycle,
}: {
  task: TmTask;
  onCycle: (task: TmTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform) };
  const owner = task.owners[0];
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`tm-board-card-${task.id}`}
      className={`flex overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] ${isDragging ? 'opacity-70' : ''}`}
    >
      <button
        type="button"
        data-testid={`tm-board-cycle-${task.id}`}
        aria-label={`Cycle status, currently ${task.status}`}
        className={`tm-status m-3 shrink-0 self-start ${statusClass(task)}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCycle(task);
        }}
      />
      <div className="min-w-0 flex-1 touch-none" {...listeners} {...attributes}>
        <Link
          href={`/admin/tasks/t/${task.id}`}
          className="flex no-underline text-inherit"
          onClick={(e) => isDragging && e.preventDefault()}
        >
          <span className="w-1.5 shrink-0" style={{ background: task.folder_color || '#8A8A8A' }} aria-hidden />
          <span className="min-w-0 flex-1 px-3 py-2.5">
            <span className="block text-sm font-medium leading-snug text-[#f4f1ea]">{task.title}</span>
            <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
              <span className={task.overdue ? 'text-[#E24B4A]' : 'text-white/40'}>
                {formatDue(task.due_date, task.due_time)}
              </span>
              {owner && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2a2a2a] text-[9px] font-semibold text-[#C6A664]">
                  {personInitials(owner.full_name)}
                </span>
              )}
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  onCycle,
}: {
  id: string;
  label: string;
  tasks: TmTask[];
  onCycle: (task: TmTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      data-testid={`tm-board-col-${id}`}
      className={`flex h-full min-w-0 flex-col rounded-xl border border-white/[0.06] bg-[#101010] p-2 ${isOver ? 'ring-1 ring-[#C6A664]' : ''}`}
    >
      <p className="hidden px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 md:block">
        {label} <span className="text-white/25">{tasks.length}</span>
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {tasks.length === 0 ? <TmEmpty>Nothing here</TmEmpty> : tasks.map((t) => <BoardCard key={t.id} task={t} onCycle={onCycle} />)}
      </div>
    </section>
  );
}

function StripTarget({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={`tm-board-strip-${id.replace('strip-', '')}`}
      className={`flex-1 rounded-lg px-2 py-2 text-center text-[12px] font-medium ${
        isOver ? 'bg-[#C6A664] text-black' : 'bg-white/8 text-white/70'
      }`}
    >
      {label}
    </div>
  );
}

export function BoardView() {
  const { markFetchFailed } = useTasks();
  const [cols, setCols] = useState<{ open: TmTask[]; in_progress: TmTask[]; done: TmTask[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [confirmDone, setConfirmDone] = useState<TmTask | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
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

  async function applyStatus(id: string, status: Exclude<TmStatus, 'cancelled'>) {
    const res = await tmSetStatus(id, status);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await load();
  }

  function dropStatus(overId: string): Exclude<TmStatus, 'cancelled'> | null {
    const raw = overId.startsWith('strip-') ? overId.slice(6) : overId;
    return COLS.some((c) => c.id === raw) ? (raw as Exclude<TmStatus, 'cancelled'>) : null;
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragging(false);
    const over = e.over?.id ? String(e.over.id) : '';
    const id = String(e.active.id);
    const next = dropStatus(over);
    if (!next) return;
    const current = cols && (['open', 'in_progress', 'done'] as const).find((k) => cols[k].some((t) => t.id === id));
    if (current === next) return;
    await applyStatus(id, next);
  }

  function onDragStart(_e: DragStartEvent) {
    setDragging(true);
  }

  function onCycle(task: TmTask) {
    const next = nextCycle(task.status);
    if (!next) return;
    if (next === 'done') {
      setConfirmDone(task);
      return;
    }
    void applyStatus(task.id, next);
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
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(false)}>
          <div className="mb-2 flex md:hidden" data-testid="tm-board-tabs">
            {COLS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                data-testid={`tm-board-tab-${c.id}`}
                onClick={() => scrollToTab(i)}
                className={`flex-1 rounded-lg py-2 text-sm ${
                  activeTab === i ? 'bg-[#C6A664] text-black' : 'bg-white/8 text-white/60'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {dragging && (
            <div
              className="sticky top-0 z-20 mb-2 flex items-center gap-1 rounded-xl bg-[#1a1a1a] p-1"
              data-testid="tm-board-drop-strip"
            >
              <span className="shrink-0 px-2 text-[11px] text-white/40">Drop on:</span>
              {COLS.map((c) => (
                <StripTarget key={c.id} id={`strip-${c.id}`} label={c.label} />
              ))}
            </div>
          )}
          <div
            ref={scrollerRef}
            data-testid="tm-board-scroller"
            className="flex snap-x snap-mandatory overflow-x-auto md:gap-3 md:overflow-visible md:snap-none"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (!el.clientWidth) return;
              setActiveTab(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {COLS.map((c) => (
              <div key={c.id} className="w-full min-w-full shrink-0 snap-start px-0.5 md:min-w-0 md:w-auto md:flex-1 md:px-0">
                <Column id={c.id} label={c.label} tasks={cols[c.id]} onCycle={onCycle} />
              </div>
            ))}
          </div>
        </DndContext>
      )}
      {confirmDone && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center" data-testid="tm-board-done-confirm">
          <div className="w-full max-w-sm rounded-xl bg-[#141414] p-4 text-[#f4f1ea]">
            <p className="text-sm">Mark “{confirmDone.title}” done?</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setConfirmDone(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="tm-board-done-yes"
                className="flex-1 bg-[#C6A664] text-black"
                onClick={() => {
                  void applyStatus(confirmDone.id, 'done');
                  setConfirmDone(null);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
