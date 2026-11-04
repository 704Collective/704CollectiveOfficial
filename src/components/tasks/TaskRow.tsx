'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDue } from '@/lib/tasks/dates';
import type { TmTask } from '@/lib/tasks/types';

function initials(name: string | null | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function TaskRow({
  task,
  showFolder,
  selected,
  onSelect,
  onFix,
}: {
  task: TmTask;
  showFolder: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onFix?: (task: TmTask) => void;
}) {
  const statusClass = task.status === 'done'
    ? 'is-done'
    : task.overdue
      ? 'is-overdue'
      : task.status === 'in_progress'
        ? 'is-progress'
        : '';
  const folderLabel = task.parent_folder_name
    ? `${task.parent_folder_name} / ${task.folder_name}`
    : task.folder_name;
  const goal = task.goals[0];
  const [swiped, setSwiped] = useState(false);

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onTouchStart={(e) => {
        (e.currentTarget as HTMLElement).dataset.x = String(e.changedTouches[0]?.clientX ?? 0);
      }}
      onTouchEnd={(e) => {
        const start = Number((e.currentTarget as HTMLElement).dataset.x ?? 0);
        const end = e.changedTouches[0]?.clientX ?? start;
        if (onFix && start - end > 56) {
          setSwiped(true);
          onFix(task);
        } else if (end - start > 24) {
          setSwiped(false);
        }
      }}
    >
    {onSelect && (
      <label className="absolute left-2 top-3 z-10">
        <input
          type="checkbox"
          data-testid={`tm-select-${task.id}`}
          checked={!!selected}
          onChange={() => onSelect(task.id)}
        />
      </label>
    )}
    <Link
      href={`/admin/tasks/t/${task.id}`}
      data-testid={`tm-task-row-${task.id}`}
      data-tm-title={task.title}
      className={`flex overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414] no-underline text-inherit transition-transform ${onSelect ? 'pl-6' : ''} ${task.status === 'cancelled' ? 'opacity-50' : ''} ${swiped && onFix ? '-translate-x-16' : ''}`}
    >
      <span className="w-1.5 shrink-0" style={{ background: task.folder_color || '#8A8A8A' }} aria-hidden />
      <span className="flex min-w-0 flex-1 gap-3 px-3 py-3">
        <span className={`tm-status mt-0.5 ${statusClass}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-[#f4f1ea]">{task.title}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {task.overdue && <span className="tm-chip tm-chip-overdue">Overdue</span>}
            {task.due_soon && !task.overdue && <span className="tm-chip tm-chip-soon">Due soon</span>}
            {!task.due_date && task.status !== 'done' && <span className="tm-chip tm-chip-muted">No date</span>}
            {!task.counts && <span className="tm-chip tm-chip-muted">Not counted</span>}
            {task.repeat !== 'none' && <span className="tm-chip tm-chip-muted">{task.repeat}</span>}
            {task.event_name && <span className="tm-chip tm-chip-muted" data-testid={`tm-event-chip-${task.id}`}>Event: {task.event_name}</span>}
            {task.pushed_count > 0 && (
              <span className="tm-chip tm-chip-muted" data-testid={`tm-pushed-${task.id}`}>
                Pushed {task.pushed_count}x
              </span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/45">
            <span>{formatDue(task.due_date, task.due_time)}</span>
            {showFolder && folderLabel && (
              <span data-testid={`tm-folder-label-${task.id}`}>{folderLabel}</span>
            )}
            {goal && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: goal.color || '#8A8A8A' }} />
                {goal.name}
              </span>
            )}
            {task.counts && (
              <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/60">
                {task.size}
              </span>
            )}
            <span className="ml-auto inline-flex -space-x-1.5">
              {task.owners.slice(0, 3).map((o) => (
                <span
                  key={o.id}
                  title={o.full_name ?? ''}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#141414] bg-[#2a2a2a] text-[9px] font-semibold text-[#C6A664]"
                >
                  {o.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    initials(o.full_name)
                  )}
                </span>
              ))}
            </span>
          </span>
        </span>
      </span>
    </Link>
    {onFix && (
      <button
        type="button"
        data-testid={`tm-row-fix-${task.id}`}
        className="absolute inset-y-0 right-0 w-16 bg-[#E24B4A] text-xs font-semibold text-white"
        onClick={() => onFix(task)}
      >
        Fix it
      </button>
    )}
    </div>
  );
}

export function TaskGroup({
  title,
  tasks,
  showFolder,
  empty,
  selected,
  onSelect,
  onFix,
}: {
  title?: string;
  tasks: TmTask[];
  showFolder: boolean;
  empty?: string;
  selected?: string[];
  onSelect?: (id: string) => void;
  onFix?: (task: TmTask) => void;
}) {
  if (!tasks.length && !empty) return null;
  return (
    <div className="space-y-2">
      {title && <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">{title}</p>}
      {tasks.length === 0 ? (
        <p className="px-1 text-sm text-white/35">{empty}</p>
      ) : (
        tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            showFolder={showFolder}
            selected={selected?.includes(t.id)}
            onSelect={onSelect}
            onFix={onFix}
          />
        ))
      )}
    </div>
  );
}
