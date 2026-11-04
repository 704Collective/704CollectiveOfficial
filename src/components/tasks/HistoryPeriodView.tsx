'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { tmGetHistoryPeriod, tmGoalReopen, tmListHistoryGoals, tmSetPeriodNote } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { HistoryGoals, formatPeriod, pctColor } from '@/components/tasks/HistoryView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { chipName, firstName } from '@/lib/tasks/names';
import type { TmHistoryGoal, TmHistoryPeriod, TmHistoryTask } from '@/lib/tasks/types';

const SECTIONS: { key: TmHistoryTask['outcome']; title: string; testId: string; grey?: boolean }[] = [
  { key: 'done_on_time', title: 'Done on time', testId: 'tm-hist-done-on-time' },
  { key: 'done_late', title: 'Done late', testId: 'tm-hist-done-late' },
  { key: 'missed', title: 'Missed', testId: 'tm-hist-missed' },
  { key: 'cancelled', title: 'Cancelled', testId: 'tm-hist-cancelled', grey: true },
];

export function HistoryPeriodView({ id }: { id: string }) {
  const { isSuper, boot, markFetchFailed } = useTasks();
  const [period, setPeriod] = useState<TmHistoryPeriod | null>(null);
  const [goals, setGoals] = useState<TmHistoryGoal[]>([]);
  const [note, setNote] = useState('');
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
  const foldersInTasks = Array.from(new Set((period.tasks ?? []).map((t) => t.folder).filter(Boolean))) as string[];

  function TaskBlock({ task, grey }: { task: TmHistoryTask; grey?: boolean }) {
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
        {task.reason && <p className="text-xs text-white/40">{task.reason}</p>}
        {task.what_happened_after && (
          <p className="text-xs text-[#C6A664]" data-testid={`tm-hist-after-${task.id}`}>{task.what_happened_after}</p>
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
        <span className="tm-display text-4xl" style={{ color: pctColor(Number(period.pct) || 0) }}>
          {Math.round(Number(period.pct) || 0)}%
        </span>
      </div>

      <section className="mt-4" data-testid="tm-history-note">
        {isSuper ? (
          <div className="flex flex-wrap gap-2">
            <Input
              data-testid="tm-history-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Period note"
              className="border-white/10 bg-[#1a1a1a]"
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
                  return load();
                });
              }}
            >
              Save note
            </Button>
          </div>
        ) : (
          <p className="text-sm text-white/50">{period.note || 'No note.'}</p>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="tm-history-filters">
        {isSuper && (
          <>
            <button
              type="button"
              data-testid="tm-hist-filter-everyone"
              className={`rounded-full px-3 py-1 text-xs ${person === 'everyone' ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
              onClick={() => setPerson('everyone')}
            >
              Everyone
            </button>
            {(period.people ?? []).map((p) => (
              <button
                key={p.profile_id}
                type="button"
                data-testid={`tm-hist-filter-person-${p.profile_id}`}
                className={`rounded-full px-3 py-1 text-xs ${person === p.profile_id ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => setPerson(p.profile_id)}
              >
                {chipName(p, period.people ?? [])}
              </button>
            ))}
          </>
        )}
        {!isSuper && (
          <span className="rounded-full bg-white/8 px-3 py-1 text-xs">{boot?.full_name ? firstName(boot.full_name) : 'You'}</span>
        )}
        {goalsInTasks.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs ${goal === g.id ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
            onClick={() => setGoal((cur) => (cur === g.id ? 'all' : g.id))}
          >
            {g.name}
          </button>
        ))}
        {isSuper && foldersInTasks.map((f) => (
          <button
            key={f}
            type="button"
            className={`rounded-full px-3 py-1 text-xs ${folder === f ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
            onClick={() => setFolder((cur) => (cur === f ? 'all' : f))}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {SECTIONS.map((sec) => {
          const list = counted.filter((t) => t.outcome === sec.key);
          if (!list.length) return null;
          return (
            <section key={sec.key} data-testid={sec.testId}>
              <h2 className="mb-2 text-sm font-semibold">{sec.title}</h2>
              <ul className="space-y-2">
                {list.map((t) => <TaskBlock key={t.id} task={t} grey={sec.grey} />)}
              </ul>
            </section>
          );
        })}
        {notCounted.length > 0 && (
          <section data-testid="tm-hist-not-counted">
            <h2 className="mb-2 text-sm font-semibold">Not counted</h2>
            <ul className="space-y-2">
              {notCounted.map((t) => <TaskBlock key={t.id} task={t} />)}
            </ul>
          </section>
        )}
      </div>

      {isSuper && period.kind === 'month' && (period.people ?? []).length > 0 && (
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
    </div>
  );
}
