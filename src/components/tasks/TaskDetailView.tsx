'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  tmAttachmentAdd,
  tmCancelTask,
  tmChecklistAdd,
  tmChecklistUpdate,
  tmCommentAdd,
  tmCreateRequest,
  tmGetTask,
  tmMoveTask,
  tmSetCounts,
  tmSetDue,
  tmSetGoals,
  tmSetOwners,
  tmSetRepeat,
  tmSetStatus,
  tmSoftDeleteTask,
  tmUpdateTask,
} from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { formatDue, isLaterDue } from '@/lib/tasks/dates';
import { SmartDateTimePicker } from '@/components/SmartDateTimePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { TmRepeat, TmStatus, TmTaskDetail } from '@/lib/tasks/types';

function parseDate(task: TmTaskDetail): Date | undefined {
  if (!task.due_date) return undefined;
  const [y, m, d] = task.due_date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (task.due_time) {
    const [hh, mm] = task.due_time.split(':').map(Number);
    dt.setHours(hh, mm, 0, 0);
  }
  return dt;
}

function toDateParts(d: Date) {
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`,
  };
}

export function TaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { boot, isSuper, markFetchFailed, refresh } = useTasks();
  const [task, setTask] = useState<TmTaskDetail | null>(null);
  const [checkTitle, setCheckTitle] = useState('');
  const [comment, setComment] = useState('');
  const [notes, setNotes] = useState('');
  const [drive, setDrive] = useState('');
  const [panel, setPanel] = useState<
    null | 'due' | 'owner' | 'folder' | 'goal' | 'size' | 'priority' | 'repeat' | 'cancel' | 'push' | 'fix'
  >(null);
  const [picked, setPicked] = useState<Date | undefined>();
  const [reason, setReason] = useState('');
  const [pendingDue, setPendingDue] = useState<{ date: string; time: string | null } | null>(null);

  async function load() {
    const res = await tmGetTask(taskId);
    if (!res.ok) {
      markFetchFailed();
      toast.error(res.error);
      return;
    }
    setTask(res.data);
    setNotes(res.data.notes ?? '');
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  const reasons = boot?.reasons ?? ['Ran out of time', 'Waiting on someone', 'Priorities changed', 'Blocked', 'Other'];

  const statusClass = useMemo(() => {
    if (!task) return '';
    if (task.status === 'done') return 'is-done';
    if (task.overdue) return 'is-overdue';
    if (task.status === 'in_progress') return 'is-progress';
    return '';
  }, [task]);

  if (!task) return <p className="text-sm text-white/35">Loading…</p>;
  const row = task;

  async function setStatus(status: Exclude<TmStatus, 'cancelled'>) {
    const res = await tmSetStatus(row.id, status);
    if (!res.ok) return toast.error(res.error);
    await load();
    void refresh();
    toast.success('Status updated');
  }

  async function saveDue(date: string | null, time: string | null, why?: string) {
    const res = await tmSetDue(row.id, date, time, why);
    if (!res.ok) return toast.error(res.error);
    setPanel(null);
    setPendingDue(null);
    setReason('');
    await load();
    toast.success(res.data.pushed_count > row.pushed_count ? `Pushed ${res.data.pushed_count}x` : 'Due date updated');
  }

  return (
    <div data-testid="tm-task-detail" data-tm-task={task.id}>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-1 h-8 w-1.5 rounded-full" style={{ background: task.folder_color }} />
        <div className="min-w-0 flex-1">
          <h1 className="tm-display text-3xl leading-tight">{task.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {task.overdue && <span className="tm-chip tm-chip-overdue">Overdue</span>}
            {task.due_soon && !task.overdue && <span className="tm-chip tm-chip-soon">Due soon</span>}
            {task.pushed_count > 0 && (
              <span className="tm-chip tm-chip-muted" data-testid="tm-pushed-badge">
                Pushed {task.pushed_count}x
              </span>
            )}
          </div>
        </div>
        <span className={`tm-status mt-2 ${statusClass}`} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1" data-testid="tm-status-control">
        {(['open', 'in_progress', 'done'] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`tm-status-${s}`}
            onClick={() => void setStatus(s)}
            className={`rounded-lg py-2 text-sm ${
              task.status === s ? 'bg-[#C6A664] text-black' : 'text-white/55'
            }`}
          >
            {s === 'in_progress' ? 'In progress' : s === 'done' ? 'Done' : 'Open'}
          </button>
        ))}
      </div>

      {task.overdue && task.status !== 'done' && (
        <Button
          type="button"
          data-testid="tm-fix-it"
          variant="outline"
          className="mb-4 w-full border-[#E24B4A]/40 text-[#ffb4b0]"
          onClick={() => setPanel('fix')}
        >
          Fix it
        </Button>
      )}

      <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#141414]">
        <Row label="Owner" value={task.owners.map((o) => o.full_name).filter(Boolean).join(', ') || 'Unassigned'} onChange={() => setPanel('owner')} />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/35">Due</p>
            <p className="text-sm">{formatDue(task.due_date, task.due_time)}</p>
          </div>
          <div className="flex gap-2">
            {task.due_date && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="tm-push-due"
                onClick={() => {
                  const [y, m, d] = task.due_date!.split('-').map(Number);
                  const later = new Date(y, m - 1, d + 7);
                  setPendingDue({
                    date: `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}`,
                    time: task.due_time,
                  });
                  setPanel('push');
                }}
              >
                Push later
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setPicked(parseDate(task)); setPanel('due'); }}>
              Change
            </Button>
          </div>
        </div>
        {isSuper && (
          <Row
            label="Folder"
            value={task.parent_folder_name ? `${task.parent_folder_name} / ${task.folder_name}` : task.folder_name || '—'}
            onChange={() => setPanel('folder')}
          />
        )}
        <Row label="Goal" value={task.goals.map((g) => g.name).join(', ') || '—'} onChange={isSuper ? () => setPanel('goal') : undefined} />
        <Row label="Size" value={task.counts ? task.size : 'Hidden'} onChange={() => setPanel('size')} />
        <Row label="Priority" value={task.priority} onChange={() => setPanel('priority')} />
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/35">Counts</p>
            <p className="text-sm">{task.counts ? 'On' : 'Off'}</p>
          </div>
          {isSuper ? (
            <Switch
              data-testid="tm-counts-toggle"
              checked={task.counts}
              onCheckedChange={(v) => void tmSetCounts(task.id, v).then((r) => (r.ok ? load() : toast.error(r.error)))}
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="tm-counts-request"
              onClick={() =>
                void tmCreateRequest(task.id, 'counts_off').then((r) =>
                  r.ok ? (toast.success('Request sent'), load()) : toast.error(r.error)
                )
              }
            >
              Request
            </Button>
          )}
        </div>
        <Row label="Repeat" value={task.repeat === 'none' ? 'Does not repeat' : task.repeat} onChange={() => setPanel('repeat')} />
      </div>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Checklist</h2>
        <div className="space-y-2">
          {task.checklist.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.done}
                onChange={() => void tmChecklistUpdate(c.id, null, !c.done).then(() => load())}
              />
              <span className={c.done ? 'text-white/35 line-through' : ''}>{c.title}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            data-testid="tm-checklist-input"
            value={checkTitle}
            onChange={(e) => setCheckTitle(e.target.value)}
            placeholder="Add an item"
            className="border-white/10 bg-[#1a1a1a]"
          />
          <Button
            type="button"
            data-testid="tm-checklist-add"
            onClick={async () => {
              if (!checkTitle.trim()) return;
              const res = await tmChecklistAdd(task.id, checkTitle.trim());
              if (!res.ok) return toast.error(res.error);
              setCheckTitle('');
              await load();
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Notes</h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-24 border-white/10 bg-[#1a1a1a]"
        />
        <Button
          type="button"
          className="mt-2"
          variant="outline"
          onClick={() => void tmUpdateTask({ id: task.id, notes }).then((r) => (r.ok ? toast.success('Notes saved') : toast.error(r.error)))}
        >
          Save notes
        </Button>
      </section>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Attachments</h2>
        <ul className="mb-2 space-y-1 text-sm">
          {task.attachments.map((a) => (
            <li key={a.id}>
              {a.drive_url ? (
                <a href={a.drive_url} className="text-[#C6A664]" target="_blank" rel="noreferrer">
                  {a.name}
                </a>
              ) : (
                a.name
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            value={drive}
            onChange={(e) => setDrive(e.target.value)}
            placeholder="Google Drive link"
            className="border-white/10 bg-[#1a1a1a]"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (!drive.trim()) return;
              const res = await tmAttachmentAdd({ taskId: task.id, name: 'Drive link', driveUrl: drive.trim() });
              if (!res.ok) return toast.error(res.error);
              setDrive('');
              await load();
            }}
          >
            Add link
          </Button>
        </div>
        <p className="mt-1 text-xs text-white/35">Photos and files use the discussion media path. 25MB cap.</p>
      </section>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Comments</h2>
        <div className="space-y-3">
          {task.comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              <p className="text-xs text-white/35">{c.author_name}</p>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
        <Textarea
          data-testid="tm-comment-input"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a comment. Use @seed-helper to mention."
          className="mt-2 min-h-20 border-white/10 bg-[#1a1a1a]"
        />
        <Button
          type="button"
          data-testid="tm-comment-submit"
          className="mt-2"
          onClick={async () => {
            if (!comment.trim()) return;
            const res = await tmCommentAdd(task.id, comment.trim());
            if (!res.ok) return toast.error(res.error);
            setComment('');
            await load();
            if (res.data.mentions?.length) toast.success('Mention sent');
          }}
        >
          Comment
        </Button>
        {isSuper && task.notifications.length > 0 && (
          <div data-testid="tm-mentions" className="mt-3 text-xs text-white/40">
            {task.notifications.filter((n) => n.kind === 'mention').length} mention notification
            {task.notifications.filter((n) => n.kind === 'mention').length === 1 ? '' : 's'}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Activity</h2>
        <ul className="space-y-1 text-xs text-white/40">
          {task.activity.map((a) => (
            <li key={a.id}>
              {a.actor_name ?? 'Someone'} · {a.action} · {new Date(a.at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 space-y-2">
        {isSuper ? (
          <>
            <Button type="button" variant="outline" className="w-full text-[#E24B4A]" data-testid="tm-cancel" onClick={() => setPanel('cancel')}>
              Cancel task
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-white/35"
              onClick={async () => {
                const res = await tmSoftDeleteTask(task.id);
                if (!res.ok) return toast.error(res.error);
                toast.success('Deleted');
                router.push('/admin/tasks/my');
              }}
            >
              Delete
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            data-testid="tm-request-cancel"
            onClick={() =>
              void tmCreateRequest(task.id, 'cancel', 'Please cancel').then((r) =>
                r.ok ? (toast.success('Cancel requested'), load()) : toast.error(r.error)
              )
            }
          >
            Request cancel
          </Button>
        )}
        {task.requests.some((r) => r.status === 'pending') && (
          <p data-testid="tm-pending-request" className="text-center text-xs text-[#C6A664]">
            Pending request
          </p>
        )}
      </div>

      <AlertDialog open={panel === 'due'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Change due date</AlertDialogTitle>
          </AlertDialogHeader>
          <SmartDateTimePicker value={picked} onChange={setPicked} label="Due" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="tm-due-save"
              onClick={(e) => {
                e.preventDefault();
                if (!picked) {
                  void saveDue(null, null);
                  return;
                }
                const parts = toDateParts(picked);
                if (isLaterDue(task.due_date, task.due_time, parts.date, parts.time)) {
                  setPendingDue(parts);
                  setPanel('push');
                  return;
                }
                void saveDue(parts.date, parts.time);
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'push'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent data-testid="tm-push-reason" className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Why push this later?</AlertDialogTitle>
            <AlertDialogDescription>Pushing a due date later needs a reason.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${reason === r ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="tm-push-confirm"
              onClick={(e) => {
                e.preventDefault();
                if (!pendingDue || !reason) return;
                void saveDue(pendingDue.date, pendingDue.time, reason);
              }}
            >
              Push due
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'owner'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Owners</AlertDialogTitle>
          </AlertDialogHeader>
          {!isSuper && <p className="text-sm text-white/45">Helpers can only assign themselves.</p>}
          <div className="space-y-2" data-testid="tm-owner-change">
            {(boot?.staff ?? []).map((s) => {
              const checked = task.owners.some((o) => o.id === s.id);
              const locked = !isSuper && s.id !== boot?.profile_id;
              return (
                <label key={s.id} className={`flex items-center gap-2 text-sm ${locked ? 'opacity-40' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={checked}
                    onChange={async () => {
                      if (locked) return;
                      const next = checked
                        ? task.owners.filter((o) => o.id !== s.id).map((o) => o.id)
                        : [...task.owners.map((o) => o.id), s.id];
                      const res = await tmSetOwners(task.id, next);
                      if (!res.ok) return toast.error(res.error);
                      await load();
                    }}
                  />
                  {s.full_name}
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Done</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'folder'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Move folder</AlertDialogTitle>
            <AlertDialogDescription>Goal, owner, and dates stay put.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto" data-testid="tm-move-folder">
            {(boot?.folders ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/5"
                onClick={async () => {
                  const res = await tmMoveTask(task.id, f.id);
                  if (!res.ok) return toast.error(res.error);
                  setPanel(null);
                  await load();
                  toast.success('Moved');
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'goal'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Goals</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2">
            {(boot?.goals ?? []).map((g) => {
              const checked = task.goals.some((x) => x.id === g.id);
              return (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={async () => {
                      const next = checked
                        ? task.goals.filter((x) => x.id !== g.id).map((x) => x.id)
                        : [...task.goals.map((x) => x.id), g.id];
                      const res = await tmSetGoals(task.id, next);
                      if (!res.ok) return toast.error(res.error);
                      await load();
                    }}
                  />
                  {g.name}
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Done</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'size'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Size</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex gap-2">
            {(['S', 'M', 'L', 'XL'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded-full px-3 py-1 ${task.size === s ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => void tmUpdateTask({ id: task.id, size: s }).then(() => load())}
              >
                {s}
              </button>
            ))}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'priority'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Priority</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex gap-2">
            {(['high', 'normal', 'low'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded-full px-3 py-1 ${task.priority === s ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => void tmUpdateTask({ id: task.id, priority: s }).then(() => load())}
              >
                {s}
              </button>
            ))}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'repeat'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Repeat</AlertDialogTitle>
            <AlertDialogDescription>Stored now. The engine arrives in Wave 4.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2">
            {(['none', 'weekly', 'monthly', 'quarterly', 'yearly'] as TmRepeat[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded-full px-3 py-1 ${task.repeat === s ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => void tmSetRepeat(task.id, s).then(() => load())}
              >
                {s}
              </button>
            ))}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'cancel'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${reason === r ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void tmCancelTask(task.id, reason || 'Cancelled').then((r) => {
                  if (!r.ok) return toast.error(r.error);
                  toast.success('Cancelled');
                  router.push('/admin/tasks/my');
                });
              }}
            >
              Cancel task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={panel === 'fix'} onOpenChange={(o) => !o && setPanel(null)}>
        <AlertDialogContent data-testid="tm-fix-wave4" className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Fix it</AlertDialogTitle>
            <AlertDialogDescription>Coming in Wave 4.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, onChange }: { label: string; value: string; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/35">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
      {onChange && (
        <Button type="button" size="sm" variant="ghost" onClick={onChange}>
          Change
        </Button>
      )}
    </div>
  );
}
