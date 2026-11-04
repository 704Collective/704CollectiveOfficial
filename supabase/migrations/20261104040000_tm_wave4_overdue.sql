-- Wave 4: overdue engine, repeats, notifications, time machine, leftovers.
-- Develop only. Production must ignore time_machine.

alter table public.tm_tasks
  add column if not exists repeat_anchor_date date,
  add column if not exists missed boolean not null default false;

alter table public.tm_fix_log drop constraint if exists tm_fix_log_action_check;
alter table public.tm_fix_log
  add constraint tm_fix_log_action_check check (action in (
    'reschedule', 'park', 'done_late', 'cancel', 'extend', 'fail',
    'complete', 'reopen', 'counts_on', 'counts_off', 'move', 'missed', 'undo'
  ));

drop index if exists public.tm_notif_once_task;
drop index if exists public.tm_notif_once_goal;
create unique index tm_notif_once_task
  on public.tm_notifications (profile_id, task_id, kind)
  where task_id is not null
    and kind in ('assigned', 'due_soon', 'due_today', 'overdue', 'needs_decision', 'request');
create unique index tm_notif_once_goal
  on public.tm_notifications (profile_id, goal_id, kind)
  where goal_id is not null
    and kind in ('goal_ready', 'goal_overdue');

insert into public.tm_settings (key, value) values
  ('honor_time_machine', 'false'::jsonb),
  ('person_chip_allowlist', '[]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Time + leftovers
-- ---------------------------------------------------------------------------

create or replace function public.tm_effective_now()
returns timestamptz
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v jsonb;
  honor jsonb;
  d timestamptz;
begin
  if current_database() ilike '%bnmty%' then
    return now();
  end if;
  select value into honor from public.tm_settings where key = 'honor_time_machine';
  if honor is distinct from 'true'::jsonb then
    return now();
  end if;
  select value into v from public.tm_settings where key = 'time_machine';
  if v is null or v = 'null'::jsonb then
    return now();
  end if;
  begin
    d := (v #>> '{}')::timestamptz;
  exception when others then
    return now();
  end;
  return coalesce(d, now());
end;
$$;

create or replace function public.tm_charlotte_today()
returns date
language sql
stable
security definer
set search_path to public
as $$
  select (timezone('America/New_York', public.tm_effective_now()))::date;
$$;

create or replace function public.tm_notify(
  p_profile uuid, p_kind text, p_title text, p_body text, p_task uuid, p_goal uuid
)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  insert into public.tm_notifications (profile_id, kind, title, body, task_id, goal_id)
  values (p_profile, p_kind, p_title, p_body, p_task, p_goal)
  on conflict do nothing;
end;
$$;

create or replace function public.tm_staff_people()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  allow jsonb;
begin
  select value into allow from public.tm_settings where key = 'person_chip_allowlist';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'role', p.role
    ) order by p.role desc, p.full_name)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is null
      and p.role in ('super_admin', 'admin')
      and coalesce(p.email, '') not ilike 'hello@%'
      and (
        p.role = 'super_admin'
        or exists (select 1 from public.tm_task_owners o where o.profile_id = p.id)
        or (u.last_sign_in_at is not null and u.last_sign_in_at > public.tm_effective_now() - interval '90 days')
      )
      and (
        coalesce(p.email, '') not ilike '%@704collective.dev'
        or p.email in (select jsonb_array_elements_text(coalesce(allow, '[]'::jsonb)))
      )
  ), '[]'::jsonb);
end;
$$;

-- Wave 3 leftover: counted list excludes cancelled
create or replace function public.tm_get_goal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_base jsonb;
begin
  perform public.tm_require_staff();
  if not public.tm_goal_can_see(p_id) then raise exception 'forbidden'; end if;
  select * into g from public.tm_goals where id = p_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;
  v_base := public.tm_goal_json(p_id);
  return v_base || jsonb_build_object(
    'children', coalesce((
      select jsonb_agg(public.tm_goal_json(c.id) order by c.name)
      from public.tm_goals c
      where c.parent_id = g.id and c.deleted_at is null
        and (public.tm_is_super_admin() or public.tm_goal_can_see(c.id))
    ), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'delta', l.delta, 'note', l.note,
        'logged_at', l.logged_at, 'logged_by_name', p.full_name
      ) order by l.logged_at desc)
      from public.tm_goal_progress_log l
      left join public.profiles p on p.id = l.logged_by
      where l.goal_id = g.id
    ), '[]'::jsonb),
    'counted_tasks', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
      from public.tm_task_goals tg
      join public.tm_tasks t on t.id = tg.task_id
      where tg.goal_id = g.id and t.deleted_at is null and t.counts
        and t.status is distinct from 'cancelled'
        and (public.tm_is_super_admin() or public.tm_can_see_task(t.id))
    ), '[]'::jsonb),
    'not_counted_tasks', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
      from public.tm_task_goals tg
      join public.tm_tasks t on t.id = tg.task_id
      where tg.goal_id = g.id and t.deleted_at is null and not t.counts
        and t.status is distinct from 'cancelled'
        and (public.tm_is_super_admin() or public.tm_can_see_task(t.id))
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Task JSON extras + list_tasks column list
-- ---------------------------------------------------------------------------

create or replace function public.tm_task_json(p_task public.tm_tasks)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v jsonb;
  v_super boolean := public.tm_is_super_admin();
  v_folder public.tm_folders;
  v_parent public.tm_folders;
  v_today date := public.tm_charlotte_today();
  v_overdue boolean;
begin
  v_overdue := public.tm_task_is_overdue(p_task);
  if p_task.folder_id is not null then
    select * into v_folder from public.tm_folders where id = p_task.folder_id;
    if v_folder.parent_id is not null then
      select * into v_parent from public.tm_folders where id = v_folder.parent_id;
    end if;
  end if;
  v := jsonb_build_object(
    'id', p_task.id,
    'title', p_task.title,
    'notes', p_task.notes,
    'status', p_task.status,
    'size', p_task.size,
    'priority', p_task.priority,
    'due_date', p_task.due_date,
    'due_time', p_task.due_time,
    'counts', p_task.counts,
    'repeat', p_task.repeat,
    'repeat_series_id', p_task.repeat_series_id,
    'repeat_anchor_date', p_task.repeat_anchor_date,
    'needs_home', p_task.needs_home,
    'pushed_count', p_task.pushed_count,
    'cancelled_reason', p_task.cancelled_reason,
    'done_at', p_task.done_at,
    'done_late', p_task.done_late,
    'missed', p_task.missed,
    'created_at', p_task.created_at,
    'updated_at', p_task.updated_at,
    'overdue', v_overdue,
    'due_soon', (
      not v_overdue
      and p_task.status not in ('done', 'cancelled')
      and p_task.due_date is not null
      and p_task.due_date >= v_today
      and p_task.due_date <= v_today + 2
    ),
    'folder_color', coalesce(v_folder.color, v_parent.color, '#8A8A8A'),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'role', p.role
      ) order by p.full_name)
      from public.tm_task_owners o
      join public.profiles p on p.id = o.profile_id
      where o.task_id = p_task.id
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'color', g.color, 'is_misc', g.is_misc
      ) order by g.is_misc desc, g.name)
      from public.tm_task_goals tg
      join public.tm_goals g on g.id = tg.goal_id
      where tg.task_id = p_task.id and g.deleted_at is null
    ), '[]'::jsonb)
  );
  if v_super then
    v := v || jsonb_build_object(
      'folder_id', p_task.folder_id,
      'folder_name', v_folder.name,
      'parent_folder_name', v_parent.name
    );
  end if;
  return v;
end;
$$;

create or replace function public.tm_list_tasks()
returns setof public.tm_tasks
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if public.tm_is_super_admin() then
    return query select t.* from public.tm_tasks t where t.deleted_at is null;
    return;
  end if;
  if public.tm_is_helper_admin() then
    return query
      select
        t.id, t.title, t.notes, null::uuid, t.status, t.size, t.priority,
        t.due_date, t.due_time, t.counts, t.repeat, t.repeat_series_id, t.event_id,
        t.needs_home, t.pushed_count, t.cancelled_reason, t.done_at, t.done_late,
        t.created_by, t.deleted_at, t.created_at, t.updated_at,
        t.repeat_anchor_date, t.missed
      from public.tm_tasks t
      join public.tm_task_owners o on o.task_id = t.id
      where o.profile_id = auth.uid() and t.deleted_at is null;
    return;
  end if;
  raise exception 'forbidden';
end;
$$;

-- ---------------------------------------------------------------------------
-- Repeats
-- ---------------------------------------------------------------------------

create or replace function public.tm_next_repeat_date(p_anchor date, p_repeat text, p_after date)
returns date
language plpgsql
immutable
as $$
declare
  n int := 1;
  v date;
begin
  if p_anchor is null or p_after is null then return null; end if;
  if p_repeat = 'weekly' then
    n := greatest(1, ceil(((p_after - p_anchor) + 1)::numeric / 7.0)::int);
    return p_anchor + (n * 7);
  end if;
  loop
    if p_repeat = 'monthly' then
      v := (p_anchor + (n || ' months')::interval)::date;
    elsif p_repeat = 'quarterly' then
      v := (p_anchor + (n * 3 || ' months')::interval)::date;
    elsif p_repeat = 'yearly' then
      v := (p_anchor + (n || ' years')::interval)::date;
    else
      return null;
    end if;
    if v > p_after then return v; end if;
    n := n + 1;
    if n > 600 then return null; end if;
  end loop;
end;
$$;

create or replace function public.tm_clone_repeat(p_from uuid, p_due date)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  src public.tm_tasks;
  v_id uuid;
begin
  select * into src from public.tm_tasks where id = p_from;
  if src.id is null or src.repeat = 'none' then return null; end if;
  if exists (
    select 1 from public.tm_tasks t
    where t.repeat_series_id = src.repeat_series_id
      and t.deleted_at is null
      and t.due_date = p_due
  ) then
    return null;
  end if;
  insert into public.tm_tasks (
    title, notes, folder_id, status, size, priority, due_date, due_time, counts,
    repeat, repeat_series_id, repeat_anchor_date, event_id, needs_home, created_by
  ) values (
    src.title, src.notes, src.folder_id, 'open', src.size, src.priority, p_due, src.due_time, src.counts,
    src.repeat, src.repeat_series_id, src.repeat_anchor_date, src.event_id, src.needs_home, src.created_by
  ) returning id into v_id;
  insert into public.tm_task_owners (task_id, profile_id)
  select v_id, profile_id from public.tm_task_owners where task_id = src.id;
  insert into public.tm_task_goals (task_id, goal_id)
  select v_id, goal_id from public.tm_task_goals where task_id = src.id;
  return v_id;
end;
$$;

create or replace function public.tm_spawn_next_repeat(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  src public.tm_tasks;
  v_next date;
begin
  select * into src from public.tm_tasks where id = p_id;
  if src.repeat = 'none' or src.repeat_series_id is null or src.repeat_anchor_date is null or src.due_date is null then
    return null;
  end if;
  if exists (
    select 1 from public.tm_tasks t
    where t.repeat_series_id = src.repeat_series_id
      and t.deleted_at is null
      and t.status in ('open', 'in_progress')
      and t.due_date > src.due_date
  ) then
    return null;
  end if;
  v_next := public.tm_next_repeat_date(src.repeat_anchor_date, src.repeat, src.due_date);
  if v_next is null then return null; end if;
  return public.tm_clone_repeat(p_id, v_next);
end;
$$;

create or replace function public.tm_close_older_missed()
returns int
language plpgsql
security definer
set search_path to public
as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select t.id
    from public.tm_tasks t
    where t.deleted_at is null
      and t.repeat is distinct from 'none'
      and t.repeat_series_id is not null
      and t.status in ('open', 'in_progress')
      and public.tm_task_is_overdue(t)
      and exists (
        select 1 from public.tm_tasks newer
        where newer.repeat_series_id = t.repeat_series_id
          and newer.deleted_at is null
          and newer.id is distinct from t.id
          and newer.due_date > t.due_date
          and public.tm_task_is_overdue(newer)
      )
  loop
    update public.tm_tasks
    set status = 'cancelled',
        cancelled_reason = 'Missed (no reason given)',
        missed = true
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Snapshot / fix / undo
-- ---------------------------------------------------------------------------

create or replace function public.tm_task_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to public
as $$
  select jsonb_build_object(
    'due_date', t.due_date,
    'due_time', t.due_time,
    'status', t.status,
    'folder_id', t.folder_id,
    'pushed_count', t.pushed_count,
    'done_late', t.done_late,
    'done_at', t.done_at,
    'cancelled_reason', t.cancelled_reason,
    'missed', t.missed,
    'owners', coalesce((select jsonb_agg(o.profile_id) from public.tm_task_owners o where o.task_id = t.id), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(g.goal_id) from public.tm_task_goals g where g.task_id = t.id), '[]'::jsonb)
  )
  from public.tm_tasks t
  where t.id = p_id;
$$;

create or replace function public.tm_fix_task(
  p_task_id uuid,
  p_action text,
  p_reason text,
  p_note text,
  p_new_due date,
  p_new_folder uuid,
  p_new_goal uuid,
  p_new_owners uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  t public.tm_tasks;
  v_super boolean := public.tm_is_super_admin();
  v_old jsonb;
  v_log uuid;
  v_req uuid;
  v_owner uuid;
begin
  perform public.tm_require_staff();
  if p_action not in ('reschedule', 'park', 'done_late', 'cancel', 'missed') then
    raise exception 'invalid_action';
  end if;
  if not public.tm_can_see_task(p_task_id) then raise exception 'forbidden'; end if;
  select * into t from public.tm_tasks where id = p_task_id and deleted_at is null;
  if t.id is null then raise exception 'not_found'; end if;
  if not v_super then
    if not exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid()) then
      raise exception 'forbidden';
    end if;
    if p_action in ('park', 'cancel') then
      insert into public.tm_requests (task_id, requested_by, kind, reason, note)
      values (p_task_id, auth.uid(), p_action, nullif(trim(p_reason), ''), nullif(trim(p_note), ''))
      returning id into v_req;
      insert into public.tm_fix_log (task_id, action, reason, note, actor, old_value, new_value)
      values (p_task_id, p_action, p_reason, p_note, auth.uid(), public.tm_task_snapshot(p_task_id),
              jsonb_build_object('request_id', v_req, 'pending', true))
      returning id into v_log;
      perform public.tm_write_activity(p_task_id, 'request', jsonb_build_object('kind', p_action, 'request_id', v_req));
      insert into public.tm_notifications (profile_id, kind, title, body, task_id)
      select p.id, 'request', 'Request needs a look', t.title, p_task_id
      from public.profiles p
      where p.role = 'super_admin' and p.deleted_at is null
        and coalesce(p.email, '') not ilike 'hello@704collective.com'
      on conflict do nothing;
      return jsonb_build_object('ok', true, 'pending_request', true, 'fix_log_id', v_log, 'task', public.tm_task_json(t));
    end if;
    if p_action not in ('reschedule', 'done_late', 'missed') then
      raise exception 'forbidden';
    end if;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;
  if p_action = 'reschedule' and t.repeat is distinct from 'none' and public.tm_task_is_overdue(t) then
    raise exception 'no_reschedule';
  end if;

  v_old := public.tm_task_snapshot(p_task_id);

  if p_action = 'reschedule' then
    if p_new_due is null then raise exception 'reason_required'; end if;
    update public.tm_tasks
    set due_date = p_new_due,
        folder_id = coalesce(p_new_folder, folder_id),
        pushed_count = pushed_count + 1
    where id = p_task_id
    returning * into t;
  elsif p_action = 'park' then
    update public.tm_tasks set due_date = null, due_time = null where id = p_task_id returning * into t;
  elsif p_action = 'done_late' then
    update public.tm_tasks
    set status = 'done', done_at = public.tm_effective_now(), done_late = true
    where id = p_task_id
    returning * into t;
    perform public.tm_spawn_next_repeat(p_task_id);
  elsif p_action = 'cancel' then
    update public.tm_tasks
    set status = 'cancelled', cancelled_reason = trim(p_reason), missed = false
    where id = p_task_id
    returning * into t;
  elsif p_action = 'missed' then
    update public.tm_tasks
    set status = 'cancelled', cancelled_reason = trim(p_reason), missed = true
    where id = p_task_id
    returning * into t;
  end if;

  if p_new_goal is not null and v_super then
    delete from public.tm_task_goals where task_id = p_task_id;
    insert into public.tm_task_goals (task_id, goal_id) values (p_task_id, p_new_goal);
  end if;
  if p_new_owners is not null and v_super then
    delete from public.tm_task_owners where task_id = p_task_id;
    foreach v_owner in array p_new_owners loop
      insert into public.tm_task_owners (task_id, profile_id) values (p_task_id, v_owner) on conflict do nothing;
    end loop;
  end if;

  insert into public.tm_fix_log (task_id, action, reason, note, actor, old_value, new_value)
  values (p_task_id, p_action, p_reason, p_note, auth.uid(), v_old, public.tm_task_snapshot(p_task_id))
  returning id into v_log;
  perform public.tm_write_activity(p_task_id, p_action, jsonb_build_object('reason', p_reason, 'note', p_note));
  select * into t from public.tm_tasks where id = p_task_id;
  return jsonb_build_object('ok', true, 'pending_request', false, 'fix_log_id', v_log, 'task', public.tm_task_json(t));
end;
$$;

create or replace function public.tm_fix_tasks(
  p_task_ids uuid[],
  p_action text,
  p_reason text,
  p_note text,
  p_new_due date,
  p_new_folder uuid,
  p_new_goal uuid,
  p_new_owners uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  id uuid;
  rows jsonb := '[]'::jsonb;
begin
  if p_task_ids is null then raise exception 'not_found'; end if;
  foreach id in array p_task_ids loop
    rows := rows || jsonb_build_array(
      public.tm_fix_task(id, p_action, p_reason, p_note, p_new_due, p_new_folder, p_new_goal, p_new_owners)
    );
  end loop;
  return jsonb_build_object('ok', true, 'results', rows);
end;
$$;

create or replace function public.tm_undo_fix(p_fix_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  l public.tm_fix_log;
  t public.tm_tasks;
  v_owner uuid;
  v_goal uuid;
begin
  perform public.tm_require_staff();
  select * into l from public.tm_fix_log where id = p_fix_log_id;
  if l.id is null then raise exception 'not_found'; end if;
  if l.task_id is null then raise exception 'not_found'; end if;
  if not public.tm_is_super_admin() and l.actor is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if (l.new_value->>'pending')::boolean is true then
    delete from public.tm_requests
    where id = (l.new_value->>'request_id')::uuid and status = 'pending';
    return jsonb_build_object('ok', true);
  end if;
  update public.tm_tasks
  set
    due_date = nullif(l.old_value->>'due_date', '')::date,
    due_time = nullif(l.old_value->>'due_time', '')::time,
    status = coalesce(l.old_value->>'status', status),
    folder_id = nullif(l.old_value->>'folder_id', '')::uuid,
    pushed_count = coalesce((l.old_value->>'pushed_count')::int, pushed_count),
    done_late = coalesce((l.old_value->>'done_late')::boolean, false),
    done_at = nullif(l.old_value->>'done_at', '')::timestamptz,
    cancelled_reason = l.old_value->>'cancelled_reason',
    missed = coalesce((l.old_value->>'missed')::boolean, false)
  where id = l.task_id
  returning * into t;
  if l.old_value ? 'owners' then
    delete from public.tm_task_owners where task_id = l.task_id;
    for v_owner in select jsonb_array_elements_text(l.old_value->'owners')::uuid
    loop
      insert into public.tm_task_owners (task_id, profile_id) values (l.task_id, v_owner) on conflict do nothing;
    end loop;
  end if;
  if l.old_value ? 'goals' then
    delete from public.tm_task_goals where task_id = l.task_id;
    for v_goal in select jsonb_array_elements_text(l.old_value->'goals')::uuid
    loop
      insert into public.tm_task_goals (task_id, goal_id) values (l.task_id, v_goal) on conflict do nothing;
    end loop;
  end if;
  insert into public.tm_fix_log (task_id, action, actor, old_value, new_value)
  values (l.task_id, 'undo', auth.uid(), public.tm_task_snapshot(l.task_id), l.old_value);
  perform public.tm_write_activity(l.task_id, 'undo', jsonb_build_object('fix_log_id', p_fix_log_id));
  return jsonb_build_object('ok', true, 'task', public.tm_task_json(t));
end;
$$;

-- ---------------------------------------------------------------------------
-- Goal overdue actions
-- ---------------------------------------------------------------------------

create or replace function public.tm_goal_extend(p_id uuid, p_new_due date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
begin
  perform public.tm_require_super();
  if p_new_due is null or coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into g from public.tm_goals where id = p_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;
  insert into public.tm_fix_log (goal_id, action, reason, actor, old_value, new_value)
  values (p_id, 'extend', p_reason, auth.uid(), jsonb_build_object('due_date', g.due_date), jsonb_build_object('due_date', p_new_due));
  update public.tm_goals
  set due_date = p_new_due, pushed_count = pushed_count + 1, status = case when status = 'failed' then 'active' else status end, updated_at = now()
  where id = p_id;
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_goal_fail(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_goals
  set status = 'failed', failed_at = public.tm_effective_now(), updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  insert into public.tm_fix_log (goal_id, action, actor, new_value)
  values (p_id, 'fail', auth.uid(), jsonb_build_object('status', 'failed'));
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_goal_reopen(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_goals
  set status = 'active', completed_at = null, failed_at = null, updated_at = now()
  where id = p_id and deleted_at is null and is_misc = false;
  if not found then raise exception 'not_found'; end if;
  insert into public.tm_fix_log (goal_id, action, actor, new_value)
  values (p_id, 'reopen', auth.uid(), jsonb_build_object('status', 'active'));
  return public.tm_goal_json(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Repeat edits + status spawn
-- ---------------------------------------------------------------------------

create or replace function public.tm_set_repeat(p_id uuid, p_repeat text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  if p_repeat not in ('none', 'weekly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'invalid_repeat';
  end if;
  select * into v_task from public.tm_tasks where id = p_id and deleted_at is null;
  if v_task.id is null then raise exception 'not_found'; end if;
  if p_repeat is distinct from 'none' and v_task.due_date is null then
    raise exception 'reason_required';
  end if;
  update public.tm_tasks
  set
    repeat = p_repeat,
    repeat_series_id = case
      when p_repeat = 'none' then repeat_series_id
      else coalesce(repeat_series_id, gen_random_uuid())
    end,
    repeat_anchor_date = case
      when p_repeat = 'none' then repeat_anchor_date
      else coalesce(repeat_anchor_date, due_date)
    end
  where id = p_id
  returning * into v_task;
  if p_repeat = 'none' then
    update public.tm_tasks
    set repeat = 'none'
    where repeat_series_id = v_task.repeat_series_id
      and deleted_at is null
      and (due_date is null or due_date >= v_task.due_date);
  end if;
  perform public.tm_write_activity(p_id, 'repeat', jsonb_build_object('repeat', p_repeat));
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_apply_future(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  src public.tm_tasks;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  select * into src from public.tm_tasks where id = p_id and deleted_at is null;
  if src.id is null then raise exception 'not_found'; end if;
  update public.tm_tasks t
  set
    title = coalesce(p_patch->>'title', t.title),
    notes = coalesce(p_patch->>'notes', t.notes),
    size = coalesce(p_patch->>'size', t.size),
    repeat = coalesce(p_patch->>'repeat', t.repeat),
    folder_id = coalesce(nullif(p_patch->>'folder_id', '')::uuid, t.folder_id)
  where t.repeat_series_id = src.repeat_series_id
    and t.deleted_at is null
    and t.due_date >= coalesce(src.due_date, t.due_date);
  select * into src from public.tm_tasks where id = p_id;
  return public.tm_task_json(src);
end;
$$;

create or replace function public.tm_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_late boolean := false;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  if p_status not in ('open', 'in_progress', 'done') then
    raise exception 'invalid_status';
  end if;
  select * into v_task from public.tm_tasks where id = p_id and deleted_at is null;
  if v_task.id is null then raise exception 'not_found'; end if;
  if v_task.status = 'cancelled' then raise exception 'cancelled'; end if;
  v_late := public.tm_task_is_overdue(v_task);
  update public.tm_tasks
  set
    status = p_status,
    done_at = case when p_status = 'done' then coalesce(done_at, public.tm_effective_now()) else null end,
    done_late = case when p_status = 'done' then v_late else false end
  where id = p_id
  returning * into v_task;
  if p_status = 'done' then
    perform public.tm_spawn_next_repeat(p_id);
  end if;
  perform public.tm_write_activity(p_id, 'status', jsonb_build_object('status', p_status, 'done_late', v_task.done_late));
  select * into v_task from public.tm_tasks where id = p_id;
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_set_owners(p_id uuid, p_owners uuid[])
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_owner uuid;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  if public.tm_is_helper_admin() and not public.tm_is_super_admin() then
    if p_owners is null or exists (select 1 from unnest(p_owners) x where x is distinct from auth.uid()) then
      raise exception 'forbidden';
    end if;
  end if;
  delete from public.tm_task_owners where task_id = p_id;
  if p_owners is not null then
    foreach v_owner in array p_owners loop
      insert into public.tm_task_owners (task_id, profile_id) values (p_id, v_owner) on conflict do nothing;
      perform public.tm_notify(v_owner, 'assigned', 'You were assigned a task', (
        select title from public.tm_tasks where id = p_id
      ), p_id, null);
    end loop;
  end if;
  perform public.tm_write_activity(p_id, 'owners', jsonb_build_object('owners', to_jsonb(p_owners)));
  select * into v_task from public.tm_tasks where id = p_id;
  return public.tm_task_json(v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications + dashboard people + tick + time machine
-- ---------------------------------------------------------------------------

create or replace function public.tm_create_request(p_id uuid, p_kind text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_title text;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('park', 'cancel', 'counts_off') then raise exception 'invalid_kind'; end if;
  select title into v_title from public.tm_tasks where id = p_id;
  insert into public.tm_requests (task_id, requested_by, kind, reason)
  values (p_id, auth.uid(), p_kind, nullif(trim(p_reason), ''))
  returning id into v_id;
  perform public.tm_write_activity(p_id, 'request', jsonb_build_object('kind', p_kind, 'request_id', v_id));
  insert into public.tm_notifications (profile_id, kind, title, body, task_id)
  select p.id, 'request', 'Request needs a look', coalesce(v_title, 'A task'), p_id
  from public.profiles p
  where p.role = 'super_admin' and p.deleted_at is null
    and coalesce(p.email, '') not ilike 'hello@704collective.com'
  on conflict do nothing;
  return jsonb_build_object('id', v_id, 'kind', p_kind, 'status', 'pending');
end;
$$;

create or replace function public.tm_decide_request(p_id uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  r public.tm_requests;
  v_title text;
begin
  perform public.tm_require_super();
  select * into r from public.tm_requests where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status is distinct from 'pending' then raise exception 'already_decided'; end if;
  select title into v_title from public.tm_tasks where id = r.task_id;
  update public.tm_requests
  set status = case when p_approve then 'approved' else 'denied' end,
      decided_by = auth.uid(),
      decision_note = nullif(trim(p_note), ''),
      decided_at = now()
  where id = p_id;
  if p_approve then
    if r.kind = 'cancel' then
      update public.tm_tasks set status = 'cancelled', cancelled_reason = coalesce(r.reason, 'Cancelled') where id = r.task_id;
      insert into public.tm_fix_log (task_id, action, reason, actor, new_value)
      values (r.task_id, 'cancel', r.reason, auth.uid(), jsonb_build_object('via', 'request'));
      perform public.tm_write_activity(r.task_id, 'cancelled', jsonb_build_object('via', 'request'));
    elsif r.kind = 'park' then
      update public.tm_tasks set due_date = null, due_time = null where id = r.task_id;
      insert into public.tm_fix_log (task_id, action, reason, actor, new_value)
      values (r.task_id, 'park', r.reason, auth.uid(), jsonb_build_object('via', 'request'));
      perform public.tm_write_activity(r.task_id, 'parked', jsonb_build_object('via', 'request'));
    elsif r.kind = 'counts_off' then
      update public.tm_tasks set counts = false where id = r.task_id;
      insert into public.tm_fix_log (task_id, action, reason, actor, new_value)
      values (r.task_id, 'counts_off', r.reason, auth.uid(), jsonb_build_object('via', 'request'));
    end if;
  end if;
  insert into public.tm_notifications (profile_id, kind, title, body, task_id)
  values (
    r.requested_by,
    'request_decided',
    case when p_approve then 'Request approved' else 'Request denied' end,
    coalesce(nullif(trim(p_note), ''), 'Your request on "' || coalesce(v_title, 'a task') || '" was ' || case when p_approve then 'approved.' else 'denied.' end),
    r.task_id
  );
  return public.tm_list_requests();
end;
$$;

create or replace function public.tm_mark_notification_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  update public.tm_notifications
  set read_at = coalesce(read_at, public.tm_effective_now())
  where id = p_id and profile_id = auth.uid();
  return public.tm_list_my_notifications();
end;
$$;

create or replace function public.tm_mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  update public.tm_notifications
  set read_at = public.tm_effective_now()
  where profile_id = auth.uid() and read_at is null;
  return public.tm_list_my_notifications();
end;
$$;

create or replace function public.tm_list_my_notifications()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
      'task_id', n.task_id, 'goal_id', n.goal_id,
      'created_at', n.created_at, 'read_at', n.read_at
    ) order by n.created_at desc)
    from public.tm_notifications n
    where n.profile_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_set_time_machine(p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if current_database() ilike '%bnmty%' then raise exception 'forbidden'; end if;
  if (select value from public.tm_settings where key = 'honor_time_machine') is distinct from 'true'::jsonb then
    raise exception 'forbidden';
  end if;
  insert into public.tm_settings (key, value) values ('time_machine', to_jsonb(p_at))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'now', public.tm_effective_now(), 'today', public.tm_charlotte_today());
end;
$$;

create or replace function public.tm_clear_time_machine()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if current_database() ilike '%bnmty%' then raise exception 'forbidden'; end if;
  update public.tm_settings set value = 'null'::jsonb where key = 'time_machine';
  return jsonb_build_object('ok', true, 'now', public.tm_effective_now(), 'today', public.tm_charlotte_today());
end;
$$;

create or replace function public.tm_tick()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_now timestamptz := public.tm_effective_now();
  v_hour int := extract(hour from timezone('America/New_York', v_now));
  r record;
  v_src public.tm_tasks;
  v_task public.tm_tasks;
  v_next date;
  v_spawned int := 0;
  v_closed int := 0;
  v_notes int := 0;
  v_due int;
  v_over int;
  v_super uuid;
  v_series uuid;
  i int;
begin
  if auth.uid() is not null then
    perform public.tm_require_super();
  end if;

  for v_series in
    select distinct t.repeat_series_id
    from public.tm_tasks t
    where t.deleted_at is null
      and t.repeat is distinct from 'none'
      and t.repeat_series_id is not null
      and t.repeat_anchor_date is not null
      and t.due_date is not null
  loop
    for i in 1..24 loop
      select t.* into v_src
      from public.tm_tasks t
      where t.deleted_at is null and t.repeat_series_id = v_series
      order by t.due_date desc nulls last
      limit 1;
      exit when v_src.id is null;
      exit when v_src.status not in ('done', 'cancelled') and v_src.due_date >= v_today;
      v_next := public.tm_next_repeat_date(v_src.repeat_anchor_date, v_src.repeat, v_src.due_date);
      exit when v_next is null;
      if public.tm_clone_repeat(v_src.id, v_next) is null then
        exit;
      end if;
      v_spawned := v_spawned + 1;
    end loop;
  end loop;

  v_closed := public.tm_close_older_missed();

  for v_task in
    select t.* from public.tm_tasks t
    where t.deleted_at is null and t.status in ('open', 'in_progress') and t.due_date is not null
  loop
    if public.tm_task_is_overdue(v_task) then
      insert into public.tm_notifications (profile_id, kind, title, body, task_id)
      select o.profile_id, 'overdue', 'Overdue', v_task.title, v_task.id
      from public.tm_task_owners o where o.task_id = v_task.id
      on conflict do nothing;
      if not exists (select 1 from public.tm_task_owners o where o.task_id = v_task.id) then
        insert into public.tm_notifications (profile_id, kind, title, body, task_id)
        select p.id, 'overdue', 'Overdue (unassigned)', v_task.title, v_task.id
        from public.profiles p
        where p.role = 'super_admin' and p.deleted_at is null
        on conflict do nothing;
      end if;
      get diagnostics v_notes = row_count;
    elsif v_task.due_date = v_today then
      insert into public.tm_notifications (profile_id, kind, title, body, task_id)
      select o.profile_id, 'due_today', 'Due today', v_task.title, v_task.id
      from public.tm_task_owners o where o.task_id = v_task.id
      on conflict do nothing;
    elsif v_task.due_date <= v_today + 2 then
      insert into public.tm_notifications (profile_id, kind, title, body, task_id)
      select o.profile_id, 'due_soon', 'Due soon', v_task.title, v_task.id
      from public.tm_task_owners o where o.task_id = v_task.id
      on conflict do nothing;
    end if;
  end loop;

  for r in
    select t.id, t.title from public.tm_tasks t
    where t.deleted_at is null and t.status not in ('done', 'cancelled')
      and (
        (public.tm_task_is_overdue(t) and t.due_date <= v_today - 7)
        or t.pushed_count >= 3
      )
  loop
    insert into public.tm_notifications (profile_id, kind, title, body, task_id)
    select p.id, 'needs_decision', 'Needs a decision', r.title, r.id
    from public.profiles p
    where p.role = 'super_admin' and p.deleted_at is null
    on conflict do nothing;
  end loop;

  for r in
    select g.id, g.name, g.status, g.due_date, public.tm_goal_progress(g.id) as prog
    from public.tm_goals g
    where g.deleted_at is null and g.status in ('active', 'ready') and not g.is_misc
  loop
    if r.due_date is not null and r.due_date < v_today then
      insert into public.tm_notifications (profile_id, kind, title, body, goal_id)
      select p.id, 'goal_overdue', 'Goal overdue', r.name, r.id
      from public.profiles p where p.role = 'super_admin' and p.deleted_at is null
      on conflict do nothing;
    end if;
    if coalesce((r.prog->>'pct')::numeric, 0) >= 100 then
      insert into public.tm_notifications (profile_id, kind, title, body, goal_id)
      select p.id, 'goal_ready', 'Ready to complete', r.name, r.id
      from public.profiles p where p.role = 'super_admin' and p.deleted_at is null
      on conflict do nothing;
    end if;
  end loop;

  if v_hour >= 8 then
    for v_super in
      select p.id from public.profiles p
      where p.deleted_at is null and p.role in ('super_admin', 'admin')
        and coalesce(p.email, '') not ilike 'hello@704collective.com'
    loop
      select count(*) into v_due
      from public.tm_tasks t
      where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_date = v_today
        and exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = v_super);
      select count(*) into v_over
      from public.tm_tasks t
      where t.deleted_at is null and public.tm_task_is_overdue(t)
        and exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = v_super);
      if v_due > 0 or v_over > 0 then
        if not exists (
          select 1 from public.tm_notifications n
          where n.profile_id = v_super and n.kind = 'digest'
            and (timezone('America/New_York', n.created_at))::date = v_today
        ) then
          insert into public.tm_notifications (profile_id, kind, title, body)
          values (
            v_super, 'digest',
            v_due || ' due today, ' || v_over || ' overdue',
            'Daily digest for ' || v_today::text
          );
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true, 'today', v_today, 'spawned', v_spawned, 'closed_missed', v_closed
  );
end;
$$;

-- Patch dashboard people + bootstrap extras
create or replace function public.tm_dashboard(p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
  v_person uuid;
  v_today date := public.tm_charlotte_today();
  base jsonb;
begin
  perform public.tm_require_staff();
  v_person := case when v_super then p_person else auth.uid() end;
  base := jsonb_build_object(
    'role', case when v_super then 'super_admin' else 'admin' end,
    'recap', jsonb_build_object('placeholder', true, 'headline', 'Monday recap lands in Wave 5'),
    'bars', jsonb_build_object(
      'week', public.tm_period_progress('week', v_today, v_person),
      'month', public.tm_period_progress('month', v_today, v_person),
      'quarter', public.tm_period_progress('quarter', v_today, v_person),
      'year', public.tm_period_progress('year', v_today, v_person)
    ),
    'people', case when v_super then public.tm_staff_people() else '[]'::jsonb end,
    'needs_decision', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'kind', 'task',
        'overdue_days', (v_today - t.due_date), 'pushed_count', t.pushed_count
      ))
      from public.tm_tasks t
      where t.deleted_at is null and t.status not in ('done', 'cancelled')
        and ((public.tm_task_is_overdue(t) and t.due_date <= v_today - 7) or t.pushed_count >= 3)
    ), '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.name, 'kind', 'goal', 'due_date', g.due_date
      ))
      from public.tm_goals g
      where g.deleted_at is null and g.status in ('active', 'ready')
        and g.due_date is not null and g.due_date < v_today
    ), '[]'::jsonb) else '[]'::jsonb end,
    'requests', case when v_super then public.tm_list_requests() else '[]'::jsonb end,
    'needs_home', case when v_super then public.tm_list_needs_home() else '[]'::jsonb end,
    'needs_goal', case when v_super then public.tm_list_needs_goal() else '[]'::jsonb end,
    'overdue', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date)
      from public.tm_tasks t
      where t.deleted_at is null and public.tm_task_is_overdue(t) and t.status not in ('done', 'cancelled')
        and (v_super or exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid()))
    ), '[]'::jsonb),
    'due_today', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.title)
      from public.tm_tasks t
      where t.deleted_at is null and t.due_date = v_today and t.status not in ('done', 'cancelled')
        and (v_super or exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid()))
    ), '[]'::jsonb),
    'goals', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select public.tm_goal_json(g.id) as x
        from public.tm_goals g
        where g.deleted_at is null and g.parent_id is null and g.status in ('active', 'ready')
          and not g.is_misc and (v_super or public.tm_goal_can_see(g.id))
        order by ((public.tm_goal_progress(g.id))->>'pct')::numeric desc, g.name
        limit 4
      ) q
    )
  );
  return base;
end;
$$;

create or replace function public.tm_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
  v_role text;
  v_name text;
  v_overdue int := 0;
  v_unread int := 0;
  honor jsonb;
begin
  perform public.tm_require_staff();
  v_role := case when v_super then 'super_admin' else 'admin' end;
  select full_name into v_name from public.profiles where id = auth.uid();
  select count(*) into v_overdue
  from public.tm_tasks t
  where t.deleted_at is null and public.tm_task_is_overdue(t)
    and (
      v_super
      or exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid())
    );
  select count(*) into v_unread
  from public.tm_notifications n
  where n.profile_id = auth.uid() and n.read_at is null;
  select value into honor from public.tm_settings where key = 'honor_time_machine';
  return jsonb_build_object(
    'role', v_role,
    'profile_id', auth.uid(),
    'full_name', v_name,
    'overdue_count', v_overdue,
    'unread_count', v_unread,
    'honor_time_machine', (honor = 'true'::jsonb) and current_database() not ilike '%bnmty%',
    'time_machine', (select value from public.tm_settings where key = 'time_machine'),
    'effective_today', public.tm_charlotte_today(),
    'reasons', coalesce((select value from public.tm_settings where key = 'reasons'), '[]'::jsonb),
    'inbox_folder_id', case when v_super then (
      select id from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null limit 1
    ) else null end,
    'misc_folder_id', case when v_super then (
      select id from public.tm_folders where name = 'Misc' and parent_id is null and deleted_at is null limit 1
    ) else null end,
    'misc_goal_id', (select id from public.tm_goals where is_misc and deleted_at is null limit 1),
    'folders', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'color', f.color, 'parent_id', f.parent_id,
        'sort', f.sort, 'archived_at', f.archived_at,
        'open_count', (select count(*) from public.tm_tasks t where t.folder_id = f.id and t.deleted_at is null and t.status not in ('done', 'cancelled'))
      ) order by f.sort, f.name)
      from public.tm_folders f where f.deleted_at is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color, 'is_misc', g.is_misc) order by g.is_misc desc, g.name)
      from public.tm_goals g where g.deleted_at is null and g.status in ('active', 'ready')
    ), '[]'::jsonb),
    'staff', public.tm_staff_people()
  );
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'tm_%'
  loop
    execute format('revoke all on function public.%I(%s) from public, anon', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', f.proname, f.args);
  end loop;
end $$;

-- Develop-only: honor time machine + schedule tm-tick every 15 minutes.
do $$
begin
  if current_database() ilike '%bnmty%' then
    return;
  end if;
  insert into public.tm_settings (key, value) values ('honor_time_machine', 'true'::jsonb)
  on conflict (key) do update set value = 'true'::jsonb;
  insert into public.tm_settings (key, value) values (
    'person_chip_allowlist',
    '["seed-admin@704collective.dev","seed-helper@704collective.dev"]'::jsonb
  )
  on conflict (key) do update set value = excluded.value;

  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'tm-tick-15m') then
    perform cron.schedule(
      'tm-tick-15m',
      '*/15 * * * *',
      $cron$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/tm-tick',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
          ),
          body := '{"source":"cron"}'::jsonb
        );
      $cron$
    );
  end if;
end $$;

create or replace function public.tm_comment_add(p_task_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_mentions uuid[];
  v_mid uuid;
  v_actor text;
  v_title text;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_task_id) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required'; end if;
  v_mentions := public.tm_parse_mentions(p_body);
  insert into public.tm_comments (task_id, body, mentions, author_id)
  values (p_task_id, trim(p_body), v_mentions, auth.uid())
  returning id into v_id;
  select split_part(coalesce(full_name, 'Someone'), ' ', 1) into v_actor
  from public.profiles where id = auth.uid();
  select title into v_title from public.tm_tasks where id = p_task_id;
  foreach v_mid in array v_mentions loop
    if v_mid is distinct from auth.uid() then
      insert into public.tm_notifications (profile_id, kind, title, body, task_id)
      values (v_mid, 'mentioned', coalesce(v_actor, 'Someone') || ' mentioned you', left(trim(p_body), 180), p_task_id)
      on conflict do nothing;
    end if;
  end loop;
  perform public.tm_write_activity(p_task_id, 'comment', jsonb_build_object(
    'comment_id', v_id, 'mentions', to_jsonb(v_mentions)
  ));
  return jsonb_build_object(
    'id', v_id, 'body', trim(p_body), 'mentions', to_jsonb(v_mentions),
    'author_id', auth.uid(), 'created_at', now()
  );
end;
$$;

create or replace function public.tm_goal_cancel(p_id uuid, p_reason text)
returns jsonb
language sql
security definer
set search_path to public
as $$
  select public.tm_cancel_goal(p_id, p_reason);
$$;

revoke all on function public.tm_comment_add(uuid, text) from public, anon;
revoke all on function public.tm_goal_cancel(uuid, text) from public, anon;
grant execute on function public.tm_comment_add(uuid, text) to authenticated, service_role;
grant execute on function public.tm_goal_cancel(uuid, text) to authenticated, service_role;
