'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  ActionResult,
  TmBootstrap,
  TmDashboard,
  TmFolder,
  TmGoal,
  TmGoalDetail,
  TmMyTasks,
  TmNotification,
  TmProgress,
  TmRepeat,
  TmRequestRow,
  TmStatus,
  TmTask,
  TmTaskDetail,
  TmTeamPerson,
  TmTrashedFolder,
  TmHistoryPeriod,
  TmHistoryGoal,
  TmSavedFilter,
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
  if (m.includes('goal_has_tasks')) return 'Move tasks off this goal first';
  if (m.includes('goal_closed')) return 'That goal is closed to new tasks';
  if (m.includes('misc_locked')) return 'Misc cannot be changed that way';
  if (m.includes('not_ready')) return 'Goal is not at 100% yet';
  if (m.includes('open_subgoals')) return 'Finish or complete every sub-goal first';
  if (m.includes('size_required')) return 'Size is required to count toward time bars';
  if (m.includes('no_reschedule')) return 'Missed repeats cannot be rescheduled';
  if (m.includes('invalid_action')) return 'That fix is not available';
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

export async function tmListGoals() {
  return rpc<TmGoal[]>('tm_list_goals');
}

export async function tmGetGoal(id: string) {
  return rpc<TmGoalDetail>('tm_get_goal', { p_id: id });
}

export async function tmGoalProgress(id: string) {
  return rpc<TmProgress>('tm_goal_progress', { p_goal_id: id });
}

export async function tmPeriodProgress(kind: 'week' | 'month' | 'quarter' | 'year', person?: string | null) {
  return rpc<TmProgress>('tm_period_progress', {
    p_kind: kind,
    p_for_date: null,
    p_person: person ?? null,
  });
}

export async function tmCreateGoal(input: {
  name: string;
  kind: 'task' | 'number';
  color: string | null;
  dueDate?: string | null;
  parentId?: string | null;
  numberTarget?: number | null;
  numberUnit?: string | null;
  numberSource?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
}) {
  return rpc<TmGoal>('tm_create_goal', {
    p_name: input.name,
    p_kind: input.kind,
    p_color: input.color,
    p_due_date: input.dueDate ?? null,
    p_parent_id: input.parentId ?? null,
    p_number_target: input.numberTarget ?? null,
    p_number_unit: input.numberUnit ?? null,
    p_number_source: input.numberSource ?? null,
    p_range_start: input.rangeStart ?? null,
    p_range_end: input.rangeEnd ?? null,
  });
}

export async function tmUpdateGoal(input: {
  id: string;
  name?: string | null;
  color?: string | null;
  dueDate?: string | null;
  description?: string | null;
  numberTarget?: number | null;
  numberUnit?: string | null;
  numberSource?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
}) {
  return rpc<TmGoal>('tm_update_goal', {
    p_id: input.id,
    p_name: input.name ?? null,
    p_color: input.color ?? null,
    p_due_date: input.dueDate ?? null,
    p_description: input.description ?? null,
    p_number_target: input.numberTarget ?? null,
    p_number_unit: input.numberUnit ?? null,
    p_number_source: input.numberSource ?? null,
    p_range_start: input.rangeStart ?? null,
    p_range_end: input.rangeEnd ?? null,
  });
}

export async function tmSetGoalCountsTimeBars(id: string, on: boolean, size?: string | null) {
  return rpc<TmGoal>('tm_set_goal_counts_time_bars', { p_id: id, p_on: on, p_size: size ?? null });
}

export async function tmLogGoalProgress(id: string, delta: number, note?: string) {
  return rpc<TmGoalDetail>('tm_log_goal_progress', { p_id: id, p_delta: delta, p_note: note ?? null });
}

export async function tmCompleteGoal(id: string) {
  return rpc<TmGoal>('tm_complete_goal', { p_id: id });
}

export async function tmCancelGoal(id: string, reason: string) {
  return rpc<TmGoal>('tm_cancel_goal', { p_id: id, p_reason: reason });
}

export async function tmDeleteGoal(id: string) {
  return rpc<TmGoal[]>('tm_delete_goal', { p_id: id });
}

export async function tmMoveAllGoalTasks(fromId: string, toId: string) {
  return rpc<{ moved: number; goals: TmGoal[] }>('tm_move_all_goal_tasks', { p_from: fromId, p_to: toId });
}

export async function tmDashboard(person?: string | null) {
  return rpc<TmDashboard>('tm_dashboard', { p_person: person ?? null });
}

export async function tmListRequests() {
  return rpc<TmRequestRow[]>('tm_list_requests');
}

export async function tmDecideRequest(id: string, approve: boolean, note?: string) {
  return rpc<TmRequestRow[]>('tm_decide_request', { p_id: id, p_approve: approve, p_note: note ?? null });
}

export async function tmListMyNotifications() {
  return rpc<TmNotification[]>('tm_list_my_notifications');
}

export async function tmListNeedsGoal() {
  return rpc<TmTask[]>('tm_list_needs_goal');
}

export async function tmFixTask(input: {
  id: string;
  action: 'reschedule' | 'park' | 'done_late' | 'cancel' | 'missed';
  reason?: string | null;
  note?: string | null;
  newDue?: string | null;
  newFolder?: string | null;
  newGoal?: string | null;
  newOwners?: string[] | null;
}) {
  return rpc<{ ok: boolean; pending_request?: boolean; fix_log_id: string; task?: TmTask }>('tm_fix_task', {
    p_task_id: input.id,
    p_action: input.action,
    p_reason: input.reason ?? null,
    p_note: input.note ?? null,
    p_new_due: input.newDue ?? null,
    p_new_folder: input.newFolder ?? null,
    p_new_goal: input.newGoal ?? null,
    p_new_owners: input.newOwners ?? null,
  });
}

export async function tmFixTasks(ids: string[], input: {
  action: 'reschedule' | 'park' | 'done_late' | 'cancel' | 'missed';
  reason?: string | null;
  note?: string | null;
  newDue?: string | null;
}) {
  return rpc<{ ok: boolean }>('tm_fix_tasks', {
    p_task_ids: ids,
    p_action: input.action,
    p_reason: input.reason ?? null,
    p_note: input.note ?? null,
    p_new_due: input.newDue ?? null,
    p_new_folder: null,
    p_new_goal: null,
    p_new_owners: null,
  });
}

export async function tmUndoFix(id: string) {
  return rpc<{ ok: boolean }>('tm_undo_fix', { p_fix_log_id: id });
}

export async function tmGoalExtend(id: string, due: string, reason: string) {
  return rpc<TmGoal>('tm_goal_extend', { p_id: id, p_new_due: due, p_reason: reason });
}

export async function tmGoalFail(id: string) {
  return rpc<TmGoal>('tm_goal_fail', { p_id: id });
}

export async function tmGoalReopen(id: string) {
  return rpc<TmGoal>('tm_goal_reopen', { p_id: id });
}

export async function tmApplyFuture(id: string, patch: Record<string, string | null>) {
  return rpc<TmTask>('tm_apply_future', { p_id: id, p_patch: patch });
}

export async function tmMarkNotificationRead(id: string) {
  return rpc<TmNotification[]>('tm_mark_notification_read', { p_id: id });
}

export async function tmMarkAllNotificationsRead() {
  return rpc<TmNotification[]>('tm_mark_all_notifications_read');
}

export async function tmSetTimeMachine(at: string | null) {
  if (!at) return rpc<{ ok: boolean }>('tm_clear_time_machine');
  return rpc<{ ok: boolean; today?: string }>('tm_set_time_machine', { p_at: at });
}

export async function tmRunTick() {
  return rpc<{ ok: boolean; today?: string; spawned?: number; closed_missed?: number }>('tm_tick');
}

export async function tmListHistory(kind: 'week' | 'month' | 'quarter' | 'year') {
  return rpc<TmHistoryPeriod[]>('tm_list_history', { p_kind: kind });
}

export async function tmGetHistoryPeriod(id: string) {
  return rpc<TmHistoryPeriod>('tm_get_history_period', { p_id: id });
}

export async function tmSetPeriodNote(id: string, note: string) {
  return rpc<TmHistoryPeriod>('tm_set_period_note', { p_period_id: id, p_note: note });
}

export async function tmListHistoryGoals() {
  return rpc<TmHistoryGoal[]>('tm_list_history_goals');
}

export async function tmListBoard() {
  return rpc<{ open: TmTask[]; in_progress: TmTask[]; done: TmTask[] }>('tm_list_board');
}

export async function tmListCalendar(month: string) {
  return rpc<TmTask[]>('tm_list_calendar', { p_month: month });
}

export async function tmSearchTasks(q: string, filters: Record<string, string | boolean | null> = {}) {
  return rpc<TmTask[]>('tm_search_tasks', { p_q: q, p_filters: filters });
}

export async function tmListSavedFilters() {
  return rpc<TmSavedFilter[]>('tm_list_saved_filters');
}

export async function tmSaveFilter(name: string, spec: Record<string, string | boolean | null>, pinned = false) {
  return rpc<TmSavedFilter[]>('tm_save_filter', { p_name: name, p_spec: spec, p_pinned: pinned });
}

export async function tmPinFilter(id: string, pinned: boolean) {
  return rpc<TmSavedFilter[]>('tm_pin_filter', { p_id: id, p_pinned: pinned });
}

export async function tmListEventTemplates() {
  return rpc<{ id: string; name: string; items: { id: string; title: string; days_before: number; size: string; counts: boolean }[] }[]>('tm_list_event_templates');
}

export async function tmUpsertEventTemplate(id: string | null, name: string, items: Record<string, unknown>[]) {
  return rpc<{ id: string; name: string; items: Record<string, unknown>[] }[]>('tm_upsert_event_template', { p_id: id, p_name: name, p_items: items });
}

export async function tmDeleteEventTemplate(id: string) {
  return rpc('tm_delete_event_template', { p_id: id });
}

export async function tmApplyEventTemplate(templateId: string, eventId: string, goalId: string | null, includePast: boolean) {
  return rpc<{ ok: boolean; created: number; skipped: number; folder_id: string }>('tm_apply_event_template', {
    p_template_id: templateId, p_event_id: eventId, p_goal_id: goalId, p_include_past: includePast,
  });
}

export async function tmSetReasons(reasons: string[]) {
  return rpc<string[]>('tm_set_reasons', { p_reasons: reasons });
}

export async function tmReorderFolders(ids: string[]) {
  return rpc<TmFolder[]>('tm_reorder_folders', { p_ids: ids });
}

export async function tmRetireHelper(id: string) {
  return rpc<{ ok: boolean }>('tm_retire_helper', { p_id: id });
}

export async function tmRestoreHelper(id: string) {
  return rpc<{ ok: boolean }>('tm_restore_helper', { p_id: id });
}

export async function tmListPeople() {
  return rpc<{ id: string; full_name: string | null; avatar_url: string | null; role: string; retired: boolean }[]>('tm_list_people');
}

export async function tmListTrash() {
  return rpc<{
    tasks: { id: string; title: string; deleted_at: string }[];
    folders: { id: string; name: string; deleted_at: string }[];
    goals: { id: string; name: string; deleted_at: string }[];
  }>('tm_list_trash');
}

export async function tmRestoreAnything(kind: 'task' | 'folder' | 'goal', id: string) {
  return rpc('tm_restore_anything', { p_kind: kind, p_id: id });
}

export async function tmDismissTips() {
  return rpc<{ ok: boolean }>('tm_dismiss_tips');
}

export async function tmExportBundle() {
  return rpc<{ tasks: unknown[]; goals: unknown[]; history: unknown[] }>('tm_export_bundle');
}
