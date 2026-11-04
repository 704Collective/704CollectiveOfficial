-- Develop-only Wave 2 seed: ~25 realistic tasks, 2 goals, mixed owners.
-- Safe to re-run. Never apply on production.

do $$
declare
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_helper uuid := 'a0000000-0000-4000-8000-000000000015';
  v_helper2 uuid;
  v_events uuid;
  v_nov uuid;
  v_mkt uuid;
  v_social uuid;
  v_part uuid;
  v_hubs uuid;
  v_ops uuid;
  v_fin uuid;
  v_misc uuid;
  v_inbox uuid;
  v_temp uuid;
  v_misc_goal uuid;
  v_nov_goal uuid;
  v_today date := (timezone('America/New_York', now()))::date;
  v_week date;
  v_later date := (timezone('America/New_York', now()))::date + 14;
  v_over date := (timezone('America/New_York', now()))::date - 3;
  r record;
begin
  if current_setting('request.jwt.claim.role', true) is null then
    null;
  end if;

  select id into v_events from public.tm_folders where name = 'Events' and parent_id is null and deleted_at is null;
  select id into v_mkt from public.tm_folders where name = 'Marketing' and parent_id is null and deleted_at is null;
  select id into v_part from public.tm_folders where name = 'Partnerships' and parent_id is null and deleted_at is null;
  select id into v_hubs from public.tm_folders where name = 'Hubs' and parent_id is null and deleted_at is null;
  select id into v_ops from public.tm_folders where name = 'Ops' and parent_id is null and deleted_at is null;
  select id into v_fin from public.tm_folders where name = 'Finance' and parent_id is null and deleted_at is null;
  select id into v_misc from public.tm_folders where name = 'Misc' and parent_id is null and deleted_at is null;
  select id into v_inbox from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null;
  select id into v_misc_goal from public.tm_goals where is_misc and deleted_at is null;
  select id into v_nov_goal from public.tm_goals where name = 'Fill November events' and deleted_at is null;

  select id into v_helper2
  from public.profiles
  where role = 'admin' and id <> v_helper and deleted_at is null
  order by created_at
  limit 1;
  if v_helper2 is null then
    v_helper2 := v_helper;
  end if;

  v_week := case
    when extract(isodow from v_today) < 7 then v_today + 1
    else v_today + 8
  end;

  insert into public.tm_folders (id, name, color, parent_id, sort)
  values
    ('f0000000-0000-4000-8000-000000000011', 'November Nights', '#C6A664', v_events, 11),
    ('f0000000-0000-4000-8000-000000000021', 'Social', '#6B8E9F', v_mkt, 21),
    ('f0000000-0000-4000-8000-000000000099', 'Temp Delete', '#8A8A8A', null, 90)
  on conflict (id) do update set deleted_at = null, archived_at = null, parent_id = excluded.parent_id;

  v_nov := 'f0000000-0000-4000-8000-000000000011';
  v_social := 'f0000000-0000-4000-8000-000000000021';
  v_temp := 'f0000000-0000-4000-8000-000000000099';

  -- title, folder, due, status, size, counts, needs_home, owner, goal, repeat, done_at
  for r in
    select * from (values
      ('e0000000-0000-4000-8000-000000000201'::uuid, 'Book November venue', v_events, v_today, 'open', 'L', true, false, v_admin, v_nov_goal, 'none', null::timestamptz),
      ('e0000000-0000-4000-8000-000000000202', 'Confirm DJ for Nov 14', v_nov, v_week, 'in_progress', 'M', true, false, v_helper, v_nov_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000203', 'Finalize guest list', v_events, v_over, 'open', 'M', true, false, v_admin, v_nov_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000204', 'Print name tags', v_events, v_later, 'open', 'S', true, false, v_helper, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000205', 'Walk through venue', v_events, null, 'open', 'M', false, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000206', 'Post Instagram recap', v_social, v_today, 'open', 'S', true, false, v_helper, v_misc_goal, 'weekly', null),
      ('e0000000-0000-4000-8000-000000000207', 'Schedule newsletter', v_mkt, v_week, 'open', 'M', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000208', 'Film member testimonial', v_mkt, v_later, 'open', 'L', true, false, v_helper2, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000209', 'Update link in bio', v_mkt, v_today - 1, 'done', 'S', true, false, v_admin, v_misc_goal, 'none', now() - interval '1 day'),
      ('e0000000-0000-4000-8000-000000000210', 'Coffee with partner lead', v_part, v_today, 'open', 'S', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000211', 'Send partnership deck', v_part, v_over, 'open', 'M', true, false, v_helper, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000212', 'Review bar tab invoice', v_part, v_week, 'open', 'S', false, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000213', 'Draft South End guide', v_hubs, v_later, 'open', 'L', true, false, v_helper2, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000214', 'Confirm hub host', v_hubs, null, 'open', 'M', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000215', 'Order extra wristbands', v_ops, v_today, 'open', 'S', true, false, v_helper, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000216', 'Restock nametags', v_ops, v_week, 'open', 'S', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000217', 'Fix door iPad', v_ops, v_over, 'in_progress', 'M', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000218', 'Reconcile October Stripe', v_fin, v_week, 'open', 'L', false, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000219', 'Send November invoices', v_fin, v_later, 'open', 'M', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000220', 'Call the florist back', v_inbox, v_today, 'open', 'S', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000221', 'Buy thank-you cards', v_misc, null, 'open', 'S', true, false, v_helper, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000222', 'Reply to venue insurance', v_inbox, v_over, 'open', 'M', true, false, v_admin, v_misc_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000223', 'Collect RSVP photos', v_events, v_week, 'open', 'M', true, false, v_helper, v_nov_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000224', 'Write host script', v_nov, v_later, 'open', 'M', true, false, v_admin, v_nov_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000225', 'Confirm photographer', v_events, v_week, 'open', 'M', true, false, v_helper2, v_nov_goal, 'none', null),
      ('e0000000-0000-4000-8000-000000000226', 'Share parking note', v_ops, v_today - 2, 'done', 'S', true, false, v_helper, v_misc_goal, 'none', now() - interval '2 days'),
      ('e0000000-0000-4000-8000-000000000227', 'Temporary task in Temp Delete', v_temp, null, 'open', 'S', false, false, v_admin, v_misc_goal, 'none', null)
    ) as t(id, title, folder, due, status, size, counts, needs_home, owner, goal, repeat, done_at)
  loop
    insert into public.tm_tasks (
      id, title, folder_id, due_date, status, size, priority, counts, needs_home, repeat, created_by, done_at, done_late
    ) values (
      r.id, r.title, r.folder, r.due, r.status, r.size, 'normal', r.counts, r.needs_home, r.repeat, v_admin, r.done_at,
      r.status = 'done' and r.due is not null and r.due < v_today
    )
    on conflict (id) do update set
      title = excluded.title,
      folder_id = excluded.folder_id,
      due_date = excluded.due_date,
      status = excluded.status,
      size = excluded.size,
      counts = excluded.counts,
      needs_home = excluded.needs_home,
      repeat = excluded.repeat,
      done_at = excluded.done_at,
      deleted_at = null;

    delete from public.tm_task_owners where task_id = r.id;
    insert into public.tm_task_owners (task_id, profile_id) values (r.id, r.owner);
    -- mixed owners on a couple of tasks
    if r.id in (
      'e0000000-0000-4000-8000-000000000201',
      'e0000000-0000-4000-8000-000000000203',
      'e0000000-0000-4000-8000-000000000217'
    ) then
      insert into public.tm_task_owners (task_id, profile_id) values (r.id, v_helper) on conflict do nothing;
    end if;

    delete from public.tm_task_goals where task_id = r.id;
    if r.goal is not null then
      insert into public.tm_task_goals (task_id, goal_id) values (r.id, r.goal);
    end if;
  end loop;

  insert into public.events (id, title, start_time, end_time, is_published, status, ticket_mode, capacity)
  values (
    'c0000000-0000-4000-8000-000000000099',
    'SEED unpublished helper wall',
    now() + interval '14 days',
    now() + interval '14 days 3 hours',
    false,
    'scheduled',
    'none',
    10
  )
  on conflict (id) do update set is_published = false, title = excluded.title;
end $$;
