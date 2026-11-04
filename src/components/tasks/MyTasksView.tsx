'use client';

import { useEffect, useMemo, useState } from 'react';
import { tmListMyTasks } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TaskGroup } from '@/components/tasks/TaskRow';
import { FixItSheet } from '@/components/tasks/FixItSheet';
import { SavedFilterChips } from '@/components/tasks/SearchSheet';
import { TmSkeleton } from '@/components/tasks/uiBits';
import { Button } from '@/components/ui/button';
import type { TmBucket, TmMyTasks, TmTask } from '@/lib/tasks/types';

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
  const [picked, setPicked] = useState<string[]>([]);
  const [fixTasks, setFixTasks] = useState<TmTask[]>([]);

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
      <SavedFilterChips onPick={() => undefined} />
      <div className="mb-5 flex flex-wrap gap-2">
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
        <TmSkeleton />
      ) : (
        <>
        <div className="space-y-6">
          {bucket === 'overdue' && (
            <div className="flex justify-end">
              <Button
                type="button"
                data-testid="tm-fix-many"
                variant="outline"
                disabled={picked.length === 0}
                onClick={() => {
                  const all = [...(group?.counted ?? []), ...(group?.not_counted ?? [])];
                  setFixTasks(all.filter((t) => picked.includes(t.id)));
                }}
              >
                Fix many{picked.length ? ` · ${picked.length}` : ''}
              </Button>
            </div>
          )}
          <TaskGroup
            tasks={group?.counted ?? []}
            showFolder={isSuper}
            empty="Nothing here."
            selected={bucket === 'overdue' ? picked : undefined}
            onSelect={bucket === 'overdue' ? (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])) : undefined}
            onFix={bucket === 'overdue' ? (t) => setFixTasks([t]) : undefined}
          />
          {(group?.not_counted.length ?? 0) > 0 && (
            <TaskGroup
              title="Not counted"
              tasks={group?.not_counted ?? []}
              showFolder={isSuper}
              selected={bucket === 'overdue' ? picked : undefined}
              onSelect={bucket === 'overdue' ? (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])) : undefined}
              onFix={bucket === 'overdue' ? (t) => setFixTasks([t]) : undefined}
            />
          )}
        </div>
        <FixItSheet
          open={fixTasks.length > 0}
          onOpenChange={(o) => !o && setFixTasks([])}
          tasks={fixTasks}
          onDone={() => {
            setPicked([]);
            void tmListMyTasks().then((res) => {
              if (res.ok) setData(res.data);
            });
          }}
        />
        </>
      )}
    </div>
  );
}
