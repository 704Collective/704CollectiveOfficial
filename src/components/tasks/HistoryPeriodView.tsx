'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { tmGetHistoryPeriod, tmGoalReopen, tmListHistoryGoals, tmSetPeriodNote } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { HistoryGoals, formatPeriod, pctColor } from '@/components/tasks/HistoryView';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatShortDate } from '@/lib/tasks/dates';
import { chipName, firstName } from '@/lib/tasks/names';
import type { TmHistoryGoal, TmHistoryPeriod, TmHistoryTask } from '@/lib/tasks/types';

const SECTIONS: { key: TmHistoryTask['outcome']; title: string; testId: string; grey?: boolean }[] = [
  { key: 'done_on_time', title: 'Done on time', testId: 'tm-hist-done-on-time' },
  { key: 'done_late', title: 'Done late', testId: 'tm-hist-done-late' },
  { key: 'missed', title: 'Missed', testId: 'tm-hist-missed' },
  { key: 'cancelled', title: 'Cancelled', testId: 'tm-hist-cancelled', grey: true },
];

function outcomeLine(task: TmHistoryTask): string | null {
  if (task.what_happened_after) return task.what_happened_after;
  if (task.outcome === 'missed') return 'Still open';
  if (task.outcome === 'done_late') {
    return `Done late ${formatShortDate(task.due_date) || ''}`.trim();
  }
  return null;
}

export function HistoryPeriodView({ id }: { id: string }) {
  const { isSuper, boot, markFetchFailed } = useTasks();
  const [period, setPeriod] = useState<TmHistoryPeriod | null>(null);
  const [goals, setGoals] = useState<TmHistoryGoal[]>([]);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [person, setPerson] = useState<string | 'everyone'>('everyone');
  const [goal, setGoal] = useState<string | 'all'>('all');
  const [folder, setFolder] = useState<string | 'all'>('all');

  async function load() {
    const [res, closed] = await Promise.all([tmGetHistoryPeriod(id), tmListHistoryGoals()]);
    if (!res.ok) {
      markFetchFailed();
      return;
    }
    setPeriod(res.data);
    setNote(res.data.note ?? '');
    if (closed.ok) setGoals(closed.data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tasks = useMemo(() => {
    const rows = period?.tasks ?? [];
    return rows.filter((t) => {
      if (person !== 'everyone' && !(t.owner_ids ?? []).includes(person)) return false;
      if (goal !== 'all' && !(t.goals ?? []).some((g) => g.id === goal)) return false;
      if (folder !== 'all' && t.folder !== folder && t.folder_id !== folder) return false;
      return true;
    });
  }, [period, person, goal, folder]);

  if (!period) return <p className="text-sm text-white/35">Loading…</p>;

  const counted = tasks.filter((t) => t.counts && t.outcome !== 'open_carried');
  const notCounted = tasks.filter((t) => !t.counts);
  const goalsInTasks = Array.from(new Map((period.tasks ?? []).flatMap((t) => t.goals ?? []).map((g) => [g.id, g])).values());
  const foldersInTasks = Array.from(
    new Map(
      (period.tasks ?? [])
        .filter((t) => t.folder)
        .map((t) => [t.folder_id ?? t.folder, { id: t.folder_id ?? t.folder!, name: t.folder! }])
    ).values()
  );

  const personChip = person === 'everyone' ? null : chipName(period.people.find((p) => p.profile_id === person) ?? { full_name: 'Someone' }, period.people);
  const goalChip = goal === 'all' ? null : goalsInTasks.find((g) => g.id === goal)?.name ?? null;
  const folderChip = folder === 'all' ? null : foldersInTasks.find((f) => f.id === folder)?.name ?? folder;

  function TaskBlock({ task, grey }: { task: TmHistoryTask; grey?: boolean }) {
    const after = outcomeLine(task);
    return (
      <li
        data-testid={`tm-hist-task-${task.id}`}
        data-tm-outcome={task.outcome}
        className={`rounded-xl border border-white/[0.06] px-3 py-2 ${grey ? 'opacity-50' : ''}`}
      >
        <p className="text-sm font-medium">{task.title}</p>
        <p className="mt-1 text-xs text-white/45">
          {(task.owners ?? []).map((o) => o.full_name ?? 'Someone').join(', ') || 'Unassigned'}
          {task.goals?.[0] ? ` · ${task.goals.map((g) => g.name).join(', ')}` : ''}
          {isSuper && task.folder ? ` · ${task.folder}` : ''}
        </p>
        {task.outcome === 'cancelled' && task.reason && (
          <p className="text-xs text-white/40" data-testid={`tm-hist-reason-${task.id}`}>{task.reason}</p>
        )}
        {task.outcome === 'missed' && (
          <>
            {task.reason && <p className="text-xs text-white/40" data-testid={`tm-hist-reason-${task.id}`}>{task.reason}</p>}
            {after && <p className="text-xs text-[#C6A664]" data-testid={`tm-hist-after-${task.id}`}>{after}</p>}
          </>
        )}
        {task.outcome === 'done_late' && after && (
          <p className="text-xs text-[#C6A664]" data-testid={`tm-hist-after-${task.id}`}>{after}</p>
        )}
      </li>
    );
  }

  return (
    <div data-testid="tm-history-detail">
      <Link href="/admin/tasks/history" className="text-xs text-white/40 no-underline">← History</Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/35">{period.kind}</p>
          <h1 className="tm-display text-3xl">{formatPeriod(period.kind, period.starts, period.ends)}</h1>
          <p className="mt-1 text-sm text-white/45">
            {period.done} done · {period.missed} missed · {period.cancelled} cancelled
          </p>
          {period.provisional && <span className="tm-chip tm-chip-soon mt-2">Provisional</span>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="tm-display text-4xl" style={{ color: pctColor(Number(period.pct) || 0) }}>
            {Math.round(Number(period.pct) || 0)}%
          </span>
          <Button type="button" size="sm" variant="outline" data-testid="tm-hist-filter-open" onClick={() => setFilterOpen(true)}>
            Filter
          </Button>
        </div>
      </div>

      {(personChip || goalChip || folderChip) && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="tm-hist-active-chips">
          {personChip && (
            <button type="button" className="rounded-full bg-[#C6A664] px-3 py-1 text-xs text-black" onClick={() => setPerson('everyone')}>
              {personChip} ×
            </button>
          )}
          {goalChip && (
            <button type="button" className="rounded-full bg-[#C6A664] px-3 py-1 text-xs text-black" onClick={() => setGoal('all')}>
              {goalChip} ×
            </button>
          )}
          {folderChip && (
            <button type="button" className="rounded-full bg-[#C6A664] px-3 py-1 text-xs text-black" onClick={() => setFolder('all')}>
              {folderChip} ×
            </button>
          )}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {SECTIONS.map((sec) => {
          const list = counted.filter((t) => t.outcome === sec.key);
          if (!list.length) return null;
          return (
            <section key={sec.key} data-testid={sec.testId}>
              <h2 className="mb-2 text-sm font-semibold">{sec.title} · {list.length}</h2>
              <ul className="space-y-2">
                {list.map((t) => <TaskBlock key={t.id} task={t} grey={sec.grey} />)}
              </ul>
            </section>
          );
        })}
        {notCounted.length > 0 && (
          <section data-testid="tm-hist-not-counted">
            <h2 className="mb-2 text-sm font-semibold">Not counted · {notCounted.length}</h2>
            <ul className="space-y-2">
              {notCounted.map((t) => <TaskBlock key={t.id} task={t} />)}
            </ul>
          </section>
        )}
      </div>

      {isSuper && (period.people ?? []).length > 0 && (
        <section className="mt-8" data-testid="tm-history-ontime">
          <h2 className="mb-2 text-sm font-semibold">On-time %</h2>
          <ul className="space-y-1">
            {period.people.map((p) => (
              <li key={p.profile_id} className="flex justify-between text-sm text-white/70">
                <span>{p.full_name ?? 'Someone'}</span>
                <span>{Math.round(Number(p.pct) || 0)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" data-testid="tm-history-goals">
        <h2 className="mb-3 text-sm font-semibold">Goals</h2>
        <HistoryGoals
          goals={goals}
          isSuper={isSuper}
          onReopen={(goalId) => {
            void tmGoalReopen(goalId).then((res) => {
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success('Reopened');
              return load();
            });
          }}
        />
      </section>

      <section className="mt-8" data-testid="tm-history-note">
        {isSuper ? (
          editingNote || period.note ? (
            <div className="space-y-2">
              <Input
                data-testid="tm-history-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Period note"
                className="border-white/10 bg-[#1a1a1a]"
                onFocus={() => setEditingNote(true)}
              />
              <Button
                type="button"
                data-testid="tm-history-note-save"
                className="bg-[#C6A664] text-black"
                onClick={() => {
                  void tmSetPeriodNote(period.id, note).then((res) => {
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success('Note saved');
                    setEditingNote(false);
                    return load();
                  });
                }}
              >
                Save note
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" data-testid="tm-history-note-add" onClick={() => setEditingNote(true)}>
              Add note
            </Button>
          )
        ) : (
          <p className="text-sm text-white/50">{period.note || 'No note.'}</p>
        )}
      </section>

      <ViewportSheet open={filterOpen} onOpenChange={setFilterOpen} testId="tm-hist-filter-sheet">
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-4">
          <p className="tm-display mb-4 text-xl">Filter</p>
          {isSuper && (
            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-white/40">People</span>
              <select
                data-testid="tm-hist-filter-person"
                className="w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2"
                value={person}
                onChange={(e) => setPerson(e.target.value === 'everyone' ? 'everyone' : e.target.value)}
              >
                <option value="everyone">Everyone</option>
                {(period.people ?? []).map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>{chipName(p, period.people ?? [])}</option>
                ))}
              </select>
            </label>
          )}
          {!isSuper && (
            <p className="mb-4 text-sm text-white/50">{boot?.full_name ? firstName(boot.full_name) : 'You'}</p>
          )}
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-white/40">Goals</span>
            <select
              data-testid="tm-hist-filter-goal"
              className="w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2"
              value={goal}
              onChange={(e) => setGoal(e.target.value === 'all' ? 'all' : e.target.value)}
            >
              <option value="all">All goals</option>
              {goalsInTasks.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          {isSuper && (
            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-white/40">Folders</span>
              <select
                data-testid="tm-hist-filter-folder"
                className="w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2"
                value={folder}
                onChange={(e) => setFolder(e.target.value === 'all' ? 'all' : e.target.value)}
              >
                <option value="all">All folders</option>
                {foldersInTasks.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
          )}
          <Button type="button" className="mt-auto bg-[#C6A664] text-black" data-testid="tm-hist-filter-done" onClick={() => setFilterOpen(false)}>
            Done
          </Button>
        </div>
      </ViewportSheet>
    </div>
  );
}
