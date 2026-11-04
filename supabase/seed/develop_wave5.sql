-- Develop-only Wave 5 seed: history goals + a lock-test task.
-- Safe to re-run. Never on prod.

do $$
declare
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_inbox uuid;
  v_misc uuid;
  v_city uuid := 'd0000000-0000-4000-8000-000000000402';
  v_fail uuid := 'd0000000-0000-4000-8000-000000000601';
  v_cancel uuid := 'd0000000-0000-4000-8000-000000000602';
  v_miss uuid := 'e0000000-0000-4000-8000-000000000603';
  v_canc_task uuid := 'e0000000-0000-4000-8000-000000000601';
  v_exempt uuid := 'e0000000-0000-4000-8000-000000000602';
  v_today date := public.tm_charlotte_today();
  v_week_start date;
begin
  if current_database() ilike '%bnmty%' then
    raise exception 'ABORT: production database';
  end if;

  select w.starts into v_week_start from public.tm_period_window('week', v_today) w;
  select id into v_inbox from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null;
  select id into v_misc from public.tm_goals where is_misc and deleted_at is null;

  -- Launch City Desk is already 100% — mark complete + history row.
  update public.tm_goals
  set status = 'completed', completed_at = coalesce(completed_at, public.tm_effective_now()), updated_at = now()
  where id = v_city and deleted_at is null and status is distinct from 'completed';
  if exists (select 1 from public.tm_goals where id = v_city and status = 'completed')
     and not exists (
       select 1 from public.tm_history_goals
       where goal_id = v_city and status = 'completed' and removed_at is null
     ) then
    perform public.tm_record_goal_history(v_city, 'completed', null);
  end if;

  insert into public.tm_goals (id, name, kind, color, status, due_date)
  values
    (v_fail, 'Wave5 failed goal', 'task', '#E24B4A', 'active', v_today - 20),
    (v_cancel, 'Wave5 cancelled goal', 'task', '#8A8A8A', 'active', v_today + 10)
  on conflict (id) do update set
    deleted_at = null,
    name = excluded.name,
    due_date = excluded.due_date;

  delete from public.tm_history_goals where goal_id in (v_fail, v_cancel);
  delete from public.tm_fix_log where goal_id = v_fail and action = 'extend';

  insert into public.tm_fix_log (goal_id, action, reason, actor, old_value, new_value)
  values (
    v_fail, 'extend', 'Need another month', v_admin,
    jsonb_build_object('due_date', (v_today - 20)::text, 'pct', 40),
    jsonb_build_object('due_date', (v_today + 20)::text)
  );
  update public.tm_goals
  set status = 'failed', failed_at = public.tm_effective_now(), due_date = v_today + 20, pushed_count = 1, updated_at = now()
  where id = v_fail;
  perform public.tm_record_goal_history(v_fail, 'failed', null);

  update public.tm_goals
  set status = 'cancelled', cancelled_reason = 'Priorities changed', updated_at = now()
  where id = v_cancel;
  perform public.tm_record_goal_history(v_cancel, 'cancelled', 'Priorities changed');

  insert into public.tm_tasks (
    id, title, folder_id, status, size, counts, due_date, cancelled_reason, created_by
  ) values
    (v_miss, 'Wave5 lock missed', v_inbox, 'open', 'M', true, v_week_start + 3, null, v_admin),
    (v_canc_task, 'Wave5 cancelled in week', v_inbox, 'cancelled', 'S', true, v_week_start + 2, 'Priorities changed', v_admin),
    (v_exempt, 'Wave5 not counted in week', v_inbox, 'open', 'S', false, v_week_start + 4, null, v_admin)
  on conflict (id) do update set
    due_date = excluded.due_date,
    status = excluded.status,
    counts = excluded.counts,
    cancelled_reason = excluded.cancelled_reason,
    deleted_at = null,
    missed = false,
    done_late = false,
    done_at = null;

  delete from public.tm_task_owners where task_id in (v_miss, v_canc_task, v_exempt);
  insert into public.tm_task_owners (task_id, profile_id) values
    (v_miss, v_admin),
    (v_canc_task, v_admin),
    (v_exempt, v_admin);

  delete from public.tm_task_goals where task_id in (v_miss, v_canc_task, v_exempt);
  if v_misc is not null then
    insert into public.tm_task_goals (task_id, goal_id) values
      (v_miss, v_misc),
      (v_canc_task, v_misc),
      (v_exempt, v_misc);
  end if;

  perform public.tm_backfill_history();
end $$;
