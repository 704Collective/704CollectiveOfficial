'use client';

import { useEffect, useMemo, useState } from 'react';
import { tmListMyTasks } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TaskGroup } from '@/components/tasks/TaskRow';
import type { TmBucket, TmMyTasks } from '@/lib/tasks/types';

const BUCKETS: { id: TmBucket; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'later', label: 'Later' },
  { id: 'no_date', label: 'No date' },
  { id: 'done', label: 'Done' },
];

function countGroup(g: { counted: unknown[]; not_counted: unknown[] }) {
  return g.counted.length + g.not_counted.length;
}

export function MyTasksView() {
  const { isSuper, markFetchFailed } = useTasks();
  const [data, setData] = useState<TmMyTasks | null>(null);
  const [bucket, setBucket] = useState<TmBucket>('today');

  useEffect(() => {
    void tmListMyTasks().then((res) => {
      if (!res.ok) {
        markFetchFailed();
        return;
      }
      setData(res.data);
      const first = BUCKETS.find((b) => countGroup(res.data[b.id]) > 0);
      if (first) setBucket(first.id);
    });
  }, [markFetchFailed]);

  const group = data?.[bucket];
  const counts = useMemo(() => {
    if (!data) return {} as Record<TmBucket, number>;
    return Object.fromEntries(BUCKETS.map((b) => [b.id, countGroup(data[b.id])])) as Record<TmBucket, number>;
  }, [data]);

  return (
    <div data-testid="tm-my-tasks">
      <h1 className="tm-display mb-4 text-3xl">My Tasks</h1>
      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`tm-bucket-${b.id === 'this_week' ? 'week' : b.id === 'no_date' ? 'nodate' : b.id}`}
            onClick={() => setBucket(b.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              bucket === b.id ? 'bg-[#C6A664] text-black' : 'bg-white/8 text-white/65'
            }`}
          >
            {b.label}
            {!!counts[b.id] && <span className="ml-1 text-[11px] opacity-70">{counts[b.id]}</span>}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="text-sm text-white/35">Loading…</p>
      ) : (
        <div className="space-y-6">
          <TaskGroup tasks={group?.counted ?? []} showFolder={isSuper} empty="Nothing here." />
          {(group?.not_counted.length ?? 0) > 0 && (
            <TaskGroup title="Not counted" tasks={group?.not_counted ?? []} showFolder={isSuper} />
          )}
        </div>
      )}
    </div>
  );
}
