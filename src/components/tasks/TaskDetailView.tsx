'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  tmAttachmentAdd,
  tmAttachmentDelete,
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
  tmApplyFuture,
  tmUpdateTask,
} from '@/app/actions/tasksActions';
import { FixItSheet } from '@/components/tasks/FixItSheet';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { useTasks } from '@/components/tasks/TasksProvider';
import { formatDue, hasDueTime, isLaterDue } from '@/lib/tasks/dates';
import { supabase } from '@/integrations/supabase/client';
import { useVisualViewport, visualViewportStyle } from '@/hooks/useVisualViewport';
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
  if (hasDueTime(task.due_time)) {
    const [hh, mm] = task.due_time!.split(':').map(Number);
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<
    null | 'due' | 'owner' | 'folder' | 'goal' | 'size' | 'priority' | 'repeat' | 'cancel' | 'push' | 'fix'
  >(null);
  const [picked, setPicked] = useState<Date | undefined>();
  const [reason, setReason] = useState('');
  const [pendingDue, setPendingDue] = useState<{ date: string; time: string | null } | null>(null);
  const [pendingRepeat, setPendingRepeat] = useState<TmRepeat | null>(null);

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
    if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
    await load();
    void refresh();
    toast.success('Status updated');
  }

  async function saveDue(date: string | null, time: string | null, why?: string) {
    const res = await tmSetDue(row.id, date, time, why);
    if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
            {task.event_name && <span className="tm-chip tm-chip-muted" data-testid="tm-event-chip">Event: {task.event_name}</span>}
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

      {task.overdue && task.status !== 'done' && task.status !== 'cancelled' && (
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
      {task.status === 'cancelled' && (
        <p className="mb-4 text-sm text-white/40" data-testid="tm-cancelled">
          Cancelled{task.cancelled_reason ? ` · ${task.cancelled_reason}` : ''}
        </p>
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
            value={task.parent_folder_name ? `${task.parent_folder_name} / ${task.folder_name}` : task.folder_name || '-'}
            onChange={() => setPanel('folder')}
          />
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/35">Goal</p>
            <div className="mt-1 flex flex-wrap gap-1" data-testid="tm-goal-chips">
              {task.goals.length === 0 && <span className="text-sm">-</span>}
              {task.goals.map((g) => (
                <span key={g.id} className="tm-chip tm-chip-muted" data-testid={`tm-goal-chip-${g.id}`}>
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: g.color || '#8A8A8A' }} />
                  {g.name}
                  {g.is_misc && task.goals.length === 1 ? ' · Needs a goal' : ''}
                </span>
              ))}
            </div>
          </div>
          {isSuper && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setPanel('goal')}>
              Change
            </Button>
          )}
        </div>
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
              onCheckedChange={(v) =>
                void tmSetCounts(task.id, v).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  return load();
                })
              }
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="tm-counts-request"
              onClick={() =>
                void tmCreateRequest(task.id, 'counts_off').then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Request sent');
                  return load();
                })
              }
            >
              Request
            </Button>
          )}
        </div>
        <Row label="Repeat" value={task.repeat === 'none' ? 'Does not repeat' : task.repeat} onChange={() => setPanel('repeat')} />
        {task.repeat !== 'none' && (
          <div className="px-4 py-2">
            <Button type="button" data-testid="tm-stop-repeat" variant="ghost" size="sm" className="text-white/50" onClick={() => void tmSetRepeat(task.id, 'none').then(() => load())}>
              Stop repeating
            </Button>
          </div>
        )}
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
              if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
          onClick={() =>
            void tmUpdateTask({ id: task.id, notes }).then((r) => {
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success('Notes saved');
            })
          }
        >
          Save notes
        </Button>
      </section>

      <section className="mt-6">
        <h2 className="tm-display mb-2 text-xl">Attachments</h2>
        <ul className="mb-2 space-y-2 text-sm">
          {task.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              {a.drive_url ? (
                <a
                  href={a.drive_url}
                  className="min-w-0 flex-1 truncate text-[#C6A664]"
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`tm-attachment-open-${a.id}`}
                >
                  {a.name}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-white/40"
                data-testid={`tm-attachment-delete-${a.id}`}
                onClick={async () => {
                  const res = await tmAttachmentDelete(a.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  await load();
                  toast.success('Attachment removed');
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
          className="hidden"
          data-testid="tm-attachment-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 25 * 1024 * 1024) {
              toast.error('File too large (25MB max)');
              return;
            }
            setUploading(true);
            try {
              const { data: presign, error: presignErr } = await supabase.functions.invoke('tm-attachment-upload', {
                body: {
                  task_id: task.id,
                  file_name: file.name,
                  content_type: file.type || 'application/octet-stream',
                  file_size: file.size,
                },
              });
              if (presignErr || !presign?.uploadUrl) {
                throw new Error(presignErr?.message || presign?.error || 'Could not get upload URL');
              }
              const putRes = await fetch(presign.uploadUrl as string, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
              });
              if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
              const res = await tmAttachmentAdd({
                taskId: task.id,
                name: file.name,
                r2Key: presign.key as string,
                size: file.size,
                driveUrl: presign.publicUrl as string,
              });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              await load();
              toast.success('File attached');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Upload failed');
            } finally {
              setUploading(false);
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="tm-attachment-upload"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload file'}
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
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
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setDrive('');
              await load();
            }}
          >
            Add link
          </Button>
        </div>
        <p className="mt-1 text-xs text-white/35">Photos, camera, and files. 25MB cap.</p>
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
        <CommentCompose
          value={comment}
          onChange={setComment}
          onSubmit={async () => {
            if (!comment.trim()) return;
            const res = await tmCommentAdd(task.id, comment.trim());
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            setComment('');
            await load();
            if (res.data.mentions?.length) toast.success('Mention sent');
          }}
        />
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
                if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
              void tmCreateRequest(task.id, 'cancel', 'Please cancel').then((r) => {
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success('Cancel requested');
                return load();
              })
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

      <ViewportSheet open={panel === 'due'} onOpenChange={(o) => !o && setPanel(null)} testId="tm-due-sheet">
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <p className="tm-display text-xl">Change due date</p>
          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            <SmartDateTimePicker value={picked} onChange={setPicked} label="Due" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="tm-due-save"
              className="flex-1 bg-[#C6A664] text-black"
              onClick={() => {
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
            </Button>
          </div>
        </div>
      </ViewportSheet>

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
                      if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
                      if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
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
        <AlertDialogContent data-testid="tm-repeat-panel" className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>Repeat</AlertDialogTitle>
            <AlertDialogDescription>Just this copy, or all future copies in the series.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2">
            {(['none', 'weekly', 'monthly', 'quarterly', 'yearly'] as TmRepeat[]).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`tm-repeat-${s}`}
                className={`rounded-full px-3 py-1 ${(pendingRepeat ?? task.repeat) === s ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => setPendingRepeat(s)}
              >
                {s === 'none' ? 'off' : s}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              data-testid="tm-repeat-this"
              size="sm"
              variant="outline"
              onClick={() => {
                void tmSetRepeat(task.id, pendingRepeat ?? task.repeat).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setPanel(null);
                  setPendingRepeat(null);
                  return load();
                });
              }}
            >
              Just this one
            </Button>
            <Button
              type="button"
              data-testid="tm-repeat-future"
              size="sm"
              variant="outline"
              onClick={() => {
                const next = pendingRepeat ?? task.repeat;
                void tmSetRepeat(task.id, next).then((first) => {
                  if (!first.ok) {
                    toast.error(first.error);
                    return;
                  }
                  if (next === 'none') {
                    setPanel(null);
                    setPendingRepeat(null);
                    return load();
                  }
                  return tmApplyFuture(task.id, { title: task.title, size: task.size, repeat: next }).then((r) => {
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success('Future copies updated');
                    setPanel(null);
                    setPendingRepeat(null);
                    return load();
                  });
                });
              }}
            >
              All future
            </Button>
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
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
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

      <FixItSheet
        open={panel === 'fix'}
        onOpenChange={(o) => !o && setPanel(null)}
        tasks={[task]}
        onDone={() => void load()}
      />
    </div>
  );
}

function CommentCompose({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const box = useVisualViewport(focused);
  const pin = focused;
  return (
    <div
      data-testid="tm-comment-compose"
      className={pin ? 'z-40 bg-[#0B0B0B] px-4 py-2' : 'mt-2'}
      style={
        pin
          ? {
              ...visualViewportStyle(box),
              height: 'auto',
              top: 'auto',
              bottom: typeof window !== 'undefined' ? Math.max(0, window.innerHeight - box.offsetTop - box.height) : 0,
            }
          : undefined
      }
    >
      <Textarea
        data-testid="tm-comment-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a comment. Use @seed-helper to mention."
        className="min-h-20 border-white/10 bg-[#1a1a1a]"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <Button
        type="button"
        data-testid="tm-comment-submit"
        className="mt-2"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void onSubmit()}
      >
        Comment
      </Button>
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
