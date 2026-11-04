'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
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
import { initials, TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { formatDue } from '@/lib/tasks/dates';
import type { TmStatus, TmTask } from '@/lib/tasks/types';

const COLS: { id: Exclude<TmStatus, 'cancelled'>; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

function BoardCard({ task }: { task: TmTask }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform) };
  const owner = task.owners[0];
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-testid={`tm-board-card-${task.id}`}
      className={`overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] touch-none ${isDragging ? 'opacity-70' : ''}`}
    >
      <Link href={`/admin/tasks/t/${task.id}`} className="flex no-underline text-inherit" onClick={(e) => isDragging && e.preventDefault()}>
        <span className="w-1.5 shrink-0" style={{ background: task.folder_color || '#8A8A8A' }} aria-hidden />
        <span className="min-w-0 flex-1 px-3 py-2.5">
          <span className="block text-sm font-medium leading-snug text-[#f4f1ea]">{task.title}</span>
          <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className={task.overdue ? 'text-[#E24B4A]' : 'text-white/40'}>
              {formatDue(task.due_date, task.due_time)}
            </span>
            {owner && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2a2a2a] text-[9px] font-semibold text-[#C6A664]">
                {initials(owner.full_name)}
              </span>
            )}
          </span>
        </span>
      </Link>
    </div>
  );
}

function Column({ id, label, tasks }: { id: string; label: string; tasks: TmTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      data-testid={`tm-board-col-${id}`}
      className={`min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-[#101010] p-2 ${isOver ? 'ring-1 ring-[#C6A664]' : ''}`}
    >
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label} <span className="text-white/25">{tasks.length}</span>
      </p>
      <div className="space-y-2">
        {tasks.length === 0 ? <TmEmpty>Nothing here</TmEmpty> : tasks.map((t) => <BoardCard key={t.id} task={t} />)}
      </div>
    </section>
  );
}

export function BoardView() {
  const { markFetchFailed } = useTasks();
  const [cols, setCols] = useState<{ open: TmTask[]; in_progress: TmTask[]; done: TmTask[] } | null>(null);
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

  async function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : '';
    const id = String(e.active.id);
    if (!over || !COLS.some((c) => c.id === over)) return;
    const current = cols && (['open', 'in_progress', 'done'] as const).find((k) => cols[k].some((t) => t.id === id));
    if (current === over) return;
    const res = await tmSetStatus(id, over as Exclude<TmStatus, 'cancelled'>);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await load();
  }

  return (
    <div data-testid="tm-board">
      <h1 className="tm-display mb-4 text-3xl">Board</h1>
      {!cols ? (
        <TmSkeleton rows={6} />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex flex-col gap-3 md:flex-row">
            {COLS.map((c) => (
              <Column key={c.id} id={c.id} label={c.label} tasks={cols[c.id]} />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
