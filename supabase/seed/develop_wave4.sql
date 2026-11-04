-- Develop-only Wave 4 seed: repeating tasks, pushed-3x task, extra overdue goal.
-- Safe to re-run. Never on prod.

do $$
declare
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_helper uuid := 'a0000000-0000-4000-8000-000000000015';
  v_inbox uuid;
  v_misc uuid;
  v_today date := public.tm_charlotte_today();
  v_reels uuid := 'e0000000-0000-4000-8000-000000000501';
  v_sync uuid := 'e0000000-0000-4000-8000-000000000502';
  v_push uuid := 'e0000000-0000-4000-8000-000000000503';
  v_goal uuid := 'd0000000-0000-4000-8000-000000000501';
  v_goal_b uuid := 'd0000000-0000-4000-8000-000000000502';
  v_series_reels uuid := 'f0000000-0000-4000-8000-000000000501';
  v_series_sync uuid := 'f0000000-0000-4000-8000-000000000502';
begin
  if current_database() ilike '%bnmty%' then
    raise exception 'ABORT: production database';
  end if;

  select id into v_inbox from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null;
  select id into v_misc from public.tm_goals where is_misc and deleted_at is null;

  insert into public.tm_goals (id, name, kind, color, status, due_date)
  values
    (v_goal, 'Wave4 overdue goal', 'task', '#E24B4A', 'active', v_today - 10),
    (v_goal_b, 'Wave4 overdue goal B', 'task', '#E24B4A', 'active', v_today - 14)
  on conflict (id) do update set due_date = excluded.due_date, deleted_at = null, status = 'active';

  insert into public.tm_tasks (
    id, title, folder_id, status, size, counts, due_date, repeat, repeat_series_id, repeat_anchor_date, created_by
  ) values
    (v_reels, 'Weekly counted reels', v_inbox, 'open', 'M', true, v_today, 'weekly', v_series_reels, v_today, v_admin),
    (v_sync, 'Weekly exempt sync', v_inbox, 'open', 'S', false, v_today, 'weekly', v_series_sync, v_today, v_admin),
    (v_push, 'Pushed three times already', v_inbox, 'open', 'M', true, v_today - 10, 'none', null, null, v_admin)
  on conflict (id) do update set
    due_date = excluded.due_date,
    status = 'open',
    deleted_at = null,
    counts = excluded.counts,
    repeat = excluded.repeat,
    repeat_series_id = excluded.repeat_series_id,
    repeat_anchor_date = excluded.repeat_anchor_date,
    pushed_count = case when tm_tasks.id = v_push then 3 else tm_tasks.pushed_count end,
    missed = false;

  update public.tm_tasks set pushed_count = 3 where id = v_push;

  delete from public.tm_task_owners where task_id in (v_reels, v_sync, v_push);
  insert into public.tm_task_owners (task_id, profile_id) values
    (v_reels, v_admin),
    (v_sync, v_admin),
    (v_push, v_admin),
    (v_reels, v_helper);

  delete from public.tm_task_goals where task_id in (v_reels, v_sync, v_push);
  insert into public.tm_task_goals (task_id, goal_id) values
    (v_reels, coalesce(v_misc, v_goal)),
    (v_sync, coalesce(v_misc, v_goal)),
    (v_push, v_goal);
end $$;
