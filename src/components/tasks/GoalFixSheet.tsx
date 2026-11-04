'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { tmCancelGoal, tmGoalExtend, tmGoalFail } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TmGoal } from '@/lib/tasks/types';

const OPTIONS: { id: 'extend' | 'fail' | 'cancel'; title: string; blurb: string }[] = [
  { id: 'extend', title: 'Extend', blurb: 'Pick a new due date. Adds Pushed Nx.' },
  { id: 'fail', title: 'Leave as failed', blurb: 'Tasks stay attached. You can reopen later.' },
  { id: 'cancel', title: 'Cancel goal', blurb: 'Grey in History. Never missed, never in on-time %.' },
];

export function GoalFixSheet({
  open,
  onOpenChange,
  goal,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: TmGoal;
  onDone: () => void;
}) {
  const { boot } = useTasks();
  const reasons = boot?.reasons ?? [];
  const [action, setAction] = useState<(typeof OPTIONS)[number]['id'] | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setAction(null);
    setReason('');
    setNote('');
    setDue('');
  }

  async function apply() {
    if (!action) return;
    if (!reason) {
      toast.error('Pick a reason');
      return;
    }
    if (action === 'extend' && !due) {
      toast.error('Pick a new date');
      return;
    }
    setSaving(true);
    const why = note ? `${reason}${note.trim() ? ` · ${note.trim()}` : ''}` : reason;
    const res =
      action === 'extend'
        ? await tmGoalExtend(goal.id, due, why)
        : action === 'fail'
          ? await tmGoalFail(goal.id)
          : await tmCancelGoal(goal.id, why);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(action === 'extend' ? 'Extended' : action === 'fail' ? 'Left as failed' : 'Cancelled');
    reset();
    onOpenChange(false);
    onDone();
  }

  return (
    <ViewportSheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }} testId="tm-goal-fix-sheet">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pb-2 pt-4">
          <p className="tm-display text-xl">Fix it</p>
          <p className="text-sm text-white/45">{goal.name}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid={`tm-goal-fix-${o.id}`}
              onClick={() => setAction(o.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left ${
                action === o.id ? 'border-[#C6A664] bg-[#C6A664]/10' : 'border-white/10'
              }`}
            >
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-xs text-white/45">{o.blurb}</p>
            </button>
          ))}
          {action === 'extend' && (
            <Input
              data-testid="tm-goal-extend-date"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="border-white/10 bg-[#1a1a1a]"
            />
          )}
          {action && (
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  data-testid={`tm-goal-fix-reason-${r}`}
                  className={`rounded-full px-3 py-1 text-xs ${reason === r ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {action && (
            <Input
              data-testid="tm-goal-fix-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
              className="border-white/10 bg-[#1a1a1a]"
            />
          )}
        </div>
        <div className="shrink-0 flex gap-2 px-4 pb-4 pt-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => { reset(); onOpenChange(false); }}>
            Close
          </Button>
          <Button
            type="button"
            data-testid="tm-goal-fix-apply"
            className="flex-1 bg-[#C6A664] text-black"
            disabled={saving || !action}
            onClick={() => void apply()}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </ViewportSheet>
  );
}
