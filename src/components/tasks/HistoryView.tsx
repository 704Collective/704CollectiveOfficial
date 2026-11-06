'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { tmGoalReopen, tmListHistory, tmListHistoryGoals } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { Button } from '@/components/ui/button';
import type { TmHistoryGoal, TmHistoryPeriod } from '@/lib/tasks/types';

const KINDS = ['week', 'month', 'quarter', 'year'] as const;

export function pctColor(pct: number) {
  if (pct >= 80) return '#4CAF50';
  if (pct >= 50) return '#C6A664';
  return '#E24B4A';
}

export function formatPeriod(kind: string, starts: string, ends: string) {
  const s = new Date(`${starts}T12:00:00`);
  const e = new Date(`${ends}T12:00:00`);
  const mon = (d: Date) => d.toLocaleString('en-US', { month: 'short' });
  if (kind === 'week') return `${mon(s)} ${s.getDate()} - ${mon(e)} ${e.getDate()}`;
  if (kind === 'month') return s.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (kind === 'quarter') return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
  return String(s.getFullYear());
}

export function HistoryGoals({
  goals,
  isSuper,
  onReopen,
}: {
  goals: TmHistoryGoal[];
  isSuper: boolean;
  onReopen: (goalId: string) => void;
}) {
  if (goals.length === 0) {
    return <p className="text-sm text-white/40">No closed goals yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {goals.map((g) => (
        <li
          key={g.id}
          data-testid={`tm-history-goal-${g.goal_id}`}
          data-tm-goal-status={g.status}
          className={`rounded-xl border border-white/[0.06] p-3 ${g.status === 'cancelled' ? 'opacity-60' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{g.name}</p>
              <p className="text-xs uppercase tracking-wide text-white/40">{g.status}</p>
              {g.reason && <p className="mt-1 text-xs text-white/45">{g.reason}</p>}
              {(g.lines ?? []).map((line) => (
                <p key={line} className="mt-1 text-xs text-white/45">{line}</p>
              ))}
            </div>
            <span className="tm-display text-xl" style={{ color: pctColor(Number(g.pct) || 0) }}>
              {Math.round(Number(g.pct) || 0)}%
            </span>
          </div>
          {isSuper && (g.status === 'failed' || g.status === 'completed') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              data-testid={`tm-history-reopen-${g.goal_id}`}
              onClick={() => onReopen(g.goal_id)}
            >
              Reopen
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HistoryView() {
  const { isSuper, markFetchFailed } = useTasks();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('week');
  const [rows, setRows] = useState<TmHistoryPeriod[]>([]);
  const [goals, setGoals] = useState<TmHistoryGoal[]>([]);

  async function load(next = kind) {
    const [periods, closed] = await Promise.all([tmListHistory(next), tmListHistoryGoals()]);
    if (!periods.ok) {
      markFetchFailed();
      return;
    }
    setRows(periods.data ?? []);
    if (closed.ok) setGoals(closed.data ?? []);
  }

  useEffect(() => {
    void load(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <div data-testid="tm-history">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">History</p>
      <h1 className="tm-display mb-4 mt-1 text-3xl">History</h1>
      <div className="mb-4 flex flex-wrap gap-2" data-testid="tm-history-kinds">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`tm-history-kind-${k}`}
            className={`rounded-full px-3 py-1 text-xs capitalize ${kind === k ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-white/40">No cards yet.</p>}
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/admin/tasks/history/${p.id}`}
            data-testid={`tm-history-card-${p.kind}-${p.starts}`}
            data-tm-provisional={p.provisional ? 'true' : 'false'}
            className="block rounded-xl border border-white/[0.06] bg-[#141414] p-4 no-underline text-inherit"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{formatPeriod(p.kind, p.starts, p.ends)}</p>
                <p className="mt-1 text-xs text-white/45">
                  {p.done} done · {p.missed} missed · {p.cancelled} cancelled
                </p>
                {p.note && <p className="mt-1 line-clamp-2 text-xs text-white/50">{p.note}</p>}
                {p.provisional && <span className="tm-chip tm-chip-soon mt-2">Provisional</span>}
              </div>
              <span className="tm-display text-3xl" style={{ color: pctColor(Number(p.pct) || 0) }}>
                {Math.round(Number(p.pct) || 0)}%
              </span>
            </div>
            {isSuper && p.kind === 'month' && (p.people ?? []).length > 0 && (
              <ul className="mt-3 space-y-1" data-testid={`tm-history-people-${p.id}`}>
                {p.people.map((person) => (
                  <li key={person.profile_id} className="flex justify-between text-xs text-white/55">
                    <span>{person.full_name ?? 'Someone'}</span>
                    <span>On-time {Math.round(Number(person.pct) || 0)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Link>
        ))}
      </div>
      <section className="mt-8" data-testid="tm-history-goals">
        <h2 className="mb-3 text-sm font-semibold">Goals</h2>
        <HistoryGoals
          goals={goals}
          isSuper={isSuper}
          onReopen={(id) => {
            void tmGoalReopen(id).then((res) => {
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
