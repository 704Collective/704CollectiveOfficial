-- Wave 5: history snapshots, period people, goal history, Monday recap.
-- Develop only for backfill/seed. Production must ignore time_machine.

alter table public.tm_history_periods
  add column if not exists got numeric not null default 0,
  add column if not exists total numeric not null default 0,
  add column if not exists scores_frozen boolean not null default false;

create unique index if not exists tm_history_periods_kind_starts
  on public.tm_history_periods (kind, starts);

alter table public.tm_history_goals
  add column if not exists got numeric not null default 0,
  add column if not exists total numeric not null default 0,
  add column if not exists closed_at date,
  add column if not exists reason text,
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists removed_at timestamptz;

create table if not exists public.tm_history_people (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.tm_history_periods(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  done int not null default 0,
  missed int not null default 0,
  cancelled int not null default 0,
  on_time int not null default 0,
  late int not null default 0,
  pct numeric not null default 0,
  unique (period_id, profile_id)
);

alter table public.tm_history_people enable row level security;
revoke all on table public.tm_history_people from public, anon, authenticated;
grant select, insert, update, delete on public.tm_history_people to service_role;

drop policy if exists tm_history_people_super on public.tm_history_people;
create policy tm_history_people_super on public.tm_history_people
  for select to authenticated
  using (public.tm_is_super_admin());

-- ---------------------------------------------------------------------------
-- Outcome + snapshot helpers
-- ---------------------------------------------------------------------------

create or replace function public.tm_history_lock_at(p_ends date)
returns timestamptz
language sql
immutable
as $$
  select ((p_ends + 1)::timestamp at time zone 'America/New_York') + interval '24 hours';
$$;

create or replace function public.tm_history_outcome(p_task public.tm_tasks, p_today date, p_ends date)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(p_task.missed, false) then
    return 'missed';
  end if;
  if p_task.status = 'cancelled' then
    return 'cancelled';
  end if;
  if p_task.status = 'done' and p_task.done_late then
    return 'done_late';
  end if;
  if p_task.status = 'done' then
    return 'done_on_time';
  end if;
  if p_task.due_date is not null and p_task.due_date > p_today and p_today <= p_ends then
    return 'open_carried';
  end if;
  return 'missed';
end;
$$;

create or replace function public.tm_history_after_text(p_task public.tm_tasks, p_snap_due date)
returns text
language plpgsql
stable
as $$
declare
  v_done date;
begin
  if p_task.status = 'done' then
    v_done := coalesce((timezone('America/New_York', p_task.done_at))::date, public.tm_charlotte_today());
    return 'Done late ' || trim(to_char(v_done, 'Mon FMDD'));
  end if;
  if p_task.status = 'cancelled' and not coalesce(p_task.missed, false) then
    return 'Cancelled';
  end if;
  if p_task.due_date is not null and p_snap_due is not null and p_task.due_date > p_snap_due then
    return 'Pushed to ' || trim(to_char(p_task.due_date, 'Mon FMDD'));
  end if;
  return null;
end;
$$;

create or replace function public.tm_history_task_row(p_task public.tm_tasks, p_today date, p_ends date)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_outcome text := public.tm_history_outcome(p_task, p_today, p_ends);
  v_folder text;
  v_fix public.tm_fix_log;
  v_actor text;
begin
  select coalesce(parent.name || ' / ' || f.name, f.name)
    into v_folder
  from public.tm_folders f
  left join public.tm_folders parent on parent.id = f.parent_id
  where f.id = p_task.folder_id;

  select l.* into v_fix
  from public.tm_fix_log l
  where l.task_id = p_task.id
  order by l.at desc
  limit 1;
  if v_fix.actor is not null then
    select full_name into v_actor from public.profiles where id = v_fix.actor;
  end if;

  return jsonb_build_object(
    'id', p_task.id,
    'title', p_task.title,
    'owner_ids', coalesce((
      select jsonb_agg(o.profile_id order by o.profile_id)
      from public.tm_task_owners o where o.task_id = p_task.id
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name) order by p.full_name)
      from public.tm_task_owners o
      join public.profiles p on p.id = o.profile_id
      where o.task_id = p_task.id
    ), '[]'::jsonb),
    'folder_id', p_task.folder_id,
    'folder', v_folder,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color) order by g.name)
      from public.tm_task_goals tg
      join public.tm_goals g on g.id = tg.goal_id
      where tg.task_id = p_task.id and g.deleted_at is null
    ), '[]'::jsonb),
    'size', p_task.size,
    'counts', p_task.counts,
    'outcome', v_outcome,
    'reason', coalesce(p_task.cancelled_reason, v_fix.reason),
    'note', v_fix.note,
    'fixed_by', v_actor,
    'what_happened_after', null,
    'due_date', p_task.due_date
  );
end;
$$;

create or replace function public.tm_history_apply_after(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_snap jsonb;
  v_tasks jsonb := '[]'::jsonb;
  el jsonb;
  v_task public.tm_tasks;
  v_after text;
  v_due date;
begin
  select snapshot into v_snap from public.tm_history_periods where id = p_period_id;
  if v_snap is null then
    return;
  end if;
  for el in select value from jsonb_array_elements(coalesce(v_snap->'tasks', '[]'::jsonb))
  loop
    select t.* into v_task from public.tm_tasks t where t.id = (el->>'id')::uuid;
    if v_task.id is null then
      v_tasks := v_tasks || jsonb_build_array(el);
      continue;
    end if;
    v_due := nullif(el->>'due_date', '')::date;
    if el->>'outcome' in ('missed', 'open_carried') then
      v_after := public.tm_history_after_text(v_task, v_due);
      if v_after is not null then
        el := el || jsonb_build_object('what_happened_after', v_after);
      end if;
    end if;
    v_tasks := v_tasks || jsonb_build_array(el);
  end loop;
  update public.tm_history_periods
  set snapshot = jsonb_set(coalesce(snapshot, '{}'::jsonb), '{tasks}', v_tasks)
  where id = p_period_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Compute / upsert a period
-- ---------------------------------------------------------------------------

create or replace function public.tm_upsert_history_period(p_kind text, p_starts date, p_ends date)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_now timestamptz := public.tm_effective_now();
  v_lock_at timestamptz := public.tm_history_lock_at(p_ends);
  v_id uuid;
  v_frozen boolean := false;
  v_locked timestamptz;
  v_task public.tm_tasks;
  v_row jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_done int := 0;
  v_missed int := 0;
  v_cancelled int := 0;
  v_got numeric := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  r record;
  v_on int;
  v_late int;
  v_pdone int;
  v_pmiss int;
  v_pcanc int;
  v_ppct numeric;
begin
  select id, scores_frozen, locked_at
    into v_id, v_frozen, v_locked
  from public.tm_history_periods
  where kind = p_kind and starts = p_starts;

  if v_id is not null and p_ends < v_today and v_frozen then
    perform public.tm_history_apply_after(v_id);
    if v_locked is null and v_now >= v_lock_at then
      update public.tm_history_periods set locked_at = v_now where id = v_id;
    end if;
    return v_id;
  end if;

  for v_task in
    select t.*
    from public.tm_tasks t
    where t.deleted_at is null
      and t.due_date is not null
      and t.due_date >= p_starts
      and t.due_date <= p_ends
  loop
    v_row := public.tm_history_task_row(v_task, v_today, p_ends);
    v_tasks := v_tasks || jsonb_build_array(v_row);
    if v_task.counts then
      if v_row->>'outcome' in ('done_on_time', 'done_late') then
        v_done := v_done + 1;
        v_got := v_got + public.tm_points(v_task.size);
        v_total := v_total + public.tm_points(v_task.size);
      elsif v_row->>'outcome' = 'missed' then
        v_missed := v_missed + 1;
        v_total := v_total + public.tm_points(v_task.size);
      elsif v_row->>'outcome' = 'cancelled' then
        v_cancelled := v_cancelled + 1;
      end if;
    else
      if v_row->>'outcome' = 'cancelled' then
        v_cancelled := v_cancelled + 1;
      elsif v_row->>'outcome' = 'missed' then
        null;
      elsif v_row->>'outcome' in ('done_on_time', 'done_late') then
        null;
      end if;
    end if;
  end loop;

  if v_total > 0 then
    v_pct := round((v_got / v_total) * 100);
  end if;

  if v_id is null then
    insert into public.tm_history_periods (
      kind, starts, ends, pct, done, missed, cancelled, got, total, snapshot, scores_frozen, locked_at
    ) values (
      p_kind, p_starts, p_ends, v_pct, v_done, v_missed, v_cancelled, v_got, v_total,
      jsonb_build_object('tasks', v_tasks),
      (p_ends < v_today),
      case when v_now >= v_lock_at and p_ends < v_today then v_now else null end
    )
    returning id into v_id;
  else
    update public.tm_history_periods
    set ends = p_ends,
        pct = v_pct,
        done = v_done,
        missed = v_missed,
        cancelled = v_cancelled,
        got = v_got,
        total = v_total,
        snapshot = jsonb_build_object('tasks', v_tasks),
        scores_frozen = (p_ends < v_today),
        locked_at = case
          when v_now >= v_lock_at and p_ends < v_today then coalesce(locked_at, v_now)
          else locked_at
        end
    where id = v_id;
  end if;

  delete from public.tm_history_people where period_id = v_id;

  for r in
    select p.id as profile_id
    from public.profiles p
    where p.deleted_at is null
      and p.role in ('super_admin', 'admin')
      and coalesce(p.email, '') not ilike 'hello@%'
  loop
    select
      count(*) filter (where (el->>'counts')::boolean and el->>'outcome' = 'done_on_time'),
      count(*) filter (where (el->>'counts')::boolean and el->>'outcome' = 'done_late'),
      count(*) filter (where (el->>'counts')::boolean and el->>'outcome' = 'missed'),
      count(*) filter (where (el->>'counts')::boolean and el->>'outcome' = 'cancelled')
    into v_on, v_late, v_pmiss, v_pcanc
    from jsonb_array_elements(v_tasks) el
    where el->'owner_ids' ? r.profile_id::text;

    v_pdone := v_on + v_late;
    if (v_on + v_late + v_pmiss) > 0 then
      v_ppct := round((v_on::numeric / (v_on + v_late + v_pmiss)) * 100);
    else
      v_ppct := 0;
    end if;

    if v_pdone > 0 or v_pmiss > 0 or v_pcanc > 0 then
      insert into public.tm_history_people (
        period_id, profile_id, done, missed, cancelled, on_time, late, pct
      ) values (
        v_id, r.profile_id, v_pdone, v_pmiss, v_pcanc, v_on, v_late, v_ppct
      );
    end if;
  end loop;

  if p_ends < v_today then
    perform public.tm_history_apply_after(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.tm_refresh_history()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_now timestamptz := public.tm_effective_now();
  v_hour int := extract(hour from timezone('America/New_York', v_now));
  v_kind text;
  v_starts date;
  v_ends date;
  v_week public.tm_history_periods;
  v_person record;
  v_title text;
  v_pct numeric;
  v_missed int;
  i int;
begin
  foreach v_kind in array array['week', 'month', 'quarter', 'year']
  loop
    select w.starts, w.ends into v_starts, v_ends
    from public.tm_period_window(v_kind, v_today) w;
    perform public.tm_upsert_history_period(v_kind, v_starts, v_ends);
  end loop;

  -- Recently ended week (grace / lock)
  select w.starts, w.ends into v_starts, v_ends
  from public.tm_period_window('week', v_today - 7) w;
  perform public.tm_upsert_history_period('week', v_starts, v_ends);

  select p.* into v_week
  from public.tm_history_periods p
  where p.kind = 'week' and p.ends < v_today
  order by p.starts desc
  limit 1;

  if v_week.id is not null and v_today >= (v_week.ends + 1) and v_hour >= 8 then
    for v_person in
      select (el->>'id')::uuid as id, el->>'role' as role
      from jsonb_array_elements(public.tm_staff_people()) el
    loop
      if v_person.role = 'super_admin' then
        v_pct := coalesce(v_week.pct, 0);
        v_missed := coalesce(v_week.missed, 0);
      else
        select hp.pct, hp.missed into v_pct, v_missed
        from public.tm_history_people hp
        where hp.period_id = v_week.id and hp.profile_id = v_person.id;
        v_pct := coalesce(v_pct, 0);
        v_missed := coalesce(v_missed, 0);
      end if;
      v_title := 'Last week: ' || round(v_pct) || '%, ' || v_missed || ' missed';
      if not exists (
        select 1 from public.tm_notifications n
        where n.profile_id = v_person.id
          and n.kind = 'recap'
          and n.body = v_week.starts::text
      ) then
        insert into public.tm_notifications (profile_id, kind, title, body)
        values (v_person.id, 'recap', v_title, v_week.starts::text);
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'today', v_today);
end;
$$;

create or replace function public.tm_backfill_history()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_starts date;
  v_ends date;
  i int;
begin
  for i in 0..7 loop
    select w.starts, w.ends into v_starts, v_ends
    from public.tm_period_window('week', v_today - (i * 7)) w;
    perform public.tm_upsert_history_period('week', v_starts, v_ends);
  end loop;
  for i in 0..2 loop
    select w.starts, w.ends into v_starts, v_ends
    from public.tm_period_window('month', (date_trunc('month', v_today) - (i || ' months')::interval)::date) w;
    perform public.tm_upsert_history_period('month', v_starts, v_ends);
  end loop;
  select w.starts, w.ends into v_starts, v_ends from public.tm_period_window('quarter', v_today) w;
  perform public.tm_upsert_history_period('quarter', v_starts, v_ends);
  select w.starts, w.ends into v_starts, v_ends from public.tm_period_window('year', v_today) w;
  perform public.tm_upsert_history_period('year', v_starts, v_ends);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Goal history
-- ---------------------------------------------------------------------------

create or replace function public.tm_goal_extend_lines(p_goal uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  return coalesce((
    select jsonb_agg(
      'Missed ' || coalesce(l.old_value->>'due_date', '?')
      || ' at ' || coalesce(l.old_value->>'pct', '0') || '%'
      || ', extended to ' || coalesce(l.new_value->>'due_date', '?')
      || ' - ' || coalesce(l.reason, '')
      order by l.at
    )
    from public.tm_fix_log l
    where l.goal_id = p_goal and l.action = 'extend'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_record_goal_history(p_goal uuid, p_status text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_prog jsonb;
  v_id uuid;
  v_period uuid;
  v_today date := public.tm_charlotte_today();
  v_lines jsonb;
  v_prior jsonb;
begin
  select * into g from public.tm_goals where id = p_goal and deleted_at is null;
  if g.id is null then
    raise exception 'not_found';
  end if;
  v_prog := public.tm_goal_progress(p_goal);
  v_lines := public.tm_goal_extend_lines(p_goal);
  select hg.lines into v_prior
  from public.tm_history_goals hg
  where hg.goal_id = p_goal and hg.removed_at is not null
  order by hg.removed_at desc
  limit 1;
  if v_prior is not null then
    v_lines := coalesce(v_prior, '[]'::jsonb) || coalesce(v_lines, '[]'::jsonb);
  end if;

  select p.id into v_period
  from public.tm_history_periods p
  where p.kind = 'week' and v_today between p.starts and p.ends
  limit 1;

  insert into public.tm_history_goals (
    period_id, goal_id, status, pct, got, total, closed_at, reason, lines, snapshot
  ) values (
    v_period, p_goal, p_status,
    coalesce((v_prog->>'pct')::numeric, 0),
    coalesce((v_prog->>'got')::numeric, 0),
    coalesce((v_prog->>'total')::numeric, 0),
    v_today, nullif(trim(coalesce(p_reason, '')), ''), v_lines,
    jsonb_build_object('name', g.name, 'color', g.color)
  )
  returning id into v_id;
  return v_id;
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
  set status = 'completed', completed_at = public.tm_effective_now(), updated_at = now()
  where id = p_id or parent_id = p_id;
  perform public.tm_record_goal_history(p_id, 'completed', null);
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
  perform public.tm_record_goal_history(p_id, 'cancelled', p_reason);
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_goal_cancel(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  return public.tm_cancel_goal(p_id, p_reason);
end;
$$;

create or replace function public.tm_goal_extend(p_id uuid, p_new_due date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  g public.tm_goals;
  v_prog jsonb;
begin
  perform public.tm_require_super();
  if p_new_due is null or coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into g from public.tm_goals where id = p_id and deleted_at is null;
  if g.id is null then raise exception 'not_found'; end if;
  v_prog := public.tm_goal_progress(p_id);
  insert into public.tm_fix_log (goal_id, action, reason, actor, old_value, new_value)
  values (
    p_id, 'extend', p_reason, auth.uid(),
    jsonb_build_object('due_date', g.due_date, 'pct', coalesce((v_prog->>'pct')::numeric, 0)),
    jsonb_build_object('due_date', p_new_due)
  );
  update public.tm_goals
  set due_date = p_new_due, pushed_count = pushed_count + 1,
      status = case when status = 'failed' then 'active' else status end,
      updated_at = now()
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
  perform public.tm_record_goal_history(p_id, 'failed', null);
  return public.tm_goal_json(p_id);
end;
$$;

create or replace function public.tm_goal_reopen(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
begin
  perform public.tm_require_super();
  update public.tm_goals
  set status = 'active', completed_at = null, failed_at = null, updated_at = now()
  where id = p_id and deleted_at is null and is_misc = false;
  if not found then raise exception 'not_found'; end if;
  update public.tm_history_goals
  set removed_at = public.tm_effective_now(),
      lines = coalesce(lines, '[]'::jsonb) || jsonb_build_array('Reopened ' || v_today::text)
  where goal_id = p_id and removed_at is null;
  insert into public.tm_fix_log (goal_id, action, actor, new_value)
  values (p_id, 'reopen', auth.uid(), jsonb_build_object('status', 'active'));
  return public.tm_goal_json(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Read / note RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tm_history_period_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  p public.tm_history_periods;
  v_super boolean := public.tm_is_super_admin();
  v_uid uuid := auth.uid();
  v_people jsonb;
  v_tasks jsonb;
  v_own public.tm_history_people;
  v_pct numeric;
  v_done int;
  v_missed int;
  v_cancelled int;
begin
  select * into p from public.tm_history_periods where id = p_id;
  if p.id is null then
    raise exception 'not_found';
  end if;

  v_people := coalesce((
    select jsonb_agg(jsonb_build_object(
      'profile_id', hp.profile_id,
      'full_name', pr.full_name,
      'done', hp.done, 'missed', hp.missed, 'cancelled', hp.cancelled,
      'on_time', hp.on_time, 'late', hp.late, 'pct', hp.pct
    ) order by pr.full_name)
    from public.tm_history_people hp
    join public.profiles pr on pr.id = hp.profile_id
    where hp.period_id = p.id
      and (v_super or hp.profile_id = v_uid)
  ), '[]'::jsonb);

  v_tasks := coalesce(p.snapshot->'tasks', '[]'::jsonb);
  if not v_super then
    v_tasks := coalesce((
      select jsonb_agg(el)
      from jsonb_array_elements(v_tasks) el
      where el->'owner_ids' ? v_uid::text
    ), '[]'::jsonb);
    select * into v_own from public.tm_history_people
    where period_id = p.id and profile_id = v_uid;
    v_pct := coalesce(v_own.pct, 0);
    v_done := coalesce(v_own.done, 0);
    v_missed := coalesce(v_own.missed, 0);
    v_cancelled := coalesce(v_own.cancelled, 0);
  else
    v_pct := p.pct;
    v_done := p.done;
    v_missed := p.missed;
    v_cancelled := p.cancelled;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'starts', p.starts,
    'ends', p.ends,
    'locked_at', p.locked_at,
    'provisional', p.locked_at is null,
    'pct', v_pct,
    'done', v_done,
    'missed', v_missed,
    'cancelled', v_cancelled,
    'got', p.got,
    'total', p.total,
    'note', p.note,
    'people', v_people,
    'tasks', v_tasks
  );
end;
$$;

create or replace function public.tm_list_history(p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  if p_kind is null or p_kind not in ('week', 'month', 'quarter', 'year') then
    raise exception 'invalid_period';
  end if;
  return coalesce((
    select jsonb_agg(public.tm_history_period_json(p.id) order by p.starts desc)
    from public.tm_history_periods p
    where p.kind = p_kind
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_get_history_period(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  return public.tm_history_period_json(p_id);
end;
$$;

create or replace function public.tm_set_period_note(p_period_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_history_periods
  set note = nullif(trim(p_note), '')
  where id = p_period_id;
  if not found then raise exception 'not_found'; end if;
  return public.tm_history_period_json(p_period_id);
end;
$$;

create or replace function public.tm_list_history_goals()
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
      'id', hg.id,
      'goal_id', hg.goal_id,
      'name', coalesce(hg.snapshot->>'name', g.name),
      'color', coalesce(hg.snapshot->>'color', g.color),
      'status', hg.status,
      'pct', hg.pct,
      'got', hg.got,
      'total', hg.total,
      'closed_at', hg.closed_at,
      'reason', hg.reason,
      'lines', hg.lines
    ) order by hg.closed_at desc nulls last, hg.created_at desc)
    from public.tm_history_goals hg
    left join public.tm_goals g on g.id = hg.goal_id
    where hg.removed_at is null
      and hg.status in ('completed', 'failed', 'cancelled')
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard recap + tick hook
-- ---------------------------------------------------------------------------

create or replace function public.tm_last_week_recap(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_week public.tm_history_periods;
  v_own public.tm_history_people;
  v_super boolean := public.tm_is_super_admin();
  v_pct numeric := 0;
  v_missed int := 0;
begin
  select p.* into v_week
  from public.tm_history_periods p
  where p.kind = 'week' and p.ends < v_today
  order by p.starts desc
  limit 1;
  if v_week.id is null then
    return jsonb_build_object('placeholder', false, 'headline', 'No week recap yet', 'pct', 0, 'missed', 0);
  end if;
  if v_super and p_person is null then
    v_pct := coalesce(v_week.pct, 0);
    v_missed := coalesce(v_week.missed, 0);
  else
    select * into v_own
    from public.tm_history_people
    where period_id = v_week.id and profile_id = coalesce(p_person, auth.uid());
    v_pct := coalesce(v_own.pct, 0);
    v_missed := coalesce(v_own.missed, 0);
  end if;
  return jsonb_build_object(
    'placeholder', false,
    'headline', 'Last week: ' || round(v_pct) || '%, ' || v_missed || ' missed',
    'pct', v_pct,
    'missed', v_missed,
    'period_id', v_week.id,
    'provisional', v_week.locked_at is null,
    'starts', v_week.starts,
    'ends', v_week.ends
  );
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
  base jsonb;
begin
  perform public.tm_require_staff();
  v_person := case when v_super then p_person else auth.uid() end;
  base := jsonb_build_object(
    'role', case when v_super then 'super_admin' else 'admin' end,
    'recap', public.tm_last_week_recap(v_person),
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
  v_hist jsonb;
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

  v_hist := public.tm_refresh_history();

  return jsonb_build_object(
    'ok', true, 'today', v_today, 'spawned', v_spawned, 'closed_missed', v_closed, 'history', v_hist
  );
end;
$$;

-- Allow service-role / docker to clear the time machine (auth.uid() is null).
create or replace function public.tm_clear_time_machine()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  if auth.uid() is not null then
    perform public.tm_require_super();
  end if;
  if current_database() ilike '%bnmty%' then raise exception 'forbidden'; end if;
  update public.tm_settings set value = 'null'::jsonb where key = 'time_machine';
  return jsonb_build_object('ok', true, 'now', public.tm_effective_now(), 'today', public.tm_charlotte_today());
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

do $$
begin
  if current_database() ilike '%bnmty%' then
    return;
  end if;
  perform public.tm_backfill_history();
end $$;
