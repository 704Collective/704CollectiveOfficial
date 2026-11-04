-- Wave 3: points math, goal CRUD, time bars, dashboard, request decide.
-- Develop only. Completing a goal never changes time bars. Cancelled never counts.

alter table public.tm_goals
  add column if not exists range_start date,
  add column if not exists range_end date,
  add column if not exists number_cached_at timestamptz;

-- ---------------------------------------------------------------------------
-- Points
-- ---------------------------------------------------------------------------

create or replace function public.tm_points(p_size text)
returns integer
language sql
immutable
as $$
  select case p_size
    when 'S' then 1
    when 'M' then 3
    when 'L' then 5
    when 'XL' then 10
    else 0
  end;
$$;

create or replace function public.tm_period_window(p_kind text, p_for_date date)
returns table(starts date, ends date)
language plpgsql
immutable
as $$
declare
  v_date date := coalesce(p_for_date, current_date);
  v_start date;
begin
  if p_kind = 'week' then
    v_start := v_date - ((extract(isodow from v_date)::int) - 1);
    starts := v_start;
    ends := v_start + 6;
  elsif p_kind = 'month' then
    starts := date_trunc('month', v_date)::date;
    ends := (date_trunc('month', v_date) + interval '1 month - 1 day')::date;
  elsif p_kind = 'quarter' then
    starts := date_trunc('quarter', v_date)::date;
    ends := (date_trunc('quarter', v_date) + interval '3 months - 1 day')::date;
  elsif p_kind = 'year' then
    starts := date_trunc('year', v_date)::date;
    ends := (date_trunc('year', v_date) + interval '1 year - 1 day')::date;
  else
    raise exception 'invalid_period';
  end if;
  return next;
end;
$$;

create or replace function public.tm_charlotte_today()
returns date
language sql
stable
as $$
  select (timezone('America/New_York', now()))::date;
$$;

create or replace function public.tm_refresh_number_goal(p_goal_id uuid)
returns numeric
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_current numeric := 0;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into g from public.tm_goals where id = p_goal_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;
  if g.kind is distinct from 'number' then
    return coalesce(g.number_current, 0);
  end if;
  if g.number_cached_at is not null and g.number_cached_at > now() - interval '5 minutes' then
    return coalesce(g.number_current, 0);
  end if;

  if g.range_start is not null then
    v_from := (g.range_start::timestamp at time zone 'America/New_York');
  end if;
  if g.range_end is not null then
    v_to := ((g.range_end + 1)::timestamp at time zone 'America/New_York');
  end if;

  if coalesce(g.number_source, 'manual') = 'manual' then
    select coalesce(sum(delta), 0) into v_current
    from public.tm_goal_progress_log where goal_id = g.id;
  elsif g.number_source = 'new_members' then
    select count(*)::numeric into v_current
    from public.member_source_winners w
    where w.first_paid is not null
      and (v_from is null or w.first_paid >= v_from)
      and (v_to is null or w.first_paid < v_to);
  elsif g.number_source = 'active_members' then
    select coalesce(paying_members, 0)::numeric into v_current from public.member_counts;
  elsif g.number_source = 'business_members' then
    select count(*)::numeric into v_current
    from public.profiles p
    where p.deleted_at is null
      and p.subscription_status = 'active'
      and p.member_type = 'business'
      and coalesce(p.is_internal, false) = false
      and p.email not like '%@704collective.com';
  elsif g.number_source = 'checkins' then
    select count(*)::numeric into v_current
    from public.attendance_credentials a
    where a.checked_in_at is not null
      and (v_from is null or a.checked_in_at >= v_from)
      and (v_to is null or a.checked_in_at < v_to);
  else
    v_current := coalesce(g.number_current, 0);
  end if;

  update public.tm_goals
  set number_current = v_current, number_cached_at = now()
  where id = g.id;
  return v_current;
end;
$$;

create or replace function public.tm_goal_task_points(p_goal_id uuid)
returns table(got numeric, total numeric)
language sql
stable
security definer
set search_path to public
as $$
  select
    coalesce(sum(public.tm_points(t.size)) filter (where t.status = 'done'), 0)::numeric as got,
    coalesce(sum(public.tm_points(t.size)), 0)::numeric as total
  from public.tm_task_goals tg
  join public.tm_tasks t on t.id = tg.task_id
  where tg.goal_id = p_goal_id
    and t.deleted_at is null
    and t.counts
    and t.status is distinct from 'cancelled';
$$;

create or replace function public.tm_goal_progress(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_got numeric := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  v_current numeric := 0;
  r record;
  child jsonb;
  v_has_children boolean := false;
begin
  select * into g from public.tm_goals where id = p_goal_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;

  select exists (
    select 1 from public.tm_goals c
    where c.parent_id = g.id and c.deleted_at is null
      and c.status is distinct from 'cancelled'
  ) into v_has_children;

  if g.kind = 'number' and not v_has_children then
    v_current := public.tm_refresh_number_goal(g.id);
    v_total := coalesce(g.number_target, 0);
    v_got := least(coalesce(v_current, 0), v_total);
    if v_total > 0 then
      v_pct := round((v_got / v_total) * 100);
    end if;
    return jsonb_build_object(
      'got', v_got, 'total', v_total, 'pct', v_pct,
      'current', v_current, 'target', v_total
    );
  end if;

  if v_has_children then
    -- Unique counted tasks on the parent or any non-cancelled task child.
    select
      coalesce(sum(public.tm_points(x.size)) filter (where x.status = 'done'), 0),
      coalesce(sum(public.tm_points(x.size)), 0)
    into v_got, v_total
    from (
      select distinct t.id, t.size, t.status
      from public.tm_tasks t
      join public.tm_task_goals tg on tg.task_id = t.id
      where t.deleted_at is null
        and t.counts
        and t.status is distinct from 'cancelled'
        and (
          tg.goal_id = g.id
          or tg.goal_id in (
            select c.id from public.tm_goals c
            where c.parent_id = g.id
              and c.deleted_at is null
              and c.status is distinct from 'cancelled'
              and c.kind is distinct from 'number'
          )
        )
    ) x;

    for r in
      select c.id
      from public.tm_goals c
      where c.parent_id = g.id
        and c.deleted_at is null
        and c.status is distinct from 'cancelled'
        and c.kind = 'number'
    loop
      child := public.tm_goal_progress(r.id);
      v_got := v_got + ((child->>'pct')::numeric / 100.0) * public.tm_points(
        (select size from public.tm_goals where id = r.id)
      );
      v_total := v_total + public.tm_points((select size from public.tm_goals where id = r.id));
    end loop;
  else
    select tp.got, tp.total into v_got, v_total
    from public.tm_goal_task_points(g.id) tp;
  end if;

  if v_total > 0 then
    v_pct := round((v_got / v_total) * 100);
  end if;
  return jsonb_build_object('got', v_got, 'total', v_total, 'pct', v_pct);
end;
$$;

create or replace function public.tm_period_progress(p_kind text, p_for_date date, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_start date;
  v_end date;
  v_got numeric := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  r record;
  child jsonb;
  v_today date := public.tm_charlotte_today();
begin
  perform public.tm_require_staff();
  select w.starts, w.ends into v_start, v_end
  from public.tm_period_window(p_kind, coalesce(p_for_date, v_today)) w;

  select
    coalesce(sum(public.tm_points(t.size)) filter (where t.status = 'done'), 0),
    coalesce(sum(public.tm_points(t.size)), 0)
  into v_got, v_total
  from public.tm_tasks t
  where t.deleted_at is null
    and t.counts
    and t.status is distinct from 'cancelled'
    and t.due_date is not null
    and (
      (t.due_date >= v_start and t.due_date <= v_end)
      or (
        p_kind in ('week', 'month')
        and t.due_date < v_start
        and t.status not in ('done', 'cancelled')
      )
    )
    and (
      p_person is null
      or exists (
        select 1 from public.tm_task_owners o
        where o.task_id = t.id and o.profile_id = p_person
      )
    );

  -- Number goals: only company (no person) view. Completed still counts.
  if p_person is null then
    for r in
      select g.id, g.size
      from public.tm_goals g
      where g.deleted_at is null
        and g.kind = 'number'
        and g.counts_time_bars
        and g.size is not null
        and g.status is distinct from 'cancelled'
        and g.range_start is not null
        and g.range_end is not null
        and g.range_start >= v_start
        and g.range_end <= v_end
    loop
      child := public.tm_goal_progress(r.id);
      v_got := v_got + ((child->>'pct')::numeric / 100.0) * public.tm_points(r.size);
      v_total := v_total + public.tm_points(r.size);
    end loop;
  end if;

  if v_total > 0 then
    v_pct := round((v_got / v_total) * 100);
  end if;
  return jsonb_build_object(
    'kind', p_kind,
    'starts', v_start,
    'ends', v_end,
    'got', v_got,
    'total', v_total,
    'pct', v_pct
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Goal JSON + visibility
-- ---------------------------------------------------------------------------

create or replace function public.tm_goal_can_see(p_goal_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if public.tm_is_super_admin() then return true; end if;
  if not public.tm_is_helper_admin() then return false; end if;
  return exists (
    select 1
    from public.tm_task_goals tg
    join public.tm_task_owners o on o.task_id = tg.task_id
    join public.tm_tasks t on t.id = tg.task_id
    where o.profile_id = auth.uid()
      and t.deleted_at is null
      and (
        tg.goal_id = p_goal_id
        or tg.goal_id in (select id from public.tm_goals where parent_id = p_goal_id)
        or exists (select 1 from public.tm_goals c where c.id = p_goal_id and c.parent_id = tg.goal_id)
      )
  );
end;
$$;

create or replace function public.tm_goal_tags(p_goal public.tm_goals, p_progress jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tags jsonb := '[]'::jsonb;
  v_today date := public.tm_charlotte_today();
  v_has_children boolean;
begin
  select exists (
    select 1 from public.tm_goals c
    where c.parent_id = p_goal.id and c.deleted_at is null and c.status is distinct from 'cancelled'
  ) into v_has_children;
  if p_goal.kind = 'number' then
    v_tags := v_tags || jsonb_build_array('Number goal');
  end if;
  if p_goal.counts_time_bars then
    v_tags := v_tags || jsonb_build_array('Counts in bars');
  end if;
  if v_has_children then
    v_tags := v_tags || jsonb_build_array('Parent goal');
  end if;
  if p_goal.status in ('active', 'ready')
    and not p_goal.is_misc
    and coalesce((p_progress->>'pct')::numeric, 0) >= 100
    and not exists (
      select 1 from public.tm_goals c
      where c.parent_id = p_goal.id
        and c.deleted_at is null
        and c.status in ('active', 'ready')
        and coalesce(((public.tm_goal_progress(c.id))->>'pct')::numeric, 0) < 100
    )
  then
    v_tags := v_tags || jsonb_build_array('Ready to complete');
  end if;
  if p_goal.due_date is not null
    and p_goal.due_date < v_today
    and p_goal.status in ('active', 'ready')
  then
    v_tags := v_tags || jsonb_build_array('Overdue');
  end if;
  return v_tags;
end;
$$;

create or replace function public.tm_goal_json(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_progress jsonb;
begin
  select * into g from public.tm_goals where id = p_goal_id;
  if g.id is null then raise exception 'not_found'; end if;
  v_progress := public.tm_goal_progress(g.id);
  return jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'kind', g.kind,
    'color', g.color,
    'due_date', g.due_date,
    'parent_id', g.parent_id,
    'status', g.status,
    'completed_at', g.completed_at,
    'is_misc', g.is_misc,
    'number_current', g.number_current,
    'number_target', g.number_target,
    'number_unit', g.number_unit,
    'number_source', g.number_source,
    'counts_time_bars', g.counts_time_bars,
    'size', g.size,
    'range_start', g.range_start,
    'range_end', g.range_end,
    'pushed_count', g.pushed_count,
    'got', (v_progress->>'got')::numeric,
    'total', (v_progress->>'total')::numeric,
    'pct', (v_progress->>'pct')::numeric,
    'tags', public.tm_goal_tags(g, v_progress)
  );
end;
$$;

create or replace function public.tm_list_goals()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
begin
  perform public.tm_require_staff();
  return coalesce((
    select jsonb_agg(public.tm_goal_json(g.id) || jsonb_build_object(
      'children', coalesce((
        select jsonb_agg(public.tm_goal_json(c.id) order by c.name)
        from public.tm_goals c
        where c.parent_id = g.id
          and c.deleted_at is null
          and c.status in ('active', 'ready', 'completed')
          and (v_super or public.tm_goal_can_see(c.id))
      ), '[]'::jsonb)
    ) order by g.is_misc desc, g.name)
    from public.tm_goals g
    where g.deleted_at is null
      and g.parent_id is null
      and g.status in ('active', 'ready')
      and (v_super or public.tm_goal_can_see(g.id))
  ), '[]'::jsonb);
end;
$$;

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
        and (public.tm_is_super_admin() or public.tm_can_see_task(t.id))
    ), '[]'::jsonb),
    'not_counted_tasks', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
      from public.tm_task_goals tg
      join public.tm_tasks t on t.id = tg.task_id
      where tg.goal_id = g.id and t.deleted_at is null and not t.counts
        and (public.tm_is_super_admin() or public.tm_can_see_task(t.id))
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Goal writes
-- ---------------------------------------------------------------------------

create or replace function public.tm_create_goal(
  p_name text,
  p_kind text,
  p_color text,
  p_due_date date,
  p_parent_id uuid,
  p_number_target numeric,
  p_number_unit text,
  p_number_source text,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  perform public.tm_require_super();
  if coalesce(trim(p_name), '') = '' then raise exception 'title_required'; end if;
  if p_kind not in ('task', 'number') then raise exception 'invalid_kind'; end if;
  if p_parent_id is not null then
    if exists (select 1 from public.tm_goals where id = p_parent_id and parent_id is not null) then
      raise exception 'Folders are limited to 2 levels';
    end if;
    update public.tm_goals set kind = 'parent' where id = p_parent_id and kind = 'task';
  end if;
  insert into public.tm_goals (
    name, kind, color, due_date, parent_id, number_target, number_unit, number_source,
    range_start, range_end, created_by
  ) values (
    trim(p_name), p_kind, p_color, p_due_date, p_parent_id,
    case when p_kind = 'number' then p_number_target else null end,
    case when p_kind = 'number' then p_number_unit else null end,
    case when p_kind = 'number' then coalesce(p_number_source, 'manual') else null end,
    p_range_start, p_range_end, auth.uid()
  ) returning id into v_id;
  return public.tm_goal_json(v_id);
end;
$$;

create or replace function public.tm_update_goal(
  p_id uuid,
  p_name text,
  p_color text,
  p_due_date date,
  p_description text,
  p_number_target numeric,
  p_number_unit text,
  p_number_source text,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_goals
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    color = coalesce(p_color, color),
    due_date = p_due_date,
    description = coalesce(p_description, description),
    number_target = coalesce(p_number_target, number_target),
    number_unit = coalesce(p_number_unit, number_unit),
    number_source = coalesce(p_number_source, number_source),
    range_start = p_range_start,
    range_end = p_range_end,
    number_cached_at = null,
    updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_set_goal_counts_time_bars(p_id uuid, p_on boolean, p_size text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if p_on and p_size is null then raise exception 'size_required'; end if;
  update public.tm_goals
  set counts_time_bars = p_on,
      size = case when p_on then p_size else size end,
      updated_at = now()
  where id = p_id and deleted_at is null and kind = 'number';
  if not found then raise exception 'not_found'; end if;
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_log_goal_progress(p_id uuid, p_delta numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if not exists (select 1 from public.tm_goals where id = p_id and kind = 'number' and deleted_at is null) then
    raise exception 'not_found';
  end if;
  insert into public.tm_goal_progress_log (goal_id, delta, note, logged_by)
  values (p_id, p_delta, nullif(trim(p_note), ''), auth.uid());
  update public.tm_goals set number_cached_at = null, updated_at = now() where id = p_id;
  return public.tm_get_goal(p_id);
end;
$$;

create or replace function public.tm_complete_goal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_progress jsonb;
begin
  perform public.tm_require_super();
  select * into g from public.tm_goals where id = p_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;
  if g.is_misc then raise exception 'misc_locked'; end if;
  v_progress := public.tm_goal_progress(p_id);
  if coalesce((v_progress->>'pct')::numeric, 0) < 100 then raise exception 'not_ready'; end if;
  if exists (
    select 1 from public.tm_goals c
    where c.parent_id = p_id and c.deleted_at is null and c.status in ('active', 'ready')
      and coalesce(((public.tm_goal_progress(c.id))->>'pct')::numeric, 0) < 100
  ) then
    raise exception 'open_subgoals';
  end if;
  update public.tm_goals
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_id or parent_id = p_id;
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_cancel_goal(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if exists (select 1 from public.tm_goals where id = p_id and is_misc) then
    raise exception 'misc_locked';
  end if;
  update public.tm_goals
  set status = 'cancelled', cancelled_reason = nullif(trim(p_reason), ''), updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_delete_goal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if exists (select 1 from public.tm_goals where id = p_id and is_misc) then
    raise exception 'misc_locked';
  end if;
  if exists (
    select 1 from public.tm_task_goals tg
    join public.tm_tasks t on t.id = tg.task_id
    where tg.goal_id = p_id and t.deleted_at is null
  ) then
    raise exception 'goal_has_tasks';
  end if;
  update public.tm_goals set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_goals();
end;
$$;

create or replace function public.tm_move_all_goal_tasks(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_moved int := 0;
begin
  perform public.tm_require_super();
  if exists (select 1 from public.tm_goals where id = p_to and status = 'completed') then
    raise exception 'goal_closed';
  end if;
  insert into public.tm_task_goals (task_id, goal_id)
  select tg.task_id, p_to
  from public.tm_task_goals tg
  where tg.goal_id = p_from
  on conflict do nothing;
  get diagnostics v_moved = row_count;
  delete from public.tm_task_goals where goal_id = p_from;
  return jsonb_build_object('moved', v_moved, 'goals', public.tm_list_goals());
end;
$$;

-- Block attaching completed goals
create or replace function public.tm_set_goals(p_id uuid, p_goals uuid[])
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_goal uuid;
  v_misc uuid;
begin
  perform public.tm_require_super();
  if exists (
    select 1 from public.tm_goals g
    where g.id = any(p_goals)
      and g.status in ('completed', 'failed', 'cancelled')
  ) then
    raise exception 'goal_closed';
  end if;
  delete from public.tm_task_goals where task_id = p_id;
  if p_goals is not null then
    foreach v_goal in array p_goals loop
      insert into public.tm_task_goals (task_id, goal_id) values (p_id, v_goal)
      on conflict do nothing;
    end loop;
  end if;
  if not exists (select 1 from public.tm_task_goals where task_id = p_id) then
    select id into v_misc from public.tm_goals where is_misc and deleted_at is null limit 1;
    if v_misc is not null then
      insert into public.tm_task_goals (task_id, goal_id) values (p_id, v_misc);
    end if;
  end if;
  perform public.tm_write_activity(p_id, 'goals', jsonb_build_object('goals', to_jsonb(p_goals)));
  select * into v_task from public.tm_tasks where id = p_id;
  return public.tm_task_json(v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests + dashboard
-- ---------------------------------------------------------------------------

create or replace function public.tm_list_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'task_id', r.task_id,
      'task_title', t.title,
      'kind', r.kind,
      'reason', r.reason,
      'status', r.status,
      'created_at', r.created_at,
      'requested_by', r.requested_by,
      'requester_name', p.full_name
    ) order by r.created_at desc)
    from public.tm_requests r
    join public.tm_tasks t on t.id = r.task_id
    left join public.profiles p on p.id = r.requested_by
    where r.status = 'pending'
  ), '[]'::jsonb);
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
  set
    status = case when p_approve then 'approved' else 'denied' end,
    decided_by = auth.uid(),
    decision_note = nullif(trim(p_note), ''),
    decided_at = now()
  where id = p_id;

  if p_approve then
    if r.kind = 'cancel' then
      update public.tm_tasks
      set status = 'cancelled', cancelled_reason = coalesce(r.reason, 'Cancelled')
      where id = r.task_id;
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
      perform public.tm_write_activity(r.task_id, 'counts', jsonb_build_object('counts', false, 'via', 'request'));
    end if;
    insert into public.tm_notifications (profile_id, kind, title, body, task_id)
    values (
      r.requested_by, 'request_approved',
      'Request approved',
      coalesce(nullif(trim(p_note), ''), 'Your request on "' || coalesce(v_title, 'a task') || '" was approved.'),
      r.task_id
    );
  else
    insert into public.tm_notifications (profile_id, kind, title, body, task_id)
    values (
      r.requested_by, 'request_denied',
      'Request denied',
      coalesce(nullif(trim(p_note), ''), 'Your request on "' || coalesce(v_title, 'a task') || '" was denied.'),
      r.task_id
    );
  end if;
  return public.tm_list_requests();
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
      'task_id', n.task_id, 'created_at', n.created_at, 'read_at', n.read_at
    ) order by n.created_at desc)
    from public.tm_notifications n
    where n.profile_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_list_needs_goal()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  return coalesce((
    select jsonb_agg(public.tm_task_json(t) order by t.updated_at desc)
    from public.tm_tasks t
    where t.deleted_at is null
      and t.status not in ('done', 'cancelled')
      and exists (
        select 1 from public.tm_task_goals tg
        join public.tm_goals g on g.id = tg.goal_id
        where tg.task_id = t.id and g.is_misc
      )
      and not exists (
        select 1 from public.tm_task_goals tg
        join public.tm_goals g on g.id = tg.goal_id
        where tg.task_id = t.id and not g.is_misc
      )
  ), '[]'::jsonb);
end;
$$;

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
begin
  perform public.tm_require_staff();
  v_person := case when v_super then p_person else auth.uid() end;

  return jsonb_build_object(
    'role', case when v_super then 'super_admin' else 'admin' end,
    'recap', jsonb_build_object('placeholder', true, 'headline', 'Monday recap lands in Wave 5'),
    'bars', jsonb_build_object(
      'week', public.tm_period_progress('week', v_today, v_person),
      'month', public.tm_period_progress('month', v_today, v_person),
      'quarter', public.tm_period_progress('quarter', v_today, v_person),
      'year', public.tm_period_progress('year', v_today, v_person)
    ),
    'people', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'role', p.role
      ) order by p.role desc, p.full_name)
      from public.profiles p
      where p.deleted_at is null
        and p.role in ('super_admin', 'admin')
        and coalesce(p.email, '') not ilike 'hello@704collective.com'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'needs_decision', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'kind', 'task',
        'overdue_days', (v_today - t.due_date),
        'pushed_count', t.pushed_count
      ))
      from public.tm_tasks t
      where t.deleted_at is null
        and t.status not in ('done', 'cancelled')
        and (
          (public.tm_task_is_overdue(t) and t.due_date <= v_today - 7)
          or t.pushed_count >= 3
        )
    ), '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.name, 'kind', 'goal', 'due_date', g.due_date
      ))
      from public.tm_goals g
      where g.deleted_at is null
        and g.status in ('active', 'ready')
        and g.due_date is not null
        and g.due_date < v_today
    ), '[]'::jsonb) else '[]'::jsonb end,
    'requests', case when v_super then public.tm_list_requests() else '[]'::jsonb end,
    'needs_home', case when v_super then public.tm_list_needs_home() else '[]'::jsonb end,
    'needs_goal', case when v_super then public.tm_list_needs_goal() else '[]'::jsonb end,
    'overdue', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date)
      from public.tm_tasks t
      where t.deleted_at is null
        and public.tm_task_is_overdue(t)
        and t.status not in ('done', 'cancelled')
        and (
          v_super
          or exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid())
        )
    ), '[]'::jsonb),
    'due_today', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.title)
      from public.tm_tasks t
      where t.deleted_at is null
        and t.due_date = v_today
        and t.status not in ('done', 'cancelled')
        and (
          v_super
          or exists (select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = auth.uid())
        )
    ), '[]'::jsonb),
    'goals', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select public.tm_goal_json(g.id) as x
        from public.tm_goals g
        where g.deleted_at is null
          and g.parent_id is null
          and g.status in ('active', 'ready')
          and not g.is_misc
          and (v_super or public.tm_goal_can_see(g.id))
        order by ((public.tm_goal_progress(g.id))->>'pct')::numeric desc, g.name
        limit 4
      ) q
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
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
