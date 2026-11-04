'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  tmArchiveFolder,
  tmDeleteEventTemplate,
  tmListEventTemplates,
  tmListPeople,
  tmListTrash,
  tmRecolorFolder,
  tmReorderFolders,
  tmRestoreAnything,
  tmRestoreHelper,
  tmRetireHelper,
  tmRunTick,
  tmSetReasons,
  tmSetTimeMachine,
  tmUpsertEventTemplate,
} from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { tmTimeMachineVisible } from '@/lib/tasks/timeMachine';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Template = {
  id: string;
  name: string;
  items: { id?: string; title: string; days_before: number; size: string; counts: boolean; owner_id?: string | null }[];
};

const COLORS = ['#C6A664', '#6B8E9F', '#C47B5A', '#7A9E7E', '#8B7BB8', '#4A9B8C', '#8A8A8A', '#E24B4A'];

export function ManageView() {
  const { boot, refresh, isSuper, setFolders } = useTasks();
  const [date, setDate] = useState('');
  const [reasons, setReasons] = useState((boot?.reasons ?? []).join('\n'));
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [people, setPeople] = useState<{ id: string; full_name: string | null; role: string; retired: boolean }[] | null>(null);
  const [trash, setTrash] = useState<{
    tasks: { id: string; title: string; deleted_at: string }[];
    folders: { id: string; name: string; deleted_at: string }[];
    goals: { id: string; name: string; deleted_at: string }[];
  } | null>(null);
  const showMachine = tmTimeMachineVisible({
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    honorFlag: boot?.honor_time_machine === true,
  });
  const folders = (boot?.folders ?? []).filter((f) => !f.parent_id && !f.archived_at).sort((a, b) => a.sort - b.sort);

  useEffect(() => {
    setReasons((boot?.reasons ?? []).join('\n'));
  }, [boot?.reasons]);

  useEffect(() => {
    if (!isSuper) return;
    void tmListEventTemplates().then((r) => r.ok && setTemplates(r.data));
    void tmListPeople().then((r) => r.ok && setPeople(r.data));
    void tmListTrash().then((r) => r.ok && setTrash(r.data));
  }, [isSuper]);

  if (!isSuper) return <p className="text-sm text-white/40">Super admins only.</p>;

  return (
    <div data-testid="tm-manage" className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Manage</p>
        <h1 className="tm-display mb-2 mt-1 text-3xl">Manage</h1>
        <Link href="/admin/tasks/help" className="text-sm text-[#C6A664]" data-testid="tm-help-link">How Tasks works</Link>
      </div>

      <section data-testid="tm-manage-goals">
        <h2 className="mb-2 text-sm font-semibold">Goals</h2>
        <Link href="/admin/tasks/goals" className="text-sm text-[#C6A664]">Open goals</Link>
      </section>

      <section data-testid="tm-manage-folders">
        <h2 className="mb-2 text-sm font-semibold">Folders</h2>
        {folders.length === 0 ? (
          <TmEmpty>No folders</TmEmpty>
        ) : (
          <ul className="space-y-2">
            {folders.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#141414] px-3 py-2">
                <span className="h-3 w-3 rounded-full" style={{ background: f.color || '#8A8A8A' }} />
                <span className="min-w-0 flex-1">{f.name}</span>
                <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => {
                  const ids = folders.map((x) => x.id);
                  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                  void tmReorderFolders(ids).then((r) => r.ok && setFolders(r.data));
                }}>Up</Button>
                <Button type="button" size="sm" variant="ghost" disabled={i === folders.length - 1} onClick={() => {
                  const ids = folders.map((x) => x.id);
                  [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                  void tmReorderFolders(ids).then((r) => r.ok && setFolders(r.data));
                }}>Down</Button>
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} className="h-4 w-4 rounded-full" style={{ background: c }} onClick={() => void tmRecolorFolder(f.id, c).then((r) => r.ok && setFolders(r.data))} />
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => void tmArchiveFolder(f.id, true).then((r) => r.ok && setFolders(r.data))}>Archive</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="tm-manage-templates">
        <h2 className="mb-2 text-sm font-semibold">Event templates</h2>
        {templates === null ? <TmSkeleton rows={2} /> : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="rounded-xl bg-[#141414] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.name} <span className="text-xs text-white/40">{t.items.length} items</span></p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" data-testid={`tm-tpl-edit-${t.id}`} onClick={() => setEditTpl({ ...t, items: t.items.map((i) => ({ ...i })) })}>Edit</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void tmDeleteEventTemplate(t.id).then((r) => r.ok && setTemplates(r.data as Template[]))}>Delete</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" className="mt-2" variant="outline" data-testid="tm-tpl-new" onClick={() => setEditTpl({ id: '', name: '', items: [{ title: '', days_before: 0, size: 'S', counts: true }] })}>
          New template
        </Button>
        {editTpl && (
          <div className="mt-3 space-y-2 rounded-xl border border-white/10 p-3" data-testid="tm-tpl-form">
            <Input data-testid="tm-tpl-name" value={editTpl.name} onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} placeholder="Name" className="border-white/10 bg-[#1a1a1a]" />
            {editTpl.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Input value={item.title} placeholder="Title" onChange={(e) => {
                  const items = [...editTpl.items];
                  items[idx] = { ...item, title: e.target.value };
                  setEditTpl({ ...editTpl, items });
                }} className="border-white/10 bg-[#1a1a1a]" />
                <Input type="number" value={item.days_before} onChange={(e) => {
                  const items = [...editTpl.items];
                  items[idx] = { ...item, days_before: Number(e.target.value) };
                  setEditTpl({ ...editTpl, items });
                }} className="border-white/10 bg-[#1a1a1a]" />
                <select className="rounded bg-[#1a1a1a] p-2 text-sm" value={item.size} onChange={(e) => {
                  const items = [...editTpl.items];
                  items[idx] = { ...item, size: e.target.value };
                  setEditTpl({ ...editTpl, items });
                }}>
                  <option>S</option><option>M</option><option>L</option><option>XL</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-white/50">
                  <input type="checkbox" checked={item.counts} onChange={(e) => {
                    const items = [...editTpl.items];
                    items[idx] = { ...item, counts: e.target.checked };
                    setEditTpl({ ...editTpl, items });
                  }} /> Counts
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditTpl({ ...editTpl, items: editTpl.items.filter((_, i) => i !== idx) })}>Remove</Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditTpl({ ...editTpl, items: [...editTpl.items, { title: '', days_before: 0, size: 'S', counts: true }] })}>Add item</Button>
            <Button
              type="button"
              data-testid="tm-tpl-save"
              className="bg-[#C6A664] text-black"
              onClick={() => {
                void tmUpsertEventTemplate(editTpl.id || null, editTpl.name, editTpl.items).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setTemplates(r.data as Template[]);
                  setEditTpl(null);
                });
              }}
            >
              Save template
            </Button>
          </div>
        )}
      </section>

      <section data-testid="tm-manage-reasons">
        <h2 className="mb-2 text-sm font-semibold">Reason list</h2>
        <textarea
          data-testid="tm-reasons-edit"
          className="min-h-28 w-full rounded-xl border border-white/10 bg-[#1a1a1a] p-3 text-sm"
          value={reasons}
          onChange={(e) => setReasons(e.target.value)}
        />
        <Button
          type="button"
          data-testid="tm-reasons-save"
          className="mt-2 bg-[#C6A664] text-black"
          onClick={() => {
            const list = reasons.split('\n').map((s) => s.trim()).filter(Boolean);
            void tmSetReasons(list).then((r) => {
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success('Reasons saved');
              return refresh();
            });
          }}
        >
          Save reasons
        </Button>
      </section>

      <section data-testid="tm-manage-people">
        <h2 className="mb-2 text-sm font-semibold">People and roles</h2>
        {people === null ? <TmSkeleton rows={2} /> : people.length === 0 ? <TmEmpty>No staff</TmEmpty> : (
          <ul className="space-y-2">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-[#141414] px-3 py-2" data-testid={`tm-person-${p.id}`}>
                <span>{p.full_name} <span className="text-xs text-white/40">{p.retired ? 'retired' : p.role}</span></span>
                {p.role === 'admin' && !p.retired && (
                  <Button type="button" size="sm" variant="outline" data-testid={`tm-retire-${p.id}`} onClick={() => {
                    void tmRetireHelper(p.id).then((r) => {
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success('Retired');
                        void tmListPeople().then((x) => x.ok && setPeople(x.data));
                      }
                    });
                  }}>Retire helper</Button>
                )}
                {(p.retired || p.role === 'member') && (
                  <Button type="button" size="sm" variant="outline" data-testid={`tm-restore-helper-${p.id}`} onClick={() => {
                    void tmRestoreHelper(p.id).then((r) => {
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success('Restored');
                        void tmListPeople().then((x) => x.ok && setPeople(x.data));
                      }
                    });
                  }}>Restore</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="tm-manage-trash">
        <h2 className="mb-2 text-sm font-semibold">Trash</h2>
        {trash === null ? <TmSkeleton rows={2} /> : (
          <div className="space-y-2">
            {[
              ...(trash.tasks ?? []).map((t) => ({ kind: 'task' as const, id: t.id, label: t.title })),
              ...(trash.folders ?? []).map((t) => ({ kind: 'folder' as const, id: t.id, label: t.name })),
              ...(trash.goals ?? []).map((t) => ({ kind: 'goal' as const, id: t.id, label: t.name })),
            ].length === 0 ? <TmEmpty>Trash is empty</TmEmpty> : (
              [...(trash.tasks ?? []).map((t) => ({ kind: 'task' as const, id: t.id, label: t.title })),
                ...(trash.folders ?? []).map((t) => ({ kind: 'folder' as const, id: t.id, label: t.name })),
                ...(trash.goals ?? []).map((t) => ({ kind: 'goal' as const, id: t.id, label: t.name }))].map((row) => (
                <div key={`${row.kind}-${row.id}`} className="flex items-center justify-between rounded-xl bg-[#141414] px-3 py-2">
                  <span>{row.label} <span className="text-xs text-white/40">{row.kind}</span></span>
                  <Button type="button" size="sm" data-testid={`tm-restore-${row.kind}-${row.id}`} onClick={() => {
                    void tmRestoreAnything(row.kind, row.id).then((r) => {
                      if (!r.ok) toast.error(r.error);
                      else {
                        setTrash(r.data as typeof trash);
                        toast.success('Restored');
                      }
                    });
                  }}>Restore</Button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section data-testid="tm-manage-export">
        <h2 className="mb-2 text-sm font-semibold">Export</h2>
        <a href="/api/admin/tasks/export" data-testid="tm-export" className="inline-flex rounded-lg bg-[#C6A664] px-3 py-2 text-sm text-black">
          Download CSV
        </a>
      </section>

      {showMachine && (
        <section data-testid="tm-time-machine" className="rounded-xl border border-white/[0.06] bg-[#141414] p-4">
          <h2 className="text-sm font-semibold">Time machine</h2>
          <p className="mt-1 text-xs text-white/45">
            Pretend date for overdue, repeats, and tick. Develop only.
            {boot?.effective_today ? ` Today is ${boot.effective_today}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input data-testid="tm-time-machine-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
            <Button
              type="button"
              data-testid="tm-time-machine-set"
              className="bg-[#C6A664] text-black"
              onClick={() => {
                if (!date) return;
                void tmSetTimeMachine(new Date(date).toISOString()).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Pretend date set');
                  return refresh();
                });
              }}
            >
              Set date
            </Button>
            <Button
              type="button"
              data-testid="tm-tick-now"
              variant="outline"
              onClick={() => {
                void tmRunTick().then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Tick ran');
                  return refresh();
                });
              }}
            >
              Run tick now
            </Button>
            <Button
              type="button"
              data-testid="tm-time-machine-clear"
              variant="ghost"
              onClick={() => {
                void tmSetTimeMachine(null).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Cleared');
                  return refresh();
                });
              }}
            >
              Clear
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
