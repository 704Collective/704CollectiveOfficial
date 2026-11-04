-- SQL32 Tasks system for production.
-- Built from tm_ waves 1-6 on develop. Do not run on develop.
-- No develop seeds, no test accounts, no chip allowlist,
-- honor_time_machine stays false, no develop pg_cron.

begin;

-- TRIPWIRE 1
do $$
declare
  v_tm_tables int;
  v_tm_funcs int;
  v_role_ok boolean;
  v_winners boolean;
  v_creds boolean;
  v_door boolean;
begin
  select count(*) into v_tm_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tm\_%';

  select count(*) into v_tm_funcs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'tm\_%';

  if v_tm_tables > 0 or v_tm_funcs > 0 then
    raise exception 'TRIPWIRE 1: tm_ already exists (tables=%, functions=%). Abort.', v_tm_tables, v_tm_funcs;
  end if;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%super_admin%'
      and pg_get_constraintdef(oid) ilike '%admin%'
      and pg_get_constraintdef(oid) ilike '%lead%'
  ) into v_role_ok;
  if not v_role_ok then
    raise exception 'TRIPWIRE 1: profiles.role check is missing.';
  end if;

  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'member_source_winners'
  ) into v_winners;
  if not v_winners then
    raise exception 'TRIPWIRE 1: member_source_winners is missing.';
  end if;

  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'attendance_credentials'
  ) into v_creds;
  if not v_creds then
    raise exception 'TRIPWIRE 1: attendance_credentials is missing.';
  end if;

  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'contact_source_is_door'
  ) into v_door;
  if not v_door then
    raise exception 'TRIPWIRE 1: Oct door helper contact_source_is_door is missing.';
  end if;
end $$;

-- =====================================================================
-- supabase/migrations/20261104010000_tm_wave1_schema.sql
-- =====================================================================

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

-- =====================================================================
-- supabase/migrations/20261104020000_tm_wave2_core.sql
-- =====================================================================

-- Wave 2: Tasks core RPCs (folders, tasks, lists, checklist, comments,
-- attachments, activity). Helpers never receive folder names.

-- ---------------------------------------------------------------------------
-- Defaults: Inbox folder, distinct folder colors
-- ---------------------------------------------------------------------------

insert into public.tm_folders (name, color, sort)
select 'Inbox', '#5C5C5C', 5
where not exists (
  select 1 from public.tm_folders f
  where f.name = 'Inbox' and f.parent_id is null and f.deleted_at is null
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

-- =====================================================================
-- supabase/migrations/20261104030000_tm_wave3_goals.sql
-- =====================================================================

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

-- =====================================================================
-- supabase/migrations/20261104040000_tm_wave4_overdue.sql
-- =====================================================================

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
  ('honor_time_machine', 'false'::jsonb)
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
  allow := '[]'::jsonb;
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
    'honor_time_machine', false,
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

-- =====================================================================
-- supabase/migrations/20261104050000_tm_wave5_history.sql
-- =====================================================================

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

select public.tm_backfill_history();

-- =====================================================================
-- supabase/migrations/20261104060000_tm_wave6_board.sql
-- =====================================================================

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
  update public.profiles set role = 'lead' where id = p_id;
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
    where p.id in (
      select (el->>'id')::uuid from jsonb_array_elements(public.tm_staff_people()) el
    )
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
    'honor_time_machine', false,
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


-- Product seed: Standard event template (no develop accounts).
do $$
declare
  v_tpl uuid;
begin
  select id into v_tpl from public.tm_event_templates where name = 'Standard event' limit 1;
  if v_tpl is null then
    insert into public.tm_event_templates (name) values ('Standard event') returning id into v_tpl;
  end if;
  delete from public.tm_event_template_items where template_id = v_tpl;
  insert into public.tm_event_template_items (template_id, title, days_before, size, counts, sort) values
    (v_tpl, 'Book venue', 30, 'M', true, 0),
    (v_tpl, 'Create event page', 21, 'S', true, 1),
    (v_tpl, 'Flyer', 14, 'S', true, 2),
    (v_tpl, '3 IG posts', 10, 'M', true, 3),
    (v_tpl, 'Reminder emails', 2, 'S', false, 4),
    (v_tpl, 'Door check-in', 0, 'S', false, 5),
    (v_tpl, 'Recap + photos', -2, 'S', true, 6);
end $$;

-- TRIPWIRE 2
do $$
declare
  v_tables int;
  v_no_rls int;
  v_anon int;
  v_auth int;
  v_svc int;
  v_honor jsonb;
  v_folders int;
  v_misc int;
  v_tpl int;
  v_rpc int;
  v_expected_tables int := 21;
  v_expected_folders int := 8;
  r record;
begin
  select count(*) into v_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tm\_%';
  if v_tables is distinct from v_expected_tables then
    raise exception 'TRIPWIRE 2: tm_ tables = %, expected %.', v_tables, v_expected_tables;
  end if;

  select count(*) into v_no_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tm\_%'
    and not c.relrowsecurity;
  if v_no_rls > 0 then
    raise exception 'TRIPWIRE 2: % tm_ tables missing RLS.', v_no_rls;
  end if;

  select count(*) into v_anon
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'tm\_%' and grantee = 'anon';
  select count(*) into v_auth
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'tm\_%' and grantee = 'authenticated';
  if v_anon > 0 or v_auth > 0 then
    raise exception 'TRIPWIRE 2: anon/authenticated have tm_ table grants (anon=%, authenticated=%).', v_anon, v_auth;
  end if;

  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tm\_%'
  loop
    select count(*) into v_svc
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = r.relname and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
    if v_svc < 4 then
      raise exception 'TRIPWIRE 2: service_role missing full grants on %.', r.relname;
    end if;
  end loop;

  select value into v_honor from public.tm_settings where key = 'honor_time_machine';
  if v_honor is not null and v_honor is distinct from 'false'::jsonb then
    raise exception 'TRIPWIRE 2: honor_time_machine must be false or absent (got %).', v_honor;
  end if;

  select count(*) into v_folders
  from public.tm_folders
  where parent_id is null and deleted_at is null;
  if v_folders is distinct from v_expected_folders then
    raise exception 'TRIPWIRE 2: top-level folders = %, expected %.', v_folders, v_expected_folders;
  end if;

  select count(*) into v_misc
  from public.tm_goals
  where is_misc = true and deleted_at is null and name = 'Misc';
  if v_misc is distinct from 1 then
    raise exception 'TRIPWIRE 2: Misc goal missing.';
  end if;

  select count(*) into v_tpl
  from public.tm_event_templates
  where name = 'Standard event';
  if v_tpl < 1 then
    raise exception 'TRIPWIRE 2: Standard event template missing.';
  end if;

  select count(distinct p.proname) into v_rpc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'tm\_%';
  if v_rpc < 80 then
    raise exception 'TRIPWIRE 2: tm_ RPCs too few (%).', v_rpc;
  end if;
end $$;

commit;
