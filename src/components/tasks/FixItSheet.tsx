'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { tmFixTask, tmFixTasks, tmUndoFix } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TmTask } from '@/lib/tasks/types';

const OPTIONS: { id: 'reschedule' | 'park' | 'done_late' | 'cancel' | 'missed'; title: string; blurb: string; helper?: string }[] = [
  { id: 'reschedule', title: 'Reschedule', blurb: 'Pick a new date. Adds Pushed Nx.' },
  { id: 'park', title: 'Park', blurb: 'Take the date off. Comes back when you give it one.', helper: 'Needs super admin approval' },
  { id: 'done_late', title: 'Done late', blurb: 'It got done. Counts as late.' },
  { id: 'cancel', title: 'Cancel', blurb: 'Drop it. Needs a reason.', helper: 'Needs super admin approval' },
  { id: 'missed', title: 'Missed', blurb: 'This copy was missed. Needs a reason.' },
];

export function FixItSheet({
  open,
  onOpenChange,
  tasks,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: TmTask[];
  onDone: () => void;
}) {
  const { boot, isSuper } = useTasks();
  const reasons = boot?.reasons ?? [];
  const missedCopy = tasks.length === 1 && tasks[0]?.repeat !== 'none' && tasks[0]?.overdue;
  const [action, setAction] = useState<typeof OPTIONS[number]['id'] | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');

  const visible = OPTIONS.filter((o) => {
    if (o.id === 'missed') return !!missedCopy;
    if (o.id === 'reschedule') return !missedCopy;
    return true;
  });

  function reset() {
    setAction(null);
    setReason('');
    setNote('');
    setDue('');
  }

  async function apply() {
    if (!action || !tasks.length) return;
    if (!reason) {
      toast.error('Pick a reason');
      return;
    }
    if (action === 'reschedule' && !due) {
      toast.error('Pick a new date');
      return;
    }
    const ids = tasks.map((t) => t.id);
    const res = ids.length === 1
      ? await tmFixTask({ id: ids[0], action, reason, note, newDue: due || null })
      : await tmFixTasks(ids, { action, reason, note, newDue: due || null });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const single = ids.length === 1 ? (res.data as { pending_request?: boolean; fix_log_id?: string }) : null;
    const pending = Boolean(single?.pending_request);
    const fixLogId = single?.fix_log_id ?? null;
    toast.success(pending ? 'Request sent' : 'Fixed', {
      duration: 10000,
      action: fixLogId
        ? {
            label: 'Undo',
            onClick: () => {
              void tmUndoFix(fixLogId).then((u) => {
                if (!u.ok) {
                  toast.error(u.error);
                  return;
                }
                toast.success('Undone');
                onDone();
              });
            },
          }
        : undefined,
    });
    reset();
    onOpenChange(false);
    onDone();
  }

  return (
    <ViewportSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      testId="tm-fix-sheet"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pb-2 pt-4">
          <p className="tm-display text-xl">Fix it{tasks.length > 1 ? ` · ${tasks.length}` : ''}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
          {visible.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid={`tm-fix-${o.id}`}
              onClick={() => setAction(o.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left ${
                action === o.id ? 'border-[#C6A664] bg-[#C6A664]/10' : 'border-white/10'
              }`}
            >
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-xs text-white/45">{o.blurb}</p>
              {!isSuper && o.helper && <p className="mt-1 text-xs text-[#C6A664]">{o.helper}</p>}
            </button>
          ))}
          {action === 'reschedule' && (
            <Input data-testid="tm-fix-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
          )}
          {(action === 'reschedule' || action === 'cancel' || action === 'missed' || action === 'park' || action === 'done_late') && (
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  data-testid={`tm-fix-reason-${r}`}
                  className={`rounded-full px-3 py-1 text-xs ${reason === r ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" className="border-white/10 bg-[#1a1a1a]" />
        </div>
        <div className="shrink-0 flex gap-2 px-4 pb-4 pt-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => { reset(); onOpenChange(false); }}>
            Close
          </Button>
          <Button type="button" data-testid="tm-fix-apply" className="flex-1 bg-[#C6A664] text-black" onClick={() => void apply()}>
            Apply
          </Button>
        </div>
      </div>
    </ViewportSheet>
  );
}
