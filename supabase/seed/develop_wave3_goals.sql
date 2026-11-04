-- Develop-only Wave 3 mockup goals + supporting tasks. Safe to re-run. Never on prod.

do $$
declare
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_helper uuid := 'a0000000-0000-4000-8000-000000000015';
  v_misc uuid;
  v_nov uuid;
  v_inbox uuid;
  v_hubs uuid;
  v_events uuid;
  v_members uuid := 'd0000000-0000-4000-8000-000000000401';
  v_city uuid := 'd0000000-0000-4000-8000-000000000402';
  v_eoy uuid := 'd0000000-0000-4000-8000-000000000403';
  v_q4 uuid := 'd0000000-0000-4000-8000-000000000404';
  v_hubs_goal uuid := 'd0000000-0000-4000-8000-000000000405';
  v_q4_child uuid := 'd0000000-0000-4000-8000-000000000406';
  v_today date := (timezone('America/New_York', now()))::date;
  v_q_start date;
  v_q_end date;
begin
  if current_database() ilike '%bnmty%' then
    raise exception 'ABORT: production database';
  end if;

  select w.starts, w.ends into v_q_start, v_q_end
  from public.tm_period_window('quarter', v_today) w;

  select id into v_misc from public.tm_goals where is_misc and deleted_at is null;
  select id into v_nov from public.tm_goals where name = 'Fill November events' and deleted_at is null;
  select id into v_inbox from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null;
  select id into v_hubs from public.tm_folders where name = 'Hubs' and parent_id is null and deleted_at is null;
  select id into v_events from public.tm_folders where name = 'Events' and parent_id is null and deleted_at is null;

  insert into public.tm_goals (
    id, name, kind, color, status, number_target, number_unit, number_source,
    counts_time_bars, size, range_start, range_end, is_misc
  ) values (
    v_members, '100 new members', 'number', '#C6A664', 'active',
    100, 'members', 'new_members', true, 'XL', v_q_start, v_q_end, false
  )
  on conflict (id) do update set
    number_source = excluded.number_source,
    counts_time_bars = excluded.counts_time_bars,
    size = excluded.size,
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    number_cached_at = null,
    deleted_at = null,
    status = 'active';

  insert into public.tm_goals (id, name, kind, color, status, due_date)
  values
    (v_city, 'Launch City Desk', 'task', '#6B8E9F', 'active', v_today + 3),
    (v_eoy, 'End of Year Party', 'task', '#C47B5A', 'active', v_today + 45),
    (v_q4, 'Q4 Growth Push', 'parent', '#8B7BB8', 'active', v_q_end),
    (v_hubs_goal, 'Hub pages live', 'task', '#E24B4A', 'active', v_today - 4),
    (v_q4_child, 'Q4 outreach', 'task', '#8B7BB8', 'active', v_q_end)
  on conflict (id) do update set
    deleted_at = null,
    status = 'active',
    due_date = excluded.due_date,
    parent_id = excluded.parent_id;

  update public.tm_goals set parent_id = v_q4 where id in (v_q4_child, v_members);

  -- Launch City Desk: two done M tasks = 6/6 = 100%
  insert into public.tm_tasks (id, title, folder_id, status, size, counts, due_date, done_at, created_by)
  values
    ('e0000000-0000-4000-8000-000000000401', 'Write City Desk copy', v_inbox, 'done', 'M', true, v_today - 2, now() - interval '2 days', v_admin),
    ('e0000000-0000-4000-8000-000000000402', 'Ship City Desk page', v_inbox, 'done', 'M', true, v_today - 1, now() - interval '1 day', v_admin),
    ('e0000000-0000-4000-8000-000000000403', 'South End hub page', v_hubs, 'done', 'M', true, v_today - 10, now() - interval '10 days', v_admin),
    ('e0000000-0000-4000-8000-000000000404', 'NoDa hub page', v_hubs, 'open', 'M', true, v_today - 5, null, v_admin),
    ('e0000000-0000-4000-8000-000000000405', 'Plaza hub page', v_hubs, 'open', 'M', true, v_today - 4, null, v_helper),
    ('e0000000-0000-4000-8000-000000000406', 'Book EOY venue', v_events, 'open', 'L', true, v_today + 20, null, v_admin),
    ('e0000000-0000-4000-8000-000000000407', 'EOY invite list', v_events, 'open', 'M', true, v_today + 30, null, v_helper),
    ('e0000000-0000-4000-8000-000000000408', 'Q4 partner emails', v_inbox, 'done', 'M', true, v_today - 3, now() - interval '3 days', v_admin),
    ('e0000000-0000-4000-8000-000000000409', 'Q4 leftover outreach', v_inbox, 'open', 'M', true, v_today + 10, null, v_helper),
    ('e0000000-0000-4000-8000-000000000410', 'Wave3 cancel control', v_inbox, 'cancelled', 'L', true, v_today, null, v_admin),
    ('e0000000-0000-4000-8000-000000000411', 'Helper park request', v_inbox, 'open', 'S', true, v_today + 2, null, v_helper)
  on conflict (id) do update set
    status = excluded.status,
    due_date = excluded.due_date,
    deleted_at = null,
    folder_id = excluded.folder_id,
    cancelled_reason = case when excluded.status = 'cancelled' then 'Assert control' else null end;

  delete from public.tm_task_owners where task_id in (
    'e0000000-0000-4000-8000-000000000401','e0000000-0000-4000-8000-000000000402',
    'e0000000-0000-4000-8000-000000000403','e0000000-0000-4000-8000-000000000404',
    'e0000000-0000-4000-8000-000000000405','e0000000-0000-4000-8000-000000000406',
    'e0000000-0000-4000-8000-000000000407','e0000000-0000-4000-8000-000000000408',
    'e0000000-0000-4000-8000-000000000409','e0000000-0000-4000-8000-000000000410',
    'e0000000-0000-4000-8000-000000000411'
  );
  insert into public.tm_task_owners (task_id, profile_id) values
    ('e0000000-0000-4000-8000-000000000401', v_admin),
    ('e0000000-0000-4000-8000-000000000402', v_admin),
    ('e0000000-0000-4000-8000-000000000403', v_admin),
    ('e0000000-0000-4000-8000-000000000404', v_admin),
    ('e0000000-0000-4000-8000-000000000405', v_helper),
    ('e0000000-0000-4000-8000-000000000406', v_admin),
    ('e0000000-0000-4000-8000-000000000407', v_helper),
    ('e0000000-0000-4000-8000-000000000408', v_admin),
    ('e0000000-0000-4000-8000-000000000409', v_helper),
    ('e0000000-0000-4000-8000-000000000410', v_admin),
    ('e0000000-0000-4000-8000-000000000411', v_helper);

  delete from public.tm_task_goals where task_id in (
    'e0000000-0000-4000-8000-000000000401','e0000000-0000-4000-8000-000000000402',
    'e0000000-0000-4000-8000-000000000403','e0000000-0000-4000-8000-000000000404',
    'e0000000-0000-4000-8000-000000000405','e0000000-0000-4000-8000-000000000406',
    'e0000000-0000-4000-8000-000000000407','e0000000-0000-4000-8000-000000000408',
    'e0000000-0000-4000-8000-000000000409','e0000000-0000-4000-8000-000000000410',
    'e0000000-0000-4000-8000-000000000411'
  );
  insert into public.tm_task_goals (task_id, goal_id) values
    ('e0000000-0000-4000-8000-000000000401', v_city),
    ('e0000000-0000-4000-8000-000000000402', v_city),
    ('e0000000-0000-4000-8000-000000000403', v_hubs_goal),
    ('e0000000-0000-4000-8000-000000000404', v_hubs_goal),
    ('e0000000-0000-4000-8000-000000000405', v_hubs_goal),
    ('e0000000-0000-4000-8000-000000000406', v_eoy),
    ('e0000000-0000-4000-8000-000000000407', v_eoy),
    ('e0000000-0000-4000-8000-000000000408', v_q4_child),
    ('e0000000-0000-4000-8000-000000000409', v_q4_child),
    ('e0000000-0000-4000-8000-000000000410', coalesce(v_misc, v_city)),
    ('e0000000-0000-4000-8000-000000000411', coalesce(v_misc, v_city));

  delete from public.tm_requests where task_id in (
    'e0000000-0000-4000-8000-000000000405',
    'e0000000-0000-4000-8000-000000000411'
  );
  insert into public.tm_requests (task_id, requested_by, kind, reason, status)
  values
    ('e0000000-0000-4000-8000-000000000405', v_helper, 'cancel', 'Please cancel hub page', 'pending'),
    ('e0000000-0000-4000-8000-000000000411', v_helper, 'park', 'Need to park this', 'pending');

  perform public.tm_refresh_number_goal(v_members);
end $$;
