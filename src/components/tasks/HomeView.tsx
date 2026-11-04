'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tmListMyTasks, tmListNeedsHome } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TaskGroup } from '@/components/tasks/TaskRow';
import type { TmTask } from '@/lib/tasks/types';

export function HomeView() {
  const { boot, isSuper, markFetchFailed } = useTasks();
  const [today, setToday] = useState<TmTask[]>([]);
  const [overdue, setOverdue] = useState<TmTask[]>([]);
  const [homeless, setHomeless] = useState<TmTask[]>([]);
  const first = (boot?.full_name ?? 'there').split(' ')[0];

  useEffect(() => {
    void tmListMyTasks().then((res) => {
      if (!res.ok) {
        markFetchFailed();
        return;
      }
      setToday([...res.data.today.counted, ...res.data.today.not_counted]);
      setOverdue([...res.data.overdue.counted, ...res.data.overdue.not_counted]);
    });
    if (isSuper) {
      void tmListNeedsHome().then((res) => {
        if (res.ok) setHomeless(res.data);
      });
    }
  }, [isSuper, markFetchFailed]);

  return (
    <div data-testid="tm-home">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Home</p>
      <h1 className="tm-display mb-6 mt-1 text-3xl">Hey {first}.</h1>
      {overdue.length > 0 && (
        <Link
          href="/admin/tasks/my"
          className="mb-5 block rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-3 no-underline"
        >
          <p className="text-sm font-semibold text-[#ffb4b0]">{overdue.length} overdue</p>
          <p className="text-xs text-white/45">Open My Tasks to fix them.</p>
        </Link>
      )}
      <div className="space-y-6">
        <TaskGroup title="Today" tasks={today.slice(0, 5)} showFolder={isSuper} empty="Nothing due today." />
        {isSuper && homeless.length > 0 && (
          <TaskGroup title="Needs a home" tasks={homeless.slice(0, 5)} showFolder={false} />
        )}
      </div>
    </div>
  );
}
