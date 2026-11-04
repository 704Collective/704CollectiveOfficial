-- Wave 6: grace fix, board/calendar/search/templates/manage, helper wall.
-- Develop only for seed/audit.

alter table public.tm_event_template_items
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists counts boolean not null default true;

alter table public.tm_saved_filters
  add column if not exists pinned boolean not null default false;

create table if not exists public.tm_retire_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  retired_at timestamptz not null default now()
);

alter table public.tm_retire_log enable row level security;
revoke all on table public.tm_retire_log from public, anon, authenticated;
grant select, insert, update, delete on public.tm_retire_log to service_role;

-- ---------------------------------------------------------------------------
-- A. Grace: recompute until lock. History people = staff only.
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
  v_should_lock boolean;
begin
  select id, locked_at into v_id, v_locked
  from public.tm_history_periods
  where kind = p_kind and starts = p_starts;

  v_should_lock := (p_ends < v_today and v_now >= v_lock_at);

  if v_id is not null and v_locked is not null then
    perform public.tm_history_apply_after(v_id);
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
    elsif v_row->>'outcome' = 'cancelled' then
      v_cancelled := v_cancelled + 1;
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
      v_should_lock,
      case when v_should_lock then v_now else null end
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
        scores_frozen = v_should_lock,
        locked_at = case when v_should_lock then coalesce(locked_at, v_now) else null end
    where id = v_id;
  end if;

  delete from public.tm_history_people where period_id = v_id;

  for r in
    select (el->>'id')::uuid as profile_id
    from jsonb_array_elements(public.tm_staff_people()) el
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

  if v_should_lock then
    perform public.tm_history_apply_after(v_id);
  end if;
  return v_id;
end;
$$;

-- event chip on tasks
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
  v_event text;
begin
  v_overdue := public.tm_task_is_overdue(p_task);
  if p_task.folder_id is not null then
    select * into v_folder from public.tm_folders where id = p_task.folder_id;
    if v_folder.parent_id is not null then
      select * into v_parent from public.tm_folders where id = v_folder.parent_id;
    end if;
  end if;
  if p_task.event_id is not null then
    select title into v_event from public.events where id = p_task.event_id;
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
    'event_id', p_task.event_id,
    'event_name', v_event,
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

-- ---------------------------------------------------------------------------
-- Board / calendar / search
-- ---------------------------------------------------------------------------

create or replace function public.tm_list_board()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_now timestamptz := public.tm_effective_now();
begin
  perform public.tm_require_staff();
  return jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
      from public.tm_visible_tasks() t
      where t.status = 'open'
    ), '[]'::jsonb),
    'in_progress', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
      from public.tm_visible_tasks() t
      where t.status = 'in_progress'
    ), '[]'::jsonb),
    'done', coalesce((
      select jsonb_agg(public.tm_task_json(t) order by t.done_at desc nulls last)
      from public.tm_visible_tasks() t
      where t.status = 'done' and (t.done_at is null or t.done_at >= v_now - interval '7 days')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.tm_list_calendar(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_start date;
  v_end date;
begin
  perform public.tm_require_staff();
  v_start := date_trunc('month', coalesce(p_month, public.tm_charlotte_today()))::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  return coalesce((
    select jsonb_agg(public.tm_task_json(t) order by t.due_date, t.title)
    from public.tm_visible_tasks() t
    where t.due_date is not null and t.due_date >= v_start and t.due_date <= v_end
      and t.status is distinct from 'cancelled'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_search_tasks(p_q text, p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
  v jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  perform public.tm_require_staff();
  return coalesce((
    select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
    from public.tm_visible_tasks() t
    where (v_q = '' or (
        lower(t.title) like '%' || v_q || '%'
        or lower(coalesce(t.notes, '')) like '%' || v_q || '%'
        or exists (select 1 from public.tm_checklist_items c where c.task_id = t.id and lower(c.title) like '%' || v_q || '%')
        or exists (select 1 from public.tm_comments cm where cm.task_id = t.id and lower(cm.body) like '%' || v_q || '%')
        or exists (
          select 1 from public.tm_task_goals tg
          join public.tm_goals g on g.id = tg.goal_id
          where tg.task_id = t.id and (
            lower(g.name) like '%' || v_q || '%'
            or lower(coalesce(g.description, '')) like '%' || v_q || '%'
          )
        )
        or (
          public.tm_is_super_admin()
          and exists (
            select 1 from public.tm_folders f where f.id = t.folder_id and lower(f.name) like '%' || v_q || '%'
          )
        )
        or exists (select 1 from public.tm_attachments a where a.task_id = t.id and lower(a.name) like '%' || v_q || '%')
      ))
      and (v->>'person' is null or exists (
        select 1 from public.tm_task_owners o where o.task_id = t.id and o.profile_id = (v->>'person')::uuid
      ))
      and (v->>'folder' is null or t.folder_id = (v->>'folder')::uuid)
      and (v->>'goal' is null or exists (
        select 1 from public.tm_task_goals tg where tg.task_id = t.id and tg.goal_id = (v->>'goal')::uuid
      ))
      and (v->>'status' is null or t.status = v->>'status')
      and (v->>'priority' is null or t.priority = v->>'priority')
      and (v->>'size' is null or t.size = v->>'size')
      and (v->>'counts' is null or t.counts = (v->>'counts')::boolean)
      and (v->>'due_from' is null or t.due_date >= (v->>'due_from')::date)
      and (v->>'due_to' is null or t.due_date <= (v->>'due_to')::date)
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved filters
-- ---------------------------------------------------------------------------

create or replace function public.tm_list_saved_filters()
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
      'id', f.id, 'name', f.name, 'spec', f.spec, 'pinned', f.pinned
    ) order by f.pinned desc, f.name)
    from public.tm_saved_filters f
    where f.profile_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_save_filter(p_name text, p_spec jsonb, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  perform public.tm_require_staff();
  if coalesce(trim(p_name), '') = '' then raise exception 'title_required'; end if;
  insert into public.tm_saved_filters (profile_id, name, spec, pinned)
  values (auth.uid(), trim(p_name), coalesce(p_spec, '{}'::jsonb), coalesce(p_pinned, false))
  returning id into v_id;
  return public.tm_list_saved_filters();
end;
$$;

create or replace function public.tm_pin_filter(p_id uuid, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  update public.tm_saved_filters set pinned = p_pinned
  where id = p_id and profile_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_saved_filters();
end;
$$;

-- ---------------------------------------------------------------------------
-- Event templates
-- ---------------------------------------------------------------------------

create or replace function public.tm_list_event_templates()
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
      'id', t.id, 'name', t.name,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'title', i.title, 'days_before', i.days_before,
          'size', i.size, 'counts', i.counts, 'owner_id', i.owner_id, 'sort', i.sort
        ) order by i.sort, i.title)
        from public.tm_event_template_items i where i.template_id = t.id
      ), '[]'::jsonb)
    ) order by t.name)
    from public.tm_event_templates t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_upsert_event_template(p_id uuid, p_name text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid := p_id;
  el jsonb;
  v_sort int := 0;
begin
  perform public.tm_require_super();
  if coalesce(trim(p_name), '') = '' then raise exception 'title_required'; end if;
  if v_id is null then
    insert into public.tm_event_templates (name, created_by) values (trim(p_name), auth.uid())
    returning id into v_id;
  else
    update public.tm_event_templates set name = trim(p_name), updated_at = now() where id = v_id;
  end if;
  delete from public.tm_event_template_items where template_id = v_id;
  for el in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.tm_event_template_items (
      template_id, title, days_before, size, counts, owner_id, sort
    ) values (
      v_id,
      el->>'title',
      coalesce((el->>'days_before')::int, 0),
      coalesce(el->>'size', 'M'),
      coalesce((el->>'counts')::boolean, true),
      nullif(el->>'owner_id', '')::uuid,
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;
  return public.tm_list_event_templates();
end;
$$;

create or replace function public.tm_delete_event_template(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  delete from public.tm_event_templates where id = p_id;
  return public.tm_list_event_templates();
end;
$$;

create or replace function public.tm_apply_event_template(
  p_template_id uuid, p_event_id uuid, p_goal_id uuid, p_include_past boolean
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.events;
  v_events uuid;
  v_month uuid;
  v_month_name text;
  v_goal uuid;
  v_misc uuid;
  el record;
  v_due date;
  v_id uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_today date := public.tm_charlotte_today();
begin
  perform public.tm_require_super();
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'not_found'; end if;
  select id into v_events from public.tm_folders
    where name = 'Events' and parent_id is null and deleted_at is null limit 1;
  if v_events is null then raise exception 'not_found'; end if;
  v_month_name := to_char(timezone('America/New_York', v_event.start_time), 'FMMonth YYYY');
  select id into v_month from public.tm_folders
    where parent_id = v_events and name = v_month_name and deleted_at is null limit 1;
  if v_month is null then
    insert into public.tm_folders (name, parent_id, color, sort)
    values (v_month_name, v_events, '#C47B5A', 0)
    returning id into v_month;
  end if;
  select id into v_misc from public.tm_goals where is_misc and deleted_at is null limit 1;
  v_goal := coalesce(p_goal_id, v_misc);

  for el in
    select * from public.tm_event_template_items where template_id = p_template_id order by sort
  loop
    v_due := (timezone('America/New_York', v_event.start_time))::date - el.days_before;
    if v_due < v_today and not coalesce(p_include_past, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.tm_tasks (title, folder_id, status, size, counts, due_date, event_id, created_by)
    values (el.title, v_month, 'open', coalesce(el.size, 'M'), el.counts, v_due, p_event_id, auth.uid())
    returning id into v_id;
    if el.owner_id is not null then
      insert into public.tm_task_owners (task_id, profile_id) values (v_id, el.owner_id);
    end if;
    if v_goal is not null then
      insert into public.tm_task_goals (task_id, goal_id) values (v_id, v_goal);
    end if;
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('ok', true, 'created', v_created, 'skipped', v_skipped, 'folder_id', v_month);
end;
$$;

-- ---------------------------------------------------------------------------
-- Manage: reasons, folders reorder, retire, trash, tips, export
-- ---------------------------------------------------------------------------

create or replace function public.tm_set_reasons(p_reasons jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  insert into public.tm_settings (key, value) values ('reasons', coalesce(p_reasons, '[]'::jsonb))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return coalesce(p_reasons, '[]'::jsonb);
end;
$$;

create or replace function public.tm_reorder_folders(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  i int;
begin
  perform public.tm_require_super();
  if p_ids is null then return public.tm_list_folders(); end if;
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update public.tm_folders set sort = i - 1 where id = p_ids[i] and deleted_at is null;
  end loop;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_retire_helper(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if not exists (select 1 from public.profiles where id = p_id and role = 'admin') then
    raise exception 'not_found';
  end if;
  insert into public.tm_retire_log (profile_id, task_id)
  select p_id, o.task_id from public.tm_task_owners o where o.profile_id = p_id;
  delete from public.tm_task_owners where profile_id = p_id;
  update public.tm_folders f
    set archived_at = now()
  from public.profiles p
  where p.id = p_id
    and f.deleted_at is null
    and f.archived_at is null
    and lower(f.name) = lower(coalesce(p.full_name, ''));
  update public.profiles set role = 'member' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_restore_helper(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.profiles set role = 'admin' where id = p_id;
  insert into public.tm_task_owners (task_id, profile_id)
  select task_id, profile_id from public.tm_retire_log where profile_id = p_id
  on conflict do nothing;
  delete from public.tm_retire_log where profile_id = p_id;
  update public.tm_folders f
    set archived_at = null
  from public.profiles p
  where p.id = p_id
    and f.deleted_at is null
    and lower(f.name) = lower(coalesce(p.full_name, ''));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_list_people()
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
      'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
      'role', p.role, 'retired', exists (select 1 from public.tm_retire_log r where r.profile_id = p.id)
    ) order by p.full_name)
    from public.profiles p
    where p.role in ('admin', 'super_admin')
       or exists (select 1 from public.tm_retire_log r where r.profile_id = p.id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_list_trash()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  return jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'deleted_at', t.deleted_at) order by t.deleted_at desc)
      from public.tm_tasks t where t.deleted_at is not null
    ), '[]'::jsonb),
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'deleted_at', f.deleted_at) order by f.deleted_at desc)
      from public.tm_folders f where f.deleted_at is not null
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'deleted_at', g.deleted_at) order by g.deleted_at desc)
      from public.tm_goals g where g.deleted_at is not null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.tm_restore_anything(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if p_kind = 'task' then
    update public.tm_tasks set deleted_at = null where id = p_id;
  elsif p_kind = 'folder' then
    update public.tm_folders set deleted_at = null where id = p_id;
  elsif p_kind = 'goal' then
    update public.tm_goals set deleted_at = null where id = p_id;
  else
    raise exception 'invalid_action';
  end if;
  return public.tm_list_trash();
end;
$$;

create or replace function public.tm_purge_trash()
returns int
language plpgsql
security definer
set search_path to public
as $$
declare
  n int := 0;
  v_cut timestamptz := public.tm_effective_now() - interval '30 days';
begin
  delete from public.tm_tasks where deleted_at is not null and deleted_at < v_cut;
  get diagnostics n = row_count;
  delete from public.tm_folders where deleted_at is not null and deleted_at < v_cut;
  delete from public.tm_goals where deleted_at is not null and deleted_at < v_cut and is_misc = false;
  return n;
end;
$$;

create or replace function public.tm_dismiss_tips()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v jsonb;
begin
  perform public.tm_require_staff();
  select value into v from public.tm_settings where key = 'tips_dismissed';
  v := coalesce(v, '{}'::jsonb) || jsonb_build_object(auth.uid()::text, true);
  insert into public.tm_settings (key, value) values ('tips_dismissed', v)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_export_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  return jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date,
        'size', t.size, 'counts', t.counts
      ) order by t.title)
      from public.tm_tasks t where t.deleted_at is null
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status) order by g.name)
      from public.tm_goals g where g.deleted_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'starts', p.starts, 'pct', p.pct, 'done', p.done, 'missed', p.missed
      ) order by p.starts desc)
      from public.tm_history_periods p
    ), '[]'::jsonb)
  );
end;
$$;

-- bootstrap: show_tips
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
  v_tips jsonb;
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
  select value into v_tips from public.tm_settings where key = 'tips_dismissed';
  return jsonb_build_object(
    'role', v_role,
    'profile_id', auth.uid(),
    'full_name', v_name,
    'overdue_count', v_overdue,
    'unread_count', v_unread,
    'show_tips', coalesce(v_tips ->> auth.uid()::text, 'false') is distinct from 'true',
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
    'staff', case when v_super then public.tm_staff_people() else '[]'::jsonb end,
    'saved_filters', public.tm_list_saved_filters()
  );
end;
$$;

-- Hook purge into history refresh (called by tm_tick)
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
begin
  perform public.tm_purge_trash();

  foreach v_kind in array array['week', 'month', 'quarter', 'year']
  loop
    select w.starts, w.ends into v_starts, v_ends
    from public.tm_period_window(v_kind, v_today) w;
    perform public.tm_upsert_history_period(v_kind, v_starts, v_ends);
  end loop;

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
        where n.profile_id = v_person.id and n.kind = 'recap' and n.body = v_week.starts::text
      ) then
        insert into public.tm_notifications (profile_id, kind, title, body)
        values (v_person.id, 'recap', v_title, v_week.starts::text);
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper wall audit (develop)
-- ---------------------------------------------------------------------------

create or replace function public.tm_helper_wall_audit()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_helper uuid := 'a0000000-0000-4000-8000-000000000015';
  v_claims text;
  v_board jsonb;
  v_search jsonb;
  v_dash jsonb;
  v_hist jsonb;
  v_boot jsonb;
  v_fail text[] := '{}';
  v_pass text[] := '{}';
  v_txt text;
begin
  if current_database() ilike '%bnmty%' then
    raise exception 'forbidden';
  end if;
  v_claims := jsonb_build_object('sub', v_helper, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claim.sub', v_helper::text, true);
  perform set_config('request.jwt.claims', v_claims, true);

  v_board := public.tm_list_board();
  v_txt := v_board::text;
  if v_txt ~* 'folder_name|folder_id|"Events"|"Inbox"|"Marketing"' then
    v_fail := v_fail || array['board leaked folder names/ids'];
  else
    v_pass := v_pass || array['board has no folder names/ids'];
  end if;

  v_search := public.tm_search_tasks('', '{}'::jsonb);
  if exists (
    select 1 from jsonb_array_elements(v_search) el
    where not (el->'owner_ids' ? v_helper::text)
      and jsonb_array_length(coalesce(el->'owners', '[]'::jsonb)) > 0
      and not exists (
        select 1 from jsonb_array_elements(el->'owners') o where o->>'id' = v_helper::text
      )
  ) then
    v_fail := v_fail || array['search returned another person''s task'];
  else
    v_pass := v_pass || array['search is own-tasks only'];
  end if;

  v_dash := public.tm_dashboard(null);
  if v_dash->'people' is not null and jsonb_array_length(coalesce(v_dash->'people', '[]'::jsonb)) > 0 then
    v_fail := v_fail || array['dashboard people (company) leaked'];
  else
    v_pass := v_pass || array['no company people chips'];
  end if;
  if jsonb_array_length(coalesce(v_dash->'requests', '[]'::jsonb)) > 0 then
    v_fail := v_fail || array['requests list visible'];
  else
    v_pass := v_pass || array['no requests list'];
  end if;

  begin
    perform public.tm_list_event_templates();
    v_fail := v_fail || array['manage templates allowed'];
  exception when others then
    v_pass := v_pass || array['no manage templates'];
  end;
  begin
    perform public.tm_export_bundle();
    v_fail := v_fail || array['export allowed'];
  exception when others then
    v_pass := v_pass || array['no export'];
  end;

  v_hist := public.tm_list_history('week');
  if exists (
    select 1 from jsonb_array_elements(v_hist) p, jsonb_array_elements(coalesce(p->'people', '[]'::jsonb)) pe
    where pe->>'profile_id' is distinct from v_helper::text
  ) then
    v_fail := v_fail || array['history people of others'];
  else
    v_pass := v_pass || array['history own people only'];
  end if;

  v_boot := public.tm_bootstrap();
  if v_boot->>'role' = 'admin' and jsonb_array_length(coalesce(v_boot->'folders', '[]'::jsonb)) = 0 then
    v_pass := v_pass || array['bootstrap folders empty'];
  else
    v_fail := v_fail || array['bootstrap folders leaked'];
  end if;
  if v_boot->>'staff' is not null and jsonb_array_length(coalesce(v_boot->'staff', '[]'::jsonb)) > 0 then
    v_fail := v_fail || array['bootstrap staff leaked'];
  else
    v_pass := v_pass || array['bootstrap staff empty'];
  end if;

  return jsonb_build_object(
    'ok', coalesce(array_length(v_fail, 1), 0) = 0,
    'pass', to_jsonb(v_pass),
    'fail', to_jsonb(v_fail)
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

-- Develop seed: Standard event template + search fixtures
do $$
declare
  v_tpl uuid := 'c0000000-0000-4000-8000-000000000601';
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_helper uuid := 'a0000000-0000-4000-8000-000000000015';
  v_task uuid := 'e0000000-0000-4000-8000-000000000701';
  v_inbox uuid;
begin
  if current_database() ilike '%bnmty%' then
    return;
  end if;

  insert into public.tm_event_templates (id, name, created_by)
  values (v_tpl, 'Standard event', v_admin)
  on conflict (id) do update set name = excluded.name;

  delete from public.tm_event_template_items where template_id = v_tpl;
  insert into public.tm_event_template_items (template_id, title, days_before, size, counts, sort) values
    (v_tpl, 'Book venue', 30, 'M', true, 0),
    (v_tpl, 'Create event page', 21, 'S', true, 1),
    (v_tpl, 'Flyer', 14, 'S', true, 2),
    (v_tpl, '3 IG posts', 10, 'M', true, 3),
    (v_tpl, 'Reminder emails', 2, 'S', false, 4),
    (v_tpl, 'Door check-in', 0, 'S', false, 5),
    (v_tpl, 'Recap + photos', -2, 'S', true, 6);

  select id into v_inbox from public.tm_folders where name = 'Inbox' and parent_id is null and deleted_at is null;
  insert into public.tm_tasks (id, title, folder_id, status, size, counts, due_date, notes, created_by)
  values (v_task, 'Wave6 search target', v_inbox, 'open', 'S', true, public.tm_charlotte_today(), 'plain notes', v_admin)
  on conflict (id) do update set deleted_at = null, status = 'open';
  delete from public.tm_task_owners where task_id = v_task;
  insert into public.tm_task_owners (task_id, profile_id) values (v_task, v_admin);
  delete from public.tm_checklist_items where task_id = v_task;
  insert into public.tm_checklist_items (task_id, title, sort) values (v_task, 'zebra checklist word', 0);
  insert into public.tm_comments (task_id, author_id, body)
  select v_task, v_admin, 'comment has mango fruit'
  where not exists (select 1 from public.tm_comments c where c.task_id = v_task and c.body like '%mango%');

  -- reopen grace: unfreeze ended-but-unlocked leftover freeze
  update public.tm_history_periods
  set scores_frozen = false
  where locked_at is null;
end $$;
