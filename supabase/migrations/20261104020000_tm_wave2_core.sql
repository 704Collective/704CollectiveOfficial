-- Wave 2: Tasks core RPCs (folders, tasks, lists, checklist, comments,
-- attachments, activity). Helpers never receive folder names.

-- ---------------------------------------------------------------------------
-- Defaults: Inbox folder, November goal, distinct folder colors
-- ---------------------------------------------------------------------------

insert into public.tm_folders (name, color, sort)
select 'Inbox', '#5C5C5C', 5
where not exists (
  select 1 from public.tm_folders f
  where f.name = 'Inbox' and f.parent_id is null and f.deleted_at is null
);

insert into public.tm_goals (name, kind, status, color, due_date)
select 'Fill November events', 'task', 'active', '#C6A664', date '2026-11-30'
where not exists (
  select 1 from public.tm_goals g
  where g.name = 'Fill November events' and g.deleted_at is null
);

update public.tm_folders set color = '#C6A664' where name = 'Events' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#6B8E9F' where name = 'Marketing' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#C47B5A' where name = 'Partnerships' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#7A9E7E' where name = 'Hubs' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#8B7BB8' where name = 'Ops' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#4A9B8C' where name = 'Finance' and parent_id is null and deleted_at is null;
update public.tm_folders set color = '#8A8A8A' where name = 'Misc' and parent_id is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.tm_require_staff()
returns void
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if not (public.tm_is_super_admin() or public.tm_is_helper_admin()) then
    raise exception 'forbidden';
  end if;
end;
$$;

create or replace function public.tm_require_super()
returns void
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if not public.tm_is_super_admin() then
    raise exception 'forbidden';
  end if;
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

create or replace function public.tm_task_is_overdue(p_task public.tm_tasks)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select
    p_task.status not in ('done', 'cancelled')
    and p_task.due_date is not null
    and (
      p_task.due_date < public.tm_charlotte_today()
      or (
        p_task.due_date = public.tm_charlotte_today()
        and p_task.due_time is not null
        and (timezone('America/New_York', public.tm_effective_now()))::time > p_task.due_time
      )
    );
$$;

create or replace function public.tm_scrub_folders(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p is null then p
    else p
      - 'folder_id' - 'folder_name' - 'parent_folder_name'
      - 'from_folder_id' - 'to_folder_id'
      - 'from_folder_name' - 'to_folder_name'
      - 'parent_id'
  end;
$$;

create or replace function public.tm_write_activity(p_task_id uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  insert into public.tm_activity (task_id, actor, action, detail)
  values (p_task_id, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
end;
$$;

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
    'needs_home', p_task.needs_home,
    'pushed_count', p_task.pushed_count,
    'cancelled_reason', p_task.cancelled_reason,
    'done_at', p_task.done_at,
    'done_late', p_task.done_late,
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
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'role', p.role
      ) order by p.full_name)
      from public.tm_task_owners o
      join public.profiles p on p.id = o.profile_id
      where o.task_id = p_task.id
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'color', g.color,
        'is_misc', g.is_misc
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

-- Wave 1 leftover: never leak folder_id to helpers via tm_list_tasks.
create or replace function public.tm_list_tasks()
returns setof public.tm_tasks
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if public.tm_is_super_admin() then
    return query
      select t.* from public.tm_tasks t
      where t.deleted_at is null;
    return;
  end if;

  if public.tm_is_helper_admin() then
    return query
      select
        t.id, t.title, t.notes, null::uuid, t.status, t.size, t.priority,
        t.due_date, t.due_time, t.counts, t.repeat, t.repeat_series_id, t.event_id,
        t.needs_home, t.pushed_count, t.cancelled_reason, t.done_at, t.done_late,
        t.created_by, t.deleted_at, t.created_at, t.updated_at
      from public.tm_tasks t
      join public.tm_task_owners o on o.task_id = t.id
      where o.profile_id = auth.uid()
        and t.deleted_at is null;
    return;
  end if;

  raise exception 'forbidden';
end;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap / lookups
-- ---------------------------------------------------------------------------

create or replace function public.tm_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
  v_helper boolean := public.tm_is_helper_admin();
  v_role text;
  v_name text;
  v_overdue int := 0;
begin
  perform public.tm_require_staff();
  v_role := case when v_super then 'super_admin' else 'admin' end;
  select full_name into v_name from public.profiles where id = auth.uid();

  select count(*) into v_overdue
  from public.tm_tasks t
  where t.deleted_at is null
    and public.tm_task_is_overdue(t)
    and (
      v_super
      or exists (
        select 1 from public.tm_task_owners o
        where o.task_id = t.id and o.profile_id = auth.uid()
      )
    );

  return jsonb_build_object(
    'role', v_role,
    'profile_id', auth.uid(),
    'full_name', v_name,
    'overdue_count', v_overdue,
    'reasons', coalesce((select value from public.tm_settings where key = 'reasons'), '[]'::jsonb),
    'inbox_folder_id', case when v_super then (
      select id from public.tm_folders
      where name = 'Inbox' and parent_id is null and deleted_at is null
      limit 1
    ) else null end,
    'misc_folder_id', case when v_super then (
      select id from public.tm_folders
      where name = 'Misc' and parent_id is null and deleted_at is null
      limit 1
    ) else null end,
    'misc_goal_id', (
      select id from public.tm_goals where is_misc and deleted_at is null limit 1
    ),
    'folders', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'color', f.color,
        'parent_id', f.parent_id,
        'sort', f.sort,
        'archived_at', f.archived_at,
        'open_count', (
          select count(*) from public.tm_tasks t
          where t.folder_id = f.id and t.deleted_at is null
            and t.status not in ('done', 'cancelled')
        )
      ) order by f.sort, f.name)
      from public.tm_folders f
      where f.deleted_at is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'color', g.color, 'is_misc', g.is_misc
      ) order by g.is_misc desc, g.name)
      from public.tm_goals g
      where g.deleted_at is null and g.status in ('active', 'ready')
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'role', p.role
      ) order by p.role desc, p.full_name)
      from public.profiles p
      where p.deleted_at is null
        and p.role in ('super_admin', 'admin')
        and (v_super or p.id = auth.uid())
        and coalesce(p.email, '') not ilike 'hello@704collective.com'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Folders (super only)
-- ---------------------------------------------------------------------------

create or replace function public.tm_list_folders()
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
      'id', f.id,
      'name', f.name,
      'color', f.color,
      'parent_id', f.parent_id,
      'sort', f.sort,
      'archived_at', f.archived_at,
      'open_count', (
        select count(*) from public.tm_tasks t
        where t.folder_id = f.id and t.deleted_at is null
          and t.status not in ('done', 'cancelled')
      )
    ) order by f.sort, f.name)
    from public.tm_folders f
    where f.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_create_folder(p_name text, p_color text, p_parent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  perform public.tm_require_super();
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required';
  end if;
  insert into public.tm_folders (name, color, parent_id, created_by)
  values (trim(p_name), nullif(p_color, ''), p_parent_id, auth.uid())
  returning id into v_id;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_rename_folder(p_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required';
  end if;
  update public.tm_folders set name = trim(p_name) where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_recolor_folder(p_id uuid, p_color text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_folders set color = nullif(p_color, '') where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_move_folder(p_id uuid, p_parent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  if p_parent_id = p_id then raise exception 'invalid_parent'; end if;
  update public.tm_folders set parent_id = p_parent_id where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_archive_folder(p_id uuid, p_archive boolean)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_folders
  set archived_at = case when p_archive then now() else null end
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_folder_live_task_count(p_id uuid)
returns int
language sql
stable
security definer
set search_path to public
as $$
  select count(*)::int
  from public.tm_tasks t
  where t.deleted_at is null
    and (
      t.folder_id = p_id
      or t.folder_id in (select c.id from public.tm_folders c where c.parent_id = p_id and c.deleted_at is null)
    );
$$;

create or replace function public.tm_move_all_folder_tasks(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  r record;
  n int := 0;
begin
  perform public.tm_require_super();
  if p_from = p_to then raise exception 'same_folder'; end if;
  if not exists (select 1 from public.tm_folders where id = p_to and deleted_at is null) then
    raise exception 'not_found';
  end if;
  for r in
    select t.id
    from public.tm_tasks t
    where t.deleted_at is null
      and (
        t.folder_id = p_from
        or t.folder_id in (select c.id from public.tm_folders c where c.parent_id = p_from and c.deleted_at is null)
      )
  loop
    update public.tm_tasks set folder_id = p_to, needs_home = false where id = r.id;
    perform public.tm_write_activity(r.id, 'moved_folder', jsonb_build_object('from_folder_id', p_from, 'to_folder_id', p_to));
    n := n + 1;
  end loop;
  return jsonb_build_object('moved', n, 'folders', public.tm_list_folders());
end;
$$;

create or replace function public.tm_delete_folder(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_count int;
begin
  perform public.tm_require_super();
  v_count := public.tm_folder_live_task_count(p_id);
  if v_count > 0 then
    raise exception 'folder_has_tasks';
  end if;
  update public.tm_folders
  set deleted_at = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  update public.tm_folders
  set deleted_at = now()
  where parent_id = p_id and deleted_at is null;
  return public.tm_list_folders();
end;
$$;

create or replace function public.tm_list_trashed_folders()
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
      'id', f.id, 'name', f.name, 'color', f.color, 'deleted_at', f.deleted_at
    ) order by f.deleted_at desc)
    from public.tm_folders f
    where f.deleted_at is not null
      and f.deleted_at > now() - interval '30 days'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_restore_folder(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_folders
  set deleted_at = null
  where id = p_id
    and deleted_at is not null
    and deleted_at > now() - interval '30 days';
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'folders', public.tm_list_folders(),
    'trash', public.tm_list_trashed_folders()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create or replace function public.tm_create_task(p_title text, p_due_date date, p_due_time time, p_folder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
  v_helper boolean := public.tm_is_helper_admin();
  v_folder uuid;
  v_goal uuid;
  v_id uuid;
  v_task public.tm_tasks;
begin
  perform public.tm_require_staff();
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title_required';
  end if;
  select id into v_goal from public.tm_goals where is_misc and deleted_at is null limit 1;

  if v_helper then
    select id into v_folder from public.tm_folders
    where name = 'Misc' and parent_id is null and deleted_at is null limit 1;
  else
    v_folder := p_folder_id;
    if v_folder is null then
      select id into v_folder from public.tm_folders
      where name = 'Inbox' and parent_id is null and deleted_at is null limit 1;
    end if;
    if v_folder is null then
      select id into v_folder from public.tm_folders
      where name = 'Misc' and parent_id is null and deleted_at is null limit 1;
    end if;
  end if;

  insert into public.tm_tasks (
    title, folder_id, due_date, due_time, size, priority, counts, needs_home, created_by
  ) values (
    trim(p_title), v_folder, p_due_date, p_due_time, 'M', 'normal', true, v_helper, auth.uid()
  ) returning id into v_id;

  insert into public.tm_task_owners (task_id, profile_id) values (v_id, auth.uid());
  if v_goal is not null then
    insert into public.tm_task_goals (task_id, goal_id) values (v_id, v_goal);
  end if;
  perform public.tm_write_activity(v_id, 'created', jsonb_build_object('title', trim(p_title)));
  select * into v_task from public.tm_tasks where id = v_id;
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_update_task(
  p_id uuid,
  p_title text,
  p_notes text,
  p_size text,
  p_priority text
)
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
  update public.tm_tasks
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    notes = p_notes,
    size = coalesce(p_size, size),
    priority = coalesce(p_priority, priority)
  where id = p_id and deleted_at is null
  returning * into v_task;
  if v_task.id is null then raise exception 'not_found'; end if;
  perform public.tm_write_activity(p_id, 'updated', jsonb_build_object(
    'title', v_task.title, 'size', v_task.size, 'priority', v_task.priority
  ));
  return public.tm_task_json(v_task);
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
    done_at = case when p_status = 'done' then coalesce(done_at, now()) else null end,
    done_late = case when p_status = 'done' then v_late else false end
  where id = p_id
  returning * into v_task;
  perform public.tm_write_activity(p_id, 'status', jsonb_build_object('status', p_status, 'done_late', v_task.done_late));
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_move_task(p_id uuid, p_folder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_from uuid;
begin
  perform public.tm_require_super();
  select * into v_task from public.tm_tasks where id = p_id and deleted_at is null;
  if v_task.id is null then raise exception 'not_found'; end if;
  if not exists (select 1 from public.tm_folders where id = p_folder_id and deleted_at is null) then
    raise exception 'not_found';
  end if;
  v_from := v_task.folder_id;
  update public.tm_tasks
  set folder_id = p_folder_id, needs_home = false
  where id = p_id
  returning * into v_task;
  perform public.tm_write_activity(p_id, 'moved_folder', jsonb_build_object(
    'from_folder_id', v_from, 'to_folder_id', p_folder_id
  ));
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
      insert into public.tm_task_owners (task_id, profile_id)
      values (p_id, v_owner)
      on conflict do nothing;
    end loop;
  end if;
  perform public.tm_write_activity(p_id, 'owners', jsonb_build_object('owners', to_jsonb(p_owners)));
  select * into v_task from public.tm_tasks where id = p_id;
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_set_counts(p_id uuid, p_counts boolean)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
begin
  perform public.tm_require_super();
  update public.tm_tasks set counts = p_counts where id = p_id and deleted_at is null
  returning * into v_task;
  if v_task.id is null then raise exception 'not_found'; end if;
  perform public.tm_write_activity(p_id, 'counts', jsonb_build_object('counts', p_counts));
  return public.tm_task_json(v_task);
end;
$$;

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
  update public.tm_tasks set repeat = p_repeat where id = p_id and deleted_at is null
  returning * into v_task;
  if v_task.id is null then raise exception 'not_found'; end if;
  perform public.tm_write_activity(p_id, 'repeat', jsonb_build_object('repeat', p_repeat));
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_set_goals(p_id uuid, p_goals uuid[])
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_goal uuid;
begin
  perform public.tm_require_super();
  delete from public.tm_task_goals where task_id = p_id;
  if p_goals is not null then
    foreach v_goal in array p_goals loop
      insert into public.tm_task_goals (task_id, goal_id) values (p_id, v_goal)
      on conflict do nothing;
    end loop;
  end if;
  perform public.tm_write_activity(p_id, 'goals', jsonb_build_object('goals', to_jsonb(p_goals)));
  select * into v_task from public.tm_tasks where id = p_id;
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_soft_delete_task(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  update public.tm_tasks set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  perform public.tm_write_activity(p_id, 'deleted', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_cancel_task(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
begin
  perform public.tm_require_super();
  update public.tm_tasks
  set status = 'cancelled', cancelled_reason = nullif(trim(p_reason), '')
  where id = p_id and deleted_at is null
  returning * into v_task;
  if v_task.id is null then raise exception 'not_found'; end if;
  insert into public.tm_fix_log (task_id, action, reason, actor, new_value)
  values (p_id, 'cancel', nullif(trim(p_reason), ''), auth.uid(), jsonb_build_object('status', 'cancelled'));
  perform public.tm_write_activity(p_id, 'cancelled', jsonb_build_object('reason', p_reason));
  return public.tm_task_json(v_task);
end;
$$;

create or replace function public.tm_create_request(p_id uuid, p_kind text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('park', 'cancel', 'counts_off') then raise exception 'invalid_kind'; end if;
  insert into public.tm_requests (task_id, requested_by, kind, reason)
  values (p_id, auth.uid(), p_kind, nullif(trim(p_reason), ''))
  returning id into v_id;
  perform public.tm_write_activity(p_id, 'request', jsonb_build_object('kind', p_kind, 'request_id', v_id));
  return jsonb_build_object('id', v_id, 'kind', p_kind, 'status', 'pending');
end;
$$;

create or replace function public.tm_set_due(p_id uuid, p_due_date date, p_due_time time, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_old_date date;
  v_old_time time;
  v_later boolean := false;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  select * into v_task from public.tm_tasks where id = p_id and deleted_at is null;
  if v_task.id is null then raise exception 'not_found'; end if;
  v_old_date := v_task.due_date;
  v_old_time := v_task.due_time;

  if v_old_date is not null and p_due_date is not null then
    if p_due_date > v_old_date then
      v_later := true;
    elsif p_due_date = v_old_date
      and p_due_time is not null
      and (v_old_time is null or p_due_time > v_old_time)
    then
      v_later := true;
    end if;
  end if;

  if v_later then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'reason_required';
    end if;
    update public.tm_tasks
    set due_date = p_due_date, due_time = p_due_time, pushed_count = pushed_count + 1
    where id = p_id
    returning * into v_task;
    insert into public.tm_fix_log (task_id, action, reason, actor, old_value, new_value)
    values (
      p_id, 'reschedule', trim(p_reason), auth.uid(),
      jsonb_build_object('due_date', v_old_date, 'due_time', v_old_time),
      jsonb_build_object('due_date', p_due_date, 'due_time', p_due_time)
    );
    perform public.tm_write_activity(p_id, 'due_pushed', jsonb_build_object(
      'due_date', p_due_date, 'reason', trim(p_reason), 'pushed_count', v_task.pushed_count
    ));
  else
    update public.tm_tasks
    set due_date = p_due_date, due_time = p_due_time
    where id = p_id
    returning * into v_task;
    perform public.tm_write_activity(p_id, 'due', jsonb_build_object('due_date', p_due_date));
  end if;

  return public.tm_task_json(v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create or replace function public.tm_visible_tasks()
returns setof public.tm_tasks
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_staff();
  if public.tm_is_super_admin() then
    return query select t.* from public.tm_tasks t where t.deleted_at is null;
  else
    return query
      select t.*
      from public.tm_tasks t
      join public.tm_task_owners o on o.task_id = t.id
      where o.profile_id = auth.uid() and t.deleted_at is null;
  end if;
end;
$$;

create or replace function public.tm_list_my_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_today date := public.tm_charlotte_today();
  v_monday date := v_today - ((extract(isodow from v_today)::int) - 1);
  v_sunday date := v_monday + 6;
  v_now timestamptz := public.tm_effective_now();
  r public.tm_tasks;
  v_bucket text;
  v_out jsonb := jsonb_build_object(
    'today', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'this_week', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'overdue', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'later', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'no_date', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'done', jsonb_build_object('counted', '[]'::jsonb, 'not_counted', '[]'::jsonb),
    'overdue_count', 0
  );
  v_key text;
  v_row jsonb;
  v_overdue int := 0;
begin
  perform public.tm_require_staff();
  for r in select * from public.tm_visible_tasks() loop
    if r.status = 'cancelled' then
      continue;
    elsif r.status = 'done' then
      if r.done_at is not null and r.done_at < v_now - interval '7 days' then
        continue;
      end if;
      v_bucket := 'done';
    elsif public.tm_task_is_overdue(r) then
      v_bucket := 'overdue';
      v_overdue := v_overdue + 1;
    elsif r.due_date is null then
      v_bucket := 'no_date';
    elsif r.due_date = v_today then
      v_bucket := 'today';
    elsif r.due_date > v_today and r.due_date <= v_sunday then
      v_bucket := 'this_week';
    else
      v_bucket := 'later';
    end if;
    v_key := case when r.counts then 'counted' else 'not_counted' end;
    v_row := public.tm_task_json(r);
    v_out := jsonb_set(
      v_out,
      array[v_bucket, v_key],
      coalesce(v_out -> v_bucket -> v_key, '[]'::jsonb) || jsonb_build_array(v_row)
    );
  end loop;
  v_out := jsonb_set(v_out, '{overdue_count}', to_jsonb(v_overdue));
  return v_out;
end;
$$;

create or replace function public.tm_list_folder_tasks(p_folder_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_now timestamptz := public.tm_effective_now();
begin
  perform public.tm_require_super();
  return coalesce((
    select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
    from public.tm_tasks t
    where t.deleted_at is null
      and t.folder_id = p_folder_id
      and t.status <> 'cancelled'
      and (
        t.status <> 'done'
        or t.done_at is null
        or t.done_at >= v_now - interval '7 days'
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_list_team()
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
      'profile_id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'tasks', coalesce((
        select jsonb_agg(public.tm_task_json(t) order by t.due_date nulls last, t.title)
        from public.tm_tasks t
        join public.tm_task_owners o on o.task_id = t.id
        where o.profile_id = p.id
          and t.deleted_at is null
          and t.status not in ('cancelled')
          and t.needs_home = false
      ), '[]'::jsonb)
    ) order by p.full_name)
    from public.profiles p
    where p.role = 'admin' and p.deleted_at is null
      and exists (
        select 1 from public.tm_task_owners o
        join public.tm_tasks t on t.id = o.task_id
        where o.profile_id = p.id and t.deleted_at is null and t.needs_home = false
          and t.status <> 'cancelled'
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_list_needs_home()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.tm_require_super();
  return coalesce((
    select jsonb_agg(public.tm_task_json(t) order by t.created_at desc)
    from public.tm_tasks t
    where t.deleted_at is null and t.needs_home and t.status <> 'cancelled'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.tm_get_task(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_task public.tm_tasks;
  v_out jsonb;
  v_super boolean := public.tm_is_super_admin();
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_id) then raise exception 'forbidden'; end if;
  select * into v_task from public.tm_tasks where id = p_id and deleted_at is null;
  if v_task.id is null then raise exception 'not_found'; end if;
  v_out := public.tm_task_json(v_task);
  v_out := v_out || jsonb_build_object(
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'done', c.done, 'sort', c.sort
      ) order by c.sort, c.created_at)
      from public.tm_checklist_items c where c.task_id = p_id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'body', m.body, 'mentions', m.mentions,
        'author_id', m.author_id, 'created_at', m.created_at,
        'author_name', p.full_name, 'author_avatar', p.avatar_url
      ) order by m.created_at)
      from public.tm_comments m
      left join public.profiles p on p.id = m.author_id
      where m.task_id = p_id and m.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'size', a.size, 'r2_key', a.r2_key,
        'drive_url', a.drive_url, 'created_at', a.created_at
      ) order by a.created_at)
      from public.tm_attachments a where a.task_id = p_id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'action', x.action,
        'detail', case when v_super then x.detail else public.tm_scrub_folders(x.detail) end,
        'at', x.at,
        'actor_id', x.actor,
        'actor_name', p.full_name
      ) order by x.at desc)
      from public.tm_activity x
      left join public.profiles p on p.id = x.actor
      where x.task_id = p_id
    ), '[]'::jsonb),
    'notifications', case when v_super then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'profile_id', n.profile_id, 'kind', n.kind,
        'title', n.title, 'body', n.body, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.tm_notifications n where n.task_id = p_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'status', q.status, 'reason', q.reason, 'created_at', q.created_at
      ) order by q.created_at desc)
      from public.tm_requests q
      where q.task_id = p_id
        and (v_super or q.requested_by = auth.uid())
    ), '[]'::jsonb)
  );
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checklist / comments / attachments / activity
-- ---------------------------------------------------------------------------

create or replace function public.tm_checklist_add(p_task_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_sort int;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_task_id) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;
  select coalesce(max(sort), 0) + 1 into v_sort from public.tm_checklist_items where task_id = p_task_id;
  insert into public.tm_checklist_items (task_id, title, sort)
  values (p_task_id, trim(p_title), v_sort)
  returning id into v_id;
  perform public.tm_write_activity(p_task_id, 'checklist_add', jsonb_build_object('title', trim(p_title)));
  return jsonb_build_object('id', v_id, 'title', trim(p_title), 'done', false, 'sort', v_sort);
end;
$$;

create or replace function public.tm_checklist_update(p_id uuid, p_title text, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task uuid;
begin
  perform public.tm_require_staff();
  select task_id into v_task from public.tm_checklist_items where id = p_id;
  if v_task is null then raise exception 'not_found'; end if;
  if not public.tm_can_see_task(v_task) then raise exception 'forbidden'; end if;
  update public.tm_checklist_items
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    done = coalesce(p_done, done)
  where id = p_id;
  perform public.tm_write_activity(v_task, 'checklist_update', jsonb_build_object('id', p_id, 'done', p_done));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_checklist_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task uuid;
begin
  perform public.tm_require_staff();
  select task_id into v_task from public.tm_checklist_items where id = p_id;
  if v_task is null then raise exception 'not_found'; end if;
  if not public.tm_can_see_task(v_task) then raise exception 'forbidden'; end if;
  delete from public.tm_checklist_items where id = p_id;
  perform public.tm_write_activity(v_task, 'checklist_delete', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_parse_mentions(p_body text)
returns uuid[]
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_tokens text[];
  v_ids uuid[] := '{}';
  tok text;
  v_id uuid;
begin
  select coalesce(array_agg(distinct m[1]), '{}') into v_tokens
  from regexp_matches(coalesce(p_body, ''), '@([A-Za-z0-9._-]+)', 'g') as m;
  if v_tokens is null then
    return '{}';
  end if;
  foreach tok in array v_tokens loop
    select p.id into v_id
    from public.profiles p
    where p.deleted_at is null
      and p.role in ('super_admin', 'admin')
      and (
        lower(replace(coalesce(p.full_name, ''), ' ', '')) = lower(replace(tok, '-', ''))
        or lower(split_part(coalesce(p.full_name, ''), ' ', 1)) = lower(tok)
        or lower(split_part(coalesce(p.email, ''), '@', 1)) = lower(tok)
      )
    limit 1;
    if v_id is not null and not (v_id = any (v_ids)) then
      v_ids := v_ids || v_id;
    end if;
  end loop;
  return v_ids;
end;
$$;

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
      values (
        v_mid,
        'mention',
        coalesce(v_actor, 'Someone') || ' mentioned you',
        left(trim(p_body), 180),
        p_task_id
      );
    end if;
  end loop;
  perform public.tm_write_activity(p_task_id, 'comment', jsonb_build_object(
    'comment_id', v_id, 'mentions', to_jsonb(v_mentions)
  ));
  return jsonb_build_object(
    'id', v_id,
    'body', trim(p_body),
    'mentions', to_jsonb(v_mentions),
    'author_id', auth.uid(),
    'created_at', now()
  );
end;
$$;

create or replace function public.tm_attachment_add(
  p_task_id uuid,
  p_name text,
  p_r2_key text,
  p_size bigint,
  p_drive_url text
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_task_id) then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_size is not null and p_size > 25 * 1024 * 1024 then
    raise exception 'file_too_large';
  end if;
  if coalesce(p_r2_key, '') = '' and coalesce(p_drive_url, '') = '' then
    raise exception 'file_or_link_required';
  end if;
  insert into public.tm_attachments (task_id, name, r2_key, size, drive_url, uploaded_by)
  values (p_task_id, trim(p_name), nullif(p_r2_key, ''), p_size, nullif(trim(p_drive_url), ''), auth.uid())
  returning id into v_id;
  perform public.tm_write_activity(p_task_id, 'attachment', jsonb_build_object('name', trim(p_name)));
  return jsonb_build_object('id', v_id, 'name', trim(p_name), 'r2_key', p_r2_key, 'drive_url', p_drive_url, 'size', p_size);
end;
$$;

create or replace function public.tm_attachment_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_task uuid;
begin
  perform public.tm_require_staff();
  select task_id into v_task from public.tm_attachments where id = p_id;
  if v_task is null then raise exception 'not_found'; end if;
  if not public.tm_can_see_task(v_task) then raise exception 'forbidden'; end if;
  delete from public.tm_attachments where id = p_id;
  perform public.tm_write_activity(v_task, 'attachment_delete', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tm_activity_list(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_super boolean := public.tm_is_super_admin();
begin
  perform public.tm_require_staff();
  if not public.tm_can_see_task(p_task_id) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id,
      'action', x.action,
      'detail', case when v_super then x.detail else public.tm_scrub_folders(x.detail) end,
      'at', x.at,
      'actor_id', x.actor,
      'actor_name', p.full_name
    ) order by x.at desc)
    from public.tm_activity x
    left join public.profiles p on p.id = x.actor
    where x.task_id = p_task_id
  ), '[]'::jsonb);
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
