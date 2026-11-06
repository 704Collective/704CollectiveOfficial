'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tmListGoals } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { GoalBar, GoalTags, goalBarFill, goalDueLabel, goalIsOverdue } from '@/components/tasks/GoalBar';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import type { TmGoal } from '@/lib/tasks/types';

function GoalCard({ goal, nested }: { goal: TmGoal; nested?: boolean }) {
  return (
    <Link
      href={`/admin/tasks/goals/${goal.id}`}
      data-testid={`tm-goal-${goal.id}`}
      data-tm-pct={goal.pct}
      data-tm-got={goal.got}
      data-tm-total={goal.total}
      className={`block rounded-xl border border-white/[0.06] bg-[#141414] p-4 no-underline text-inherit ${nested ? 'ml-4' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium">{goal.name}</p>
          <p className="text-xs text-white/40">{goalDueLabel(goal)}</p>
          <GoalTags tags={(goal.tags ?? []).filter((tag) => tag !== 'Overdue' || goalIsOverdue(goal))} />
        </div>
        <p className="tm-display text-2xl text-[#C6A664]">{Math.round(goal.pct)}%</p>
      </div>
      <div className="mt-3">
        <GoalBar pct={goal.pct} color={goalBarFill(goal)} got={goal.got} total={goal.total} />
      </div>
    </Link>
  );
}

export function GoalsView() {
  const { isSuper, markFetchFailed } = useTasks();
  const [goals, setGoals] = useState<TmGoal[] | null>(null);

  useEffect(() => {
    void tmListGoals().then((res) => {
      if (!res.ok) {
        markFetchFailed();
        return;
      }
      setGoals(res.data);
    });
  }, [markFetchFailed]);

  return (
    <div data-testid="tm-goals">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Goals</p>
          <h1 className="tm-display mt-1 text-3xl">Goals</h1>
        </div>
        {isSuper && (
          <Link
            href="/admin/tasks/goals/new"
            data-testid="tm-goal-new"
            className="rounded-lg bg-[#C6A664] px-3 py-2 text-sm font-semibold text-black no-underline"
          >
            New goal
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {goals === null ? (
          <TmSkeleton />
        ) : goals.length === 0 ? (
          <TmEmpty>No goals yet.</TmEmpty>
        ) : (
          goals.map((g) => (
          <div key={g.id} className="space-y-2">
            <GoalCard goal={g} />
            {(g.children ?? []).map((c) => (
              <GoalCard key={c.id} goal={c} nested />
            ))}
          </div>
          ))
        )}
      </div>
    </div>
  );
}
