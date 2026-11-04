'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  ActionResult,
  TmBootstrap,
  TmFolder,
  TmMyTasks,
  TmRepeat,
  TmStatus,
  TmTask,
  TmTaskDetail,
  TmTeamPerson,
  TmTrashedFolder,
} from '@/lib/tasks/types';

function rpcError(error: { message?: string } | null): string {
  const m = error?.message ?? 'Request failed';
  if (m.includes('forbidden')) return 'Forbidden';
  if (m.includes('folder_has_tasks')) return 'Move tasks out of this folder first';
  if (m.includes('reason_required')) return 'A reason is required to push the due date later';
  if (m.includes('title_required')) return 'Title is required';
  if (m.includes('file_too_large')) return 'Files are capped at 25MB';
  if (m.includes('not_found')) return 'Not found';
  if (m.includes('Folders are limited')) return 'Folders are limited to 2 levels';
  return m;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: 'Unauthorized' };
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, data: data as T };
}

export async function tmBootstrap() {
  return rpc<TmBootstrap>('tm_bootstrap');
}

export async function tmListMyTasks() {
  return rpc<TmMyTasks>('tm_list_my_tasks');
}

export async function tmListFolders() {
  return rpc<TmFolder[]>('tm_list_folders');
}

export async function tmListFolderTasks(folderId: string) {
  return rpc<TmTask[]>('tm_list_folder_tasks', { p_folder_id: folderId });
}

export async function tmListTeam() {
  return rpc<TmTeamPerson[]>('tm_list_team');
}

export async function tmListNeedsHome() {
  return rpc<TmTask[]>('tm_list_needs_home');
}

export async function tmListTrashedFolders() {
  return rpc<TmTrashedFolder[]>('tm_list_trashed_folders');
}

export async function tmGetTask(id: string) {
  return rpc<TmTaskDetail>('tm_get_task', { p_id: id });
}

export async function tmCreateTask(input: {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  folderId?: string | null;
}) {
  return rpc<TmTask>('tm_create_task', {
    p_title: input.title,
    p_due_date: input.dueDate ?? null,
    p_due_time: input.dueTime ?? null,
    p_folder_id: input.folderId ?? null,
  });
}

export async function tmUpdateTask(input: {
  id: string;
  title?: string | null;
  notes?: string | null;
  size?: string | null;
  priority?: string | null;
}) {
  return rpc<TmTask>('tm_update_task', {
    p_id: input.id,
    p_title: input.title ?? null,
    p_notes: input.notes ?? null,
    p_size: input.size ?? null,
    p_priority: input.priority ?? null,
  });
}

export async function tmSetStatus(id: string, status: Exclude<TmStatus, 'cancelled'>) {
  return rpc<TmTask>('tm_set_status', { p_id: id, p_status: status });
}

export async function tmMoveTask(id: string, folderId: string) {
  return rpc<TmTask>('tm_move_task', { p_id: id, p_folder_id: folderId });
}

export async function tmSetOwners(id: string, owners: string[]) {
  return rpc<TmTask>('tm_set_owners', { p_id: id, p_owners: owners });
}

export async function tmSetCounts(id: string, counts: boolean) {
  return rpc<TmTask>('tm_set_counts', { p_id: id, p_counts: counts });
}

export async function tmSetRepeat(id: string, repeat: TmRepeat) {
  return rpc<TmTask>('tm_set_repeat', { p_id: id, p_repeat: repeat });
}

export async function tmSetGoals(id: string, goals: string[]) {
  return rpc<TmTask>('tm_set_goals', { p_id: id, p_goals: goals });
}

export async function tmSetDue(id: string, dueDate: string | null, dueTime: string | null, reason?: string | null) {
  return rpc<TmTask>('tm_set_due', {
    p_id: id,
    p_due_date: dueDate,
    p_due_time: dueTime,
    p_reason: reason ?? null,
  });
}

export async function tmSoftDeleteTask(id: string) {
  return rpc<{ ok: boolean }>('tm_soft_delete_task', { p_id: id });
}

export async function tmCancelTask(id: string, reason: string) {
  return rpc<TmTask>('tm_cancel_task', { p_id: id, p_reason: reason });
}

export async function tmCreateRequest(id: string, kind: 'park' | 'cancel' | 'counts_off', reason?: string) {
  return rpc<{ id: string; kind: string; status: string }>('tm_create_request', {
    p_id: id,
    p_kind: kind,
    p_reason: reason ?? null,
  });
}

export async function tmCreateFolder(name: string, color: string | null, parentId: string | null) {
  return rpc<TmFolder[]>('tm_create_folder', { p_name: name, p_color: color, p_parent_id: parentId });
}

export async function tmRenameFolder(id: string, name: string) {
  return rpc<TmFolder[]>('tm_rename_folder', { p_id: id, p_name: name });
}

export async function tmRecolorFolder(id: string, color: string) {
  return rpc<TmFolder[]>('tm_recolor_folder', { p_id: id, p_color: color });
}

export async function tmMoveFolder(id: string, parentId: string | null) {
  return rpc<TmFolder[]>('tm_move_folder', { p_id: id, p_parent_id: parentId });
}

export async function tmArchiveFolder(id: string, archive: boolean) {
  return rpc<TmFolder[]>('tm_archive_folder', { p_id: id, p_archive: archive });
}

export async function tmDeleteFolder(id: string) {
  return rpc<TmFolder[]>('tm_delete_folder', { p_id: id });
}

export async function tmMoveAllFolderTasks(fromId: string, toId: string) {
  return rpc<{ moved: number; folders: TmFolder[] }>('tm_move_all_folder_tasks', {
    p_from: fromId,
    p_to: toId,
  });
}

export async function tmRestoreFolder(id: string) {
  return rpc<{ folders: TmFolder[]; trash: TmTrashedFolder[] }>('tm_restore_folder', { p_id: id });
}

export async function tmChecklistAdd(taskId: string, title: string) {
  return rpc<{ id: string; title: string; done: boolean; sort: number }>('tm_checklist_add', {
    p_task_id: taskId,
    p_title: title,
  });
}

export async function tmChecklistUpdate(id: string, title: string | null, done: boolean | null) {
  return rpc<{ ok: boolean }>('tm_checklist_update', { p_id: id, p_title: title, p_done: done });
}

export async function tmChecklistDelete(id: string) {
  return rpc<{ ok: boolean }>('tm_checklist_delete', { p_id: id });
}

export async function tmCommentAdd(taskId: string, body: string) {
  return rpc<{ id: string; body: string; mentions: string[] }>('tm_comment_add', {
    p_task_id: taskId,
    p_body: body,
  });
}

export async function tmAttachmentAdd(input: {
  taskId: string;
  name: string;
  r2Key?: string | null;
  size?: number | null;
  driveUrl?: string | null;
}) {
  return rpc<{ id: string }>('tm_attachment_add', {
    p_task_id: input.taskId,
    p_name: input.name,
    p_r2_key: input.r2Key ?? null,
    p_size: input.size ?? null,
    p_drive_url: input.driveUrl ?? null,
  });
}

export async function tmAttachmentDelete(id: string) {
  return rpc<{ ok: boolean }>('tm_attachment_delete', { p_id: id });
}

export async function tmActivityList(taskId: string) {
  return rpc('tm_activity_list', { p_task_id: taskId });
}
