-- Wave 1: Tasks schema (tm_*), RLS, RPCs, helper-admin lockdown helpers,
-- and the door check-in server-side lock.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.tm_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
      and p.deleted_at is null
  );
$$;

create or replace function public.tm_is_helper_admin()
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.tm_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  parent_id uuid references public.tm_folders(id) on delete restrict,
  sort int not null default 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tm_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind text not null check (kind in ('task', 'number', 'parent')),
  color text,
  due_date date,
  parent_id uuid references public.tm_goals(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'ready', 'completed', 'failed', 'cancelled')),
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_reason text,
  number_current numeric,
  number_target numeric,
  number_unit text,
  number_source text check (
    number_source is null
    or number_source in ('new_members', 'active_members', 'business_members', 'checkins', 'manual')
  ),
  counts_time_bars boolean not null default false,
  size text check (size is null or size in ('S', 'M', 'L', 'XL')),
  pushed_count int not null default 0,
  is_misc boolean not null default false,
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tm_goals_one_misc on public.tm_goals (is_misc) where is_misc and deleted_at is null;

create table public.tm_goal_progress_log (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.tm_goals(id) on delete cascade,
  delta numeric not null,
  note text,
  logged_by uuid references public.profiles(id) on delete set null,
  logged_at timestamptz not null default now()
);

create table public.tm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  folder_id uuid references public.tm_folders(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  size text not null default 'M' check (size in ('S', 'M', 'L', 'XL')),
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  due_date date,
  due_time time,
  counts boolean not null default true,
  repeat text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  repeat_series_id uuid,
  event_id uuid references public.events(id) on delete set null,
  needs_home boolean not null default false,
  pushed_count int not null default 0,
  cancelled_reason text,
  done_at timestamptz,
  done_late boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tm_task_goals (
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  goal_id uuid not null references public.tm_goals(id) on delete cascade,
  primary key (task_id, goal_id)
);

create table public.tm_task_owners (
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table public.tm_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tm_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  body text not null,
  mentions uuid[] not null default '{}',
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tm_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  r2_key text,
  name text not null,
  size bigint,
  drive_url text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tm_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create table public.tm_fix_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tm_tasks(id) on delete cascade,
  goal_id uuid references public.tm_goals(id) on delete cascade,
  action text not null check (action in (
    'reschedule', 'park', 'done_late', 'cancel', 'extend', 'fail',
    'complete', 'reopen', 'counts_on', 'counts_off', 'move'
  )),
  reason text,
  note text,
  actor uuid references public.profiles(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  at timestamptz not null default now(),
  check (task_id is not null or goal_id is not null)
);

create table public.tm_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('park', 'cancel', 'counts_off')),
  reason text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tm_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  task_id uuid references public.tm_tasks(id) on delete cascade,
  goal_id uuid references public.tm_goals(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tm_history_periods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('week', 'month', 'quarter', 'year')),
  starts date not null,
  ends date not null,
  locked_at timestamptz,
  pct numeric,
  done int not null default 0,
  missed int not null default 0,
  cancelled int not null default 0,
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.tm_history_goals (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.tm_history_periods(id) on delete cascade,
  goal_id uuid references public.tm_goals(id) on delete set null,
  status text,
  pct numeric,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.tm_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.tm_saved_filters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.tm_event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tm_event_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.tm_event_templates(id) on delete cascade,
  title text not null,
  days_before int not null default 0,
  size text default 'M' check (size is null or size in ('S', 'M', 'L', 'XL')),
  sort int not null default 0
);

create index tm_folders_parent_idx on public.tm_folders (parent_id) where deleted_at is null;
create index tm_goals_parent_idx on public.tm_goals (parent_id) where deleted_at is null;
create index tm_tasks_folder_idx on public.tm_tasks (folder_id) where deleted_at is null;
create index tm_tasks_status_idx on public.tm_tasks (status) where deleted_at is null;
create index tm_task_owners_profile_idx on public.tm_task_owners (profile_id);
create index tm_notifications_profile_idx on public.tm_notifications (profile_id, read_at);
create index tm_requests_status_idx on public.tm_requests (status) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Depth / Misc / time-machine guards
-- ---------------------------------------------------------------------------

create or replace function public.tm_enforce_folder_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.tm_folders p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Folders are limited to 2 levels';
    end if;
    if exists (select 1 from public.tm_folders c where c.parent_id = new.id) then
      raise exception 'A folder with children cannot become a subfolder';
    end if;
  end if;
  return new;
end;
$$;

create trigger tm_folders_depth
  before insert or update of parent_id on public.tm_folders
  for each row execute function public.tm_enforce_folder_depth();

create or replace function public.tm_enforce_goal_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.tm_goals p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Goals are limited to 1 sub-goal level';
    end if;
    if exists (select 1 from public.tm_goals c where c.parent_id = new.id) then
      raise exception 'A goal with children cannot become a sub-goal';
    end if;
  end if;
  return new;
end;
$$;

create trigger tm_goals_depth
  before insert or update of parent_id on public.tm_goals
  for each row execute function public.tm_enforce_goal_depth();

create or replace function public.tm_misc_never_completes()
returns trigger
language plpgsql
as $$
begin
  if new.is_misc and new.status is distinct from 'active' then
    raise exception 'Misc never completes';
  end if;
  return new;
end;
$$;

create trigger tm_goals_misc
  before update on public.tm_goals
  for each row execute function public.tm_misc_never_completes();

create trigger tm_folders_updated_at
  before update on public.tm_folders
  for each row execute function public.update_updated_at_column();

create trigger tm_goals_updated_at
  before update on public.tm_goals
  for each row execute function public.update_updated_at_column();

create trigger tm_tasks_updated_at
  before update on public.tm_tasks
  for each row execute function public.update_updated_at_column();

create trigger tm_event_templates_updated_at
  before update on public.tm_event_templates
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Seed folders, Misc goal, settings
-- ---------------------------------------------------------------------------

insert into public.tm_folders (name, color, sort)
values
  ('Events', '#C6A664', 10),
  ('Marketing', '#C6A664', 20),
  ('Partnerships', '#C6A664', 30),
  ('Hubs', '#C6A664', 40),
  ('Ops', '#C6A664', 50),
  ('Finance', '#C6A664', 60),
  ('Misc', '#8A8A8A', 70);

insert into public.tm_goals (name, kind, status, is_misc, color)
values ('Misc', 'task', 'active', true, '#8A8A8A');

insert into public.tm_settings (key, value)
values
  (
    'reasons',
    '["Ran out of time","Waiting on someone","Priorities changed","Blocked","Other"]'::jsonb
  ),
  ('time_machine', 'null'::jsonb);

comment on table public.tm_settings is
  'Tasks settings. time_machine is develop-only; production must ignore it.';

-- ---------------------------------------------------------------------------
-- Visibility helpers + RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tm_can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select
    public.tm_is_super_admin()
    or exists (
      select 1 from public.tm_task_owners o
      where o.task_id = p_task_id
        and o.profile_id = auth.uid()
    );
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
    return query
      select t.* from public.tm_tasks t
      where t.deleted_at is null;
    return;
  end if;

  if public.tm_is_helper_admin() then
    return query
      select t.*
      from public.tm_tasks t
      join public.tm_task_owners o on o.task_id = t.id
      where o.profile_id = auth.uid()
        and t.deleted_at is null;
    return;
  end if;

  raise exception 'forbidden';
end;
$$;

-- Effective "now" for later waves. Production must ignore time_machine.
create or replace function public.tm_effective_now()
returns timestamptz
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v jsonb;
  d timestamptz;
begin
  -- Prod never honors this. Develop rehearsal only when the key is a timestamp.
  if current_setting('app.honor_time_machine', true) is distinct from 'on' then
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

-- ---------------------------------------------------------------------------
-- RLS + grants (no table access for anon/authenticated)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tm_folders',
    'tm_goals',
    'tm_goal_progress_log',
    'tm_tasks',
    'tm_task_goals',
    'tm_task_owners',
    'tm_checklist_items',
    'tm_comments',
    'tm_attachments',
    'tm_activity',
    'tm_fix_log',
    'tm_requests',
    'tm_notifications',
    'tm_history_periods',
    'tm_history_goals',
    'tm_settings',
    'tm_saved_filters',
    'tm_event_templates',
    'tm_event_template_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- Defense-in-depth policies (tables are not granted to authenticated).
create policy tm_tasks_select_visible on public.tm_tasks
  for select to authenticated
  using (public.tm_can_see_task(id));

create policy tm_task_owners_select_visible on public.tm_task_owners
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_task_goals_select_visible on public.tm_task_goals
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_checklist_select_visible on public.tm_checklist_items
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_comments_select_visible on public.tm_comments
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_attachments_select_visible on public.tm_attachments
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_activity_select_visible on public.tm_activity
  for select to authenticated
  using (public.tm_can_see_task(task_id));

create policy tm_fix_log_select_visible on public.tm_fix_log
  for select to authenticated
  using (
    public.tm_is_super_admin()
    or (task_id is not null and public.tm_can_see_task(task_id))
  );

create policy tm_requests_select_own on public.tm_requests
  for select to authenticated
  using (public.tm_is_super_admin() or requested_by = auth.uid());

create policy tm_notifications_select_own on public.tm_notifications
  for select to authenticated
  using (public.tm_is_super_admin() or profile_id = auth.uid());

create policy tm_saved_filters_select_own on public.tm_saved_filters
  for select to authenticated
  using (public.tm_is_super_admin() or profile_id = auth.uid());

create policy tm_folders_super on public.tm_folders
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_goals_super on public.tm_goals
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_goal_progress_super on public.tm_goal_progress_log
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_history_periods_super on public.tm_history_periods
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_history_goals_super on public.tm_history_goals
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_settings_super on public.tm_settings
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_event_templates_super on public.tm_event_templates
  for select to authenticated
  using (public.tm_is_super_admin());

create policy tm_event_template_items_super on public.tm_event_template_items
  for select to authenticated
  using (public.tm_is_super_admin());

revoke all on function public.tm_is_super_admin() from public, anon;
revoke all on function public.tm_is_helper_admin() from public, anon;
revoke all on function public.tm_can_see_task(uuid) from public, anon;
revoke all on function public.tm_list_tasks() from public, anon;
revoke all on function public.tm_effective_now() from public, anon;

grant execute on function public.tm_is_super_admin() to authenticated, service_role;
grant execute on function public.tm_is_helper_admin() to authenticated, service_role;
grant execute on function public.tm_can_see_task(uuid) to authenticated, service_role;
grant execute on function public.tm_list_tasks() to authenticated, service_role;
grant execute on function public.tm_effective_now() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Door check-in server-side lock (Oct gap: client wrote attendance_credentials)
-- ---------------------------------------------------------------------------

create or replace function public.tm_door_checkin_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.checked_in_at is distinct from old.checked_in_at
    or new.checkin_override_reason is distinct from old.checkin_override_reason
    or new.checkin_failed_checks is distinct from old.checkin_failed_checks
  ) then
    if current_setting('704.door_checkin', true) is distinct from 'on'
       and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
       and current_setting('role', true) is distinct from 'service_role' then
      raise exception 'Check-in must go through door_apply_checkin';
    end if;
    if new.checkin_failed_checks is not null
       and coalesce(array_length(new.checkin_failed_checks, 1), 0) > 0
       and (new.checkin_override_reason is null or length(trim(new.checkin_override_reason)) < 3) then
      raise exception 'A reason is required';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tm_door_checkin_guard on public.attendance_credentials;
create trigger tm_door_checkin_guard
  before update on public.attendance_credentials
  for each row execute function public.tm_door_checkin_guard();

create or replace function public.door_apply_checkin(
  p_credential_id uuid,
  p_override_reason text default null,
  p_failed_checks text[] default null
)
returns text
language plpgsql
security definer
set search_path to public
as $$
declare
  v_cred public.attendance_credentials%rowtype;
  v_event public.events%rowtype;
  v_profile public.profiles%rowtype;
  v_failed text[] := '{}';
  v_status text;
  v_event_status text;
  v_is_guest boolean;
  v_eligible boolean;
  v_person uuid;
  v_now timestamptz := now();
begin
  if not public.tm_is_super_admin() then
    return 'Forbidden';
  end if;

  select * into v_cred
  from public.attendance_credentials
  where id = p_credential_id
  for update;
  if not found then
    return 'Pass not found';
  end if;
  if v_cred.checked_in_at is not null then
    return 'Already checked in';
  end if;

  v_status := lower(coalesce(v_cred.status, ''));
  if v_status = 'voided' then
    return 'This pass is no longer valid';
  end if;
  if v_status = 'expired' then
    return 'This pass has expired';
  end if;

  if v_cred.event_id is not null then
    select * into v_event from public.events where id = v_cred.event_id;
  end if;

  v_is_guest := lower(coalesce(v_cred.credential_type, '')) in ('guest_pass', 'public_rsvp');
  if v_is_guest and v_status is distinct from 'active' then
    return 'This pass is not active';
  end if;
  if not v_is_guest and v_status not in ('active', 'used') then
    return 'This pass is not active';
  end if;

  v_event_status := lower(coalesce(v_event.status, ''));
  if v_event_status in ('cancelled', 'canceled') then
    v_failed := array_append(v_failed, 'event_cancelled');
  elsif v_event_status = 'rescheduled' then
    v_failed := array_append(v_failed, 'event_rescheduled');
  end if;

  if not v_is_guest then
    select p.* into v_profile
    from public.people pe
    left join public.profiles p
      on p.id = coalesce(pe.auth_user_id, nullif(pe.metadata ->> 'profile_id', '')::uuid)
     and p.deleted_at is null
    where pe.id = v_cred.person_id;

    v_eligible :=
      v_profile.membership_override is true
      or lower(coalesce(v_profile.subscription_status, '')) in ('active', 'paused', 'trialing', 'past_due')
      or (
        lower(coalesce(v_profile.subscription_status, '')) in ('canceled', 'cancelled')
        and v_profile.subscription_ends_at is not null
        and v_profile.subscription_ends_at > v_now
      );

    if not v_eligible then
      v_failed := array_append(v_failed, 'not_a_member');
    elsif lower(coalesce(v_event.required_tier, 'public')) in ('business', 'founder')
      and lower(coalesce(v_profile.member_type, '')) is distinct from 'business' then
      v_failed := array_append(v_failed, 'wrong_tier');
    end if;
  end if;

  if p_failed_checks is not null then
    v_failed := (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(v_failed || p_failed_checks) as x
    );
  end if;

  if coalesce(array_length(v_failed, 1), 0) > 0
     and (p_override_reason is null or length(trim(p_override_reason)) < 3) then
    return 'A reason is required';
  end if;

  select pe.id into v_person
  from public.people pe
  where pe.auth_user_id = auth.uid()
     or (pe.metadata ->> 'profile_id') = auth.uid()::text
  limit 1;

  perform set_config('704.door_checkin', 'on', true);

  update public.attendance_credentials
  set
    checked_in_at = v_now,
    status = 'used',
    checkin_override_reason = case
      when coalesce(array_length(v_failed, 1), 0) > 0 then trim(p_override_reason)
      else null
    end,
    checkin_failed_checks = case
      when coalesce(array_length(v_failed, 1), 0) > 0 then v_failed
      else null
    end,
    checked_in_by = coalesce(v_person, checked_in_by)
  where id = p_credential_id
    and checked_in_at is null;

  if not found then
    return 'Already checked in';
  end if;
  return null;
end;
$$;

revoke all on function public.door_apply_checkin(uuid, text, text[]) from public, anon;
grant execute on function public.door_apply_checkin(uuid, text, text[]) to authenticated, service_role;

-- Helpers must not write credentials. Super admins keep write (non-check-in cols).
drop policy if exists ac_admin_write on public.attendance_credentials;
create policy ac_admin_write on public.attendance_credentials
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
        and profiles.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
        and profiles.deleted_at is null
    )
  );

drop policy if exists ac_select_own_or_admin on public.attendance_credentials;
create policy ac_select_own_or_admin on public.attendance_credentials
  for select using (
    exists (
      select 1 from public.people p
      where p.id = attendance_credentials.person_id
        and (p.metadata ->> 'profile_id') = auth.uid()::text
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
        and profiles.deleted_at is null
    )
  );
