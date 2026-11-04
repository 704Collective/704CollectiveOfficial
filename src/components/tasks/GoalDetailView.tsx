'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  tmCancelGoal,
  tmCompleteGoal,
  tmCreateTask,
  tmDeleteGoal,
  tmGetGoal,
  tmLogGoalProgress,
  tmMoveAllGoalTasks,
  tmSetGoalCountsTimeBars,
  tmSetGoals,
} from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { ConfettiBurst } from '@/components/tasks/ConfettiBurst';
import { GoalBar, GoalTags, goalDueLabel } from '@/components/tasks/GoalBar';
import { TaskGroup } from '@/components/tasks/TaskRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { TmGoalDetail } from '@/lib/tasks/types';

export function GoalDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { boot, isSuper, markFetchFailed, refresh } = useTasks();
  const [goal, setGoal] = useState<TmGoalDetail | null>(null);
  const [delta, setDelta] = useState('3');
  const [note, setNote] = useState('');
  const [confetti, setConfetti] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function load() {
    const res = await tmGetGoal(id);
    if (!res.ok) {
      markFetchFailed();
      return;
    }
    setGoal(res.data);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!goal) return <p className="text-sm text-white/35">Loading…</p>;
  const row = goal;

  const ready = (row.tags ?? []).includes('Ready to complete');
  const overdue = (row.tags ?? []).includes('Overdue');
  const closed = row.status === 'completed';

  async function complete() {
    const res = await tmCompleteGoal(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setConfetti(true);
    toast.success('Goal complete');
    await load();
    void refresh();
  }

  async function addTask() {
    const res = await tmCreateTask({ title: `New task for ${row.name}` });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const attached = await tmSetGoals(res.data.id, [row.id]);
    if (!attached.ok) {
      toast.error(attached.error);
      return;
    }
    toast.success('Task added');
    await load();
  }

  async function log() {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) return;
    const res = await tmLogGoalProgress(row.id, n, note);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setGoal(res.data);
    setNote('');
    toast.success('Progress logged');
  }

  return (
    <div data-testid="tm-goal-detail" data-tm-pct={goal.pct} data-tm-status={goal.status}>
      <ConfettiBurst show={confetti} />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Goal</p>
      <h1 className="tm-display mt-1 text-3xl">{goal.name}</h1>
      <p className="text-sm text-white/40">{goalDueLabel(goal)}</p>
      <GoalTags tags={goal.tags ?? []} />
      <p className="tm-display mt-6 text-6xl text-[#C6A664]" data-testid="tm-goal-pct">{Math.round(goal.pct)}%</p>
      <GoalBar pct={goal.pct} color={goal.color} got={goal.got} total={goal.total} testId="tm-goal-bar" />

      {overdue && (
        <div className="mt-4 rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-3" data-testid="tm-goal-overdue">
          <p className="text-sm font-semibold text-[#ffb4b0]">Overdue</p>
          <p className="text-xs text-white/45">Extend / Leave as failed / Cancel goal land in Wave 4.</p>
        </div>
      )}

      {ready && isSuper && !closed && (
        <Button data-testid="tm-goal-complete" className="mt-4 bg-[#C6A664] text-black" onClick={() => void complete()}>
          Mark complete
        </Button>
      )}
      {closed && <p className="mt-4 text-sm text-[#C6A664]" data-testid="tm-goal-closed">Closed to new tasks</p>}

      {goal.kind === 'number' && (
        <section className="mt-8">
          <h2 className="tm-display text-xl">Number goal</h2>
          <p className="mt-1 text-sm text-white/50">
            Fills from {goal.number_source ?? 'manual'}
            {goal.number_unit ? ` · ${goal.number_unit}` : ''}
          </p>
          {isSuper && (
            <label className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] px-4 py-3 text-sm">
              Counts toward time bars
              <input
                data-testid="tm-goal-counts-bars"
                type="checkbox"
                checked={goal.counts_time_bars}
                onChange={(e) => {
                  void tmSetGoalCountsTimeBars(row.id, e.target.checked, row.size ?? 'XL').then((r) => {
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    return load();
                  });
                }}
              />
            </label>
          )}
          <div className="mt-4 flex gap-2">
            <Input data-testid="tm-goal-log-delta" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-24 border-white/10 bg-[#1a1a1a]" />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="border-white/10 bg-[#1a1a1a]" />
            <Button type="button" data-testid="tm-goal-log" variant="outline" onClick={() => void log()}>Log progress</Button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-white/40" data-testid="tm-goal-log-list">
            {(goal.log ?? []).map((l) => (
              <li key={l.id}>{l.delta > 0 ? '+' : ''}{l.delta} · {l.note ?? '—'} · {l.logged_by_name}</li>
            ))}
          </ul>
        </section>
      )}

      {(goal.children ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="tm-display text-xl">Sub-goals</h2>
          <div className="mt-3 space-y-2">
            {goal.children!.map((c) => (
              <Link key={c.id} href={`/admin/tasks/goals/${c.id}`} className="block rounded-xl border border-white/[0.06] p-3 no-underline text-inherit">
                <div className="flex justify-between"><span>{c.name}</span><span>{Math.round(c.pct)}%</span></div>
                <GoalBar pct={c.pct} color={c.color} got={c.got} total={c.total} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 space-y-6">
        <TaskGroup title="Counted" tasks={goal.counted_tasks ?? []} showFolder={isSuper} empty="No counted tasks." />
        <TaskGroup title="Not counted" tasks={goal.not_counted_tasks ?? []} showFolder={isSuper} empty="None." />
      </section>

      {isSuper && (
        <div className="mt-8 space-y-2">
          {!closed && (
            <Button type="button" data-testid="tm-goal-add-task" variant="outline" className="w-full" onClick={() => void addTask()}>
              Add a task
            </Button>
          )}
          <Link href={`/admin/tasks/goals/${goal.id}/edit`} className="block text-center text-sm text-[#C6A664]">Edit</Link>
          <Button type="button" variant="outline" className="w-full" onClick={() => setCancelOpen(true)}>Cancel goal</Button>
          <Button type="button" variant="outline" className="w-full text-[#E24B4A]" onClick={() => setMoveOpen(true)}>Delete…</Button>
        </div>
      )}

      <AlertDialog open={moveOpen} onOpenChange={setMoveOpen}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Move tasks then delete</AlertDialogTitle>
          </AlertDialogHeader>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm">
            <option value="">Move all to…</option>
            {(boot?.goals ?? []).filter((g) => g.id !== row.id).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  if (moveTo) {
                    const moved = await tmMoveAllGoalTasks(row.id, moveTo);
                    if (!moved.ok) {
                      toast.error(moved.error);
                      return;
                    }
                  }
                  const del = await tmDeleteGoal(row.id);
                  if (!del.ok) {
                    toast.error(del.error);
                    return;
                  }
                  toast.success('Deleted');
                  router.push('/admin/tasks/goals');
                })();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this goal?</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="border-white/10 bg-[#1a1a1a]" />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void tmCancelGoal(row.id, reason || 'Cancelled').then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Cancelled');
                  router.push('/admin/tasks/goals');
                });
              }}
            >
              Cancel goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
