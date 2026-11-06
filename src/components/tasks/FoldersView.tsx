'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  tmArchiveFolder,
  tmCreateFolder,
  tmDeleteFolder,
  tmListFolderTasks,
  tmListNeedsHome,
  tmListTeam,
  tmListTrashedFolders,
  tmMoveAllFolderTasks,
  tmRecolorFolder,
  tmRenameFolder,
  tmRestoreFolder,
} from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TaskGroup } from '@/components/tasks/TaskRow';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { TmFolder, TmTask, TmTeamPerson, TmTrashedFolder } from '@/lib/tasks/types';

const COLORS = ['#C6A664', '#6B8E9F', '#C47B5A', '#7A9E7E', '#8B7BB8', '#4A9B8C', '#8A8A8A', '#E24B4A'];

export function FoldersView({ folderId }: { folderId?: string }) {
  const router = useRouter();
  const { boot, setFolders, markFetchFailed, isSuper } = useTasks();
  const folders = boot?.folders ?? [];
  const [team, setTeam] = useState<TmTeamPerson[]>([]);
  const [homeless, setHomeless] = useState<TmTask[]>([]);
  const [trash, setTrash] = useState<TmTrashedFolder[]>([]);
  const [contents, setContents] = useState<TmTask[]>([]);
  const [newName, setNewName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');
  const [blocked, setBlocked] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const current = folders.find((f) => f.id === folderId);
  const roots = useMemo(() => folders.filter((f) => !f.parent_id && !f.archived_at), [folders]);
  const childrenOf = (id: string) => folders.filter((f) => f.parent_id === id && !f.archived_at);

  async function reloadLists() {
    const [t, n, tr] = await Promise.all([tmListTeam(), tmListNeedsHome(), tmListTrashedFolders()]);
    if (!t.ok || !n.ok || !tr.ok) {
      markFetchFailed();
      return;
    }
    setTeam(t.data);
    setHomeless(n.data);
    setTrash(tr.data);
  }

  useEffect(() => {
    void reloadLists();
  }, []);

  useEffect(() => {
    if (!folderId) {
      setContents([]);
      return;
    }
    void tmListFolderTasks(folderId).then((res) => {
      if (res.ok) setContents(res.data);
    });
  }, [folderId]);

  async function applyFolders(next: TmFolder[]) {
    setFolders(next);
  }

  async function createFolder() {
    if (!newName.trim()) return;
    const res = await tmCreateFolder(newName.trim(), '#C6A664', folderId ?? null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await applyFolders(res.data);
    setNewName('');
    toast.success('Folder created');
  }

  async function tryDelete(id: string) {
    const res = await tmDeleteFolder(id);
    if (!res.ok) {
      if (res.error.toLowerCase().includes('move')) {
        setBlocked(true);
        setDeleteId(id);
        return;
      }
      toast.error(res.error);
      return;
    }
    await applyFolders(res.data);
    setDeleteId(null);
    setBlocked(false);
    toast.success('Folder deleted');
    if (folderId === id) router.push('/admin/tasks/folders');
    void reloadLists();
  }

  async function moveAllThenDelete() {
    if (!deleteId || !moveTo) return;
    const moved = await tmMoveAllFolderTasks(deleteId, moveTo);
    if (!moved.ok) {
      toast.error(moved.error);
      return;
    }
    await applyFolders(moved.data.folders);
    const del = await tmDeleteFolder(deleteId);
    if (!del.ok) {
      toast.error(del.error);
      return;
    }
    await applyFolders(del.data);
    toast.success('Moved and deleted');
    setDeleteId(null);
    setBlocked(false);
    if (folderId === deleteId) router.push('/admin/tasks/folders');
    void reloadLists();
  }

  if (!isSuper) {
    return (
      <div data-testid="tm-board">
        <h1 className="tm-display text-3xl">Board</h1>
        <p className="mt-3 text-sm text-white/45">Coming in a later wave.</p>
      </div>
    );
  }

  return (
    <div data-testid="tm-folders">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">
            {current ? 'Folder' : 'Folders'}
          </p>
          <h1 className="tm-display mt-1 text-3xl">{current?.name ?? 'Folders'}</h1>
        </div>
        {current && (
          <Link href="/admin/tasks/folders" className="text-sm text-white/45 no-underline">
            All folders
          </Link>
        )}
      </div>

      {!current && (
        <div className="space-y-2">
          {roots.map((f) => (
            <div key={f.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#141414]">
              <div className="flex items-center gap-3 px-3 py-3">
                <span className="h-3 w-3 rounded-full" style={{ background: f.color || '#8A8A8A' }} />
                <Link href={`/admin/tasks/folders/${f.id}`} className="flex-1 no-underline text-[#f4f1ea]" data-testid={`tm-folder-${f.name}`}>
                  <span className="font-medium">{f.name}</span>
                  <span className="ml-2 text-xs text-white/35">{f.open_count} open</span>
                </Link>
                <button type="button" className="text-xs text-white/35" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}>
                  Rename
                </button>
                <button
                  type="button"
                  className="text-xs text-white/35"
                  data-testid={`tm-folder-color-${f.id}`}
                  onClick={() => {
                    const next = COLORS[(COLORS.indexOf(f.color || '') + 1) % COLORS.length];
                    void tmRecolorFolder(f.id, next).then((r) => {
                      if (r.ok) return applyFolders(r.data);
                    });
                  }}
                >
                  Color
                </button>
                <button
                  type="button"
                  className="text-xs text-white/35"
                  onClick={() =>
                    void tmArchiveFolder(f.id, true).then((r) => {
                      if (r.ok) return applyFolders(r.data);
                    })
                  }
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="text-xs text-[#E24B4A]"
                  data-testid={`tm-folder-delete-${f.id}`}
                  onClick={() => void tryDelete(f.id)}
                >
                  Delete
                </button>
              </div>
              {childrenOf(f.id).map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/tasks/folders/${c.id}`}
                  className="flex items-center gap-3 border-t border-white/[0.04] px-3 py-2.5 pl-10 text-sm text-white/75 no-underline"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color || f.color || '#8A8A8A' }} />
                  {c.name}
                  <span className="text-xs text-white/30">{c.open_count}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="mb-6 space-y-2">
          {childrenOf(current.id).map((c) => (
            <Link
              key={c.id}
              href={`/admin/tasks/folders/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#141414] px-3 py-3 no-underline text-[#f4f1ea]"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color || current.color || '#8A8A8A' }} />
              {c.name}
              <span className="ml-auto text-xs text-white/35">{c.open_count} open</span>
            </Link>
          ))}
          <TaskGroup tasks={contents} showFolder={false} empty="No tasks in this folder." />
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={current ? 'New subfolder' : 'New folder'}
          className="border-white/10 bg-[#1a1a1a]"
          data-testid="tm-folder-new-name"
        />
        <Button type="button" onClick={() => void createFolder()} className="bg-[#C6A664] text-black" data-testid="tm-folder-create">
          Add
        </Button>
      </div>

      {!current && (
        <>
          <section className="mt-10" data-testid="tm-team">
            <h2 className="tm-display mb-3 text-2xl">TEAM</h2>
            {team.length === 0 && <p className="text-sm text-white/35">No helper-owned tasks yet.</p>}
            {team.map((person) => (
              <div key={person.profile_id} className="mb-5">
                <p className="mb-2 text-sm font-semibold text-white/70">{person.full_name}</p>
                <TaskGroup tasks={person.tasks} showFolder />
              </div>
            ))}
          </section>
          <section className="mt-8" data-testid="tm-needs-home">
            <h2 className="tm-display mb-3 text-2xl">Needs a home</h2>
            <TaskGroup tasks={homeless} showFolder={false} empty="All tasks have a home." />
          </section>
          <section className="mt-8" data-testid="tm-trash">
            <h2 className="tm-display mb-3 text-2xl">Trash</h2>
            {trash.length === 0 && <p className="text-sm text-white/35">Empty. Restorable for 30 days.</p>}
            {trash.map((f) => (
              <div key={f.id} className="mb-2 flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2">
                <span>{f.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`tm-folder-restore-${f.id}`}
                  onClick={async () => {
                    const res = await tmRestoreFolder(f.id);
                    if (!res.ok) {
      toast.error(res.error);
      return;
    }
                    setFolders(res.data.folders);
                    setTrash(res.data.trash);
                    toast.success('Restored');
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </section>
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && (setDeleteId(null), setBlocked(false))}>
        <AlertDialogContent data-testid="tm-folder-delete-dialog" className="bg-[#111] text-[#f4f1ea]">
          <AlertDialogHeader>
            <AlertDialogTitle>{blocked ? 'Move tasks first' : 'Delete folder?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? 'This folder still has tasks. Move them all, then delete.'
                : 'It will sit in trash for 30 days.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {blocked && (
            <select
              data-testid="tm-folder-move-all"
              className="h-10 rounded-md border border-white/10 bg-[#1a1a1a] px-3 text-sm"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              <option value="">Move all to…</option>
              {folders
                .filter((f) => f.id !== deleteId && !f.archived_at)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {blocked ? (
              <AlertDialogAction
                data-testid="tm-folder-move-all-confirm"
                onClick={(e) => {
                  e.preventDefault();
                  void moveAllThenDelete();
                }}
              >
                Move all and delete
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={() => deleteId && void tryDelete(deleteId)}>Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ViewportSheet open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)} testId="tm-folder-rename">
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <p className="tm-display text-xl">Rename folder</p>
          <Input
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            className="mt-3 border-white/10 bg-[#1a1a1a]"
          />
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-[#C6A664] text-black"
              onClick={async () => {
                if (!renameId) return;
                const res = await tmRenameFolder(renameId, renameVal);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                await applyFolders(res.data);
                setRenameId(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </ViewportSheet>
    </div>
  );
}
