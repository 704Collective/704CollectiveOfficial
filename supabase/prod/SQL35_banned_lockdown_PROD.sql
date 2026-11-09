-- SQL35 banned-person lockdown for production. Do not run until ready.
-- Schema + functions only. No person-row updates.
-- Do not run on develop (develop uses the matching migration).

begin;

-- TRIPWIRE 1: objects from this file must not already exist; get_event_attendees must exist and not yet be the replacement.
do $$
declare
  v_table boolean;
  v_blocked boolean;
  v_lock boolean;
  v_attendees text;
  v_anon_table int;
begin
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'blocked_emails'
  ) into v_table;
  if v_table then
    raise exception 'TRIPWIRE 1: public.blocked_emails already exists. Abort.';
  end if;

  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_email_blocked'
  ) into v_blocked;
  if v_blocked then
    raise exception 'TRIPWIRE 1: public.is_email_blocked already exists. Abort.';
  end if;

  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lock_banned_person'
  ) into v_lock;
  if v_lock then
    raise exception 'TRIPWIRE 1: public.lock_banned_person already exists. Abort.';
  end if;

  begin
    v_attendees := pg_get_functiondef('public.get_event_attendees(uuid)'::regprocedure);
  exception when undefined_function then
    raise exception 'TRIPWIRE 1: public.get_event_attendees(uuid) is missing; cannot replace.';
  end;
  if position('duplicate_role' in v_attendees) > 0 then
    raise exception 'TRIPWIRE 1: public.get_event_attendees already contains duplicate_role; already replaced. Abort.';
  end if;
end $$;

-- Banned-person lockdown: email blocklist, attendee hiding, lock RPC.
-- tickets.user_id and profiles->auth.users must not wipe history when an
-- auth user is later deleted.

-- ── people: ban flags (profiles already has both) ───────────────────────────

alter table public.people
  add column if not exists banned boolean not null default false;

alter table public.people
  add column if not exists is_banned boolean not null default false;

create index if not exists idx_people_is_banned
  on public.people (is_banned) where is_banned = true;

create index if not exists idx_people_banned
  on public.people (banned) where banned = true;

-- ── blocked_emails ──────────────────────────────────────────────────────────

create table if not exists public.blocked_emails (
  email_normalized text primary key,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.blocked_emails is
  'Normalized emails that must not sign up or submit a business application. Written by lock_banned_person. Read only via is_email_blocked.';

alter table public.blocked_emails enable row level security;

revoke all on table public.blocked_emails from public, anon, authenticated;
grant select, insert, update, delete on table public.blocked_emails to service_role;

-- ── Auth-delete safety: never cascade into tickets ──────────────────────────

alter table public.tickets
  alter column user_id drop not null;

alter table public.tickets
  drop constraint if exists tickets_user_id_fkey;

alter table public.tickets
  add constraint tickets_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- A locked banned profile must outlive its auth user. The default
-- ON DELETE CASCADE on profiles.id would erase the keeper record.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- ── is_email_blocked ────────────────────────────────────────────────────────

create or replace function public.is_email_blocked(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if v_email is null then
    return false;
  end if;

  if exists (
    select 1 from public.blocked_emails b
    where b.email_normalized = v_email
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.profiles pr
    where lower(trim(pr.email)) = v_email
      and (pr.banned = true or coalesce(pr.is_banned, false) = true)
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.people pe
    where coalesce(pe.email_lower, lower(trim(pe.email))) = v_email
      and (pe.banned = true or pe.is_banned = true)
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.is_email_blocked(text) from public, anon, authenticated;
grant execute on function public.is_email_blocked(text) to service_role;

-- ── lock_banned_person ──────────────────────────────────────────────────────

create or replace function public.lock_banned_person(p_people_id uuid, p_emails text[])
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_keeper public.people%rowtype;
  v_profile_id uuid;
  v_group text;
  v_meta jsonb;
  v_email text;
  v_norm text;
  v_blocked text[] := '{}';
  v_archived uuid[] := '{}';
  r record;
begin
  if auth.uid() is not null then
    perform public.tm_require_super();
  end if;

  select * into v_keeper
  from public.people
  where id = p_people_id
  for update;
  if not found then
    raise exception 'person_not_found';
  end if;

  v_profile_id := coalesce(
    nullif(v_keeper.metadata->>'profile_id', '')::uuid,
    v_keeper.auth_user_id
  );

  v_meta := coalesce(v_keeper.metadata, '{}'::jsonb);
  v_group := coalesce(nullif(v_meta->>'duplicate_group', ''), v_keeper.id::text);
  v_meta := v_meta || jsonb_build_object(
    'duplicate_group', v_group,
    'duplicate_role', 'primary'
  );

  update public.people
  set
    banned = true,
    is_banned = true,
    phone = null,
    phone_e164 = null,
    metadata = v_meta,
    updated_at = now()
  where id = v_keeper.id;

  if v_profile_id is not null then
    update public.profiles
    set
      banned = true,
      is_banned = true,
      banned_at = coalesce(banned_at, now()),
      banned_reason = coalesce(nullif(banned_reason, ''), 'locked'),
      phone = null,
      bio = null,
      avatar_url = null,
      linkedin_url = null,
      website_url = null
    where id = v_profile_id;
  end if;

  -- Archive others in the duplicate group, plus any people row whose email
  -- is in the supplied list (so relics without a group still fold in).
  for r in
    select pe.id, pe.email, pe.email_lower, pe.metadata
    from public.people pe
    where pe.id is distinct from v_keeper.id
      and (
        pe.metadata->>'duplicate_group' = v_group
        or coalesce(pe.email_lower, lower(trim(pe.email))) in (
          select nullif(lower(trim(x)), '')
          from unnest(coalesce(p_emails, '{}'::text[])) as x
        )
        or coalesce(pe.email_lower, lower(trim(pe.email)))
             = coalesce(v_keeper.email_lower, lower(trim(v_keeper.email)))
      )
  loop
    update public.people
    set
      banned = true,
      is_banned = true,
      phone = null,
      phone_e164 = null,
      metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'duplicate_role', 'archived',
        'duplicate_group', v_group
      ),
      updated_at = now()
    where id = r.id;
    v_archived := array_append(v_archived, r.id);
  end loop;

  -- Collect emails to block: argument list + keeper + archived + profile.
  foreach v_email in array coalesce(p_emails, '{}'::text[])
  loop
    v_norm := nullif(lower(trim(v_email)), '');
    if v_norm is not null and not (v_norm = any (v_blocked)) then
      v_blocked := array_append(v_blocked, v_norm);
    end if;
  end loop;

  v_norm := coalesce(v_keeper.email_lower, nullif(lower(trim(v_keeper.email)), ''));
  if v_norm is not null and not (v_norm = any (v_blocked)) then
    v_blocked := array_append(v_blocked, v_norm);
  end if;

  if v_profile_id is not null then
    select nullif(lower(trim(pr.email)), '') into v_norm
    from public.profiles pr
    where pr.id = v_profile_id;
    if v_norm is not null and not (v_norm = any (v_blocked)) then
      v_blocked := array_append(v_blocked, v_norm);
    end if;
  end if;

  for r in
    select coalesce(pe.email_lower, lower(trim(pe.email))) as e
    from public.people pe
    where pe.id = any (v_archived)
  loop
    v_norm := nullif(r.e, '');
    if v_norm is not null and not (v_norm = any (v_blocked)) then
      v_blocked := array_append(v_blocked, v_norm);
    end if;
  end loop;

  foreach v_norm in array v_blocked
  loop
    insert into public.blocked_emails (email_normalized, reason, created_by)
    values (v_norm, 'lock_banned_person', auth.uid())
    on conflict (email_normalized) do update
      set reason = excluded.reason;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'people_id', v_keeper.id,
    'profile_id', v_profile_id,
    'duplicate_group', v_group,
    'emails_blocked', to_jsonb(v_blocked),
    'archived_people_ids', to_jsonb(v_archived),
    'stripped_profile_fields',
      jsonb_build_array('phone', 'bio', 'avatar_url', 'linkedin_url', 'website_url'),
    'stripped_people_fields',
      jsonb_build_array('phone', 'phone_e164')
  );
end;
$$;

revoke all on function public.lock_banned_person(uuid, text[]) from public, anon;
grant execute on function public.lock_banned_person(uuid, text[]) to authenticated, service_role;

-- ── get_event_attendees: skip banned / deleted / archived identities ────────

create or replace function public.get_event_attendees(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_caller_id uuid;
  v_caller_active boolean;
  v_member_count bigint;
  v_public_count bigint;
  v_guest_count bigint;
  v_attendees jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then raise exception 'Not authenticated'; end if;
  select exists (
    select 1 from public.profiles
    where id = v_caller_id and deleted_at is null
      and (role in ('admin','super_admin')
        or (member_type in ('social','business')
            and (subscription_status in ('active','paused')
              or (subscription_status = 'canceled' and subscription_ends_at > now())
              or membership_override = true)))
  ) into v_caller_active;
  if not v_caller_active then raise exception 'Not authorized to view attendees'; end if;

  select count(*) into v_member_count
  from attendance_credentials ac
  join people pe on pe.id = ac.person_id
  left join profiles pr on pr.id = pe.auth_user_id
  where ac.event_id = p_event_id
    and ac.status in ('active','used')
    and ac.credential_type in ('member','member_rsvp')
    and coalesce(pr.is_internal, false) = false
    and coalesce(pe.banned, false) = false
    and coalesce(pe.is_banned, false) = false
    and coalesce(pe.metadata->>'duplicate_role', '') is distinct from 'archived'
    and coalesce(pr.banned, false) = false
    and coalesce(pr.is_banned, false) = false
    and pr.deleted_at is null;

  select count(*) into v_public_count
  from attendance_credentials ac
  join people pe on pe.id = ac.person_id
  left join profiles pr on pr.id = pe.auth_user_id
  where ac.event_id = p_event_id
    and ac.status in ('active','used')
    and ac.credential_type = 'public_rsvp'
    and coalesce(pe.banned, false) = false
    and coalesce(pe.is_banned, false) = false
    and coalesce(pe.metadata->>'duplicate_role', '') is distinct from 'archived'
    and coalesce(pr.banned, false) = false
    and coalesce(pr.is_banned, false) = false
    and pr.deleted_at is null;

  select count(*) into v_guest_count
  from attendance_credentials ac
  join people pe on pe.id = ac.person_id
  left join profiles pr on pr.id = pe.auth_user_id
  where ac.event_id = p_event_id
    and ac.status in ('active','used')
    and ac.credential_type = 'guest_pass'
    and coalesce(pe.banned, false) = false
    and coalesce(pe.is_banned, false) = false
    and coalesce(pe.metadata->>'duplicate_role', '') is distinct from 'archived'
    and coalesce(pr.banned, false) = false
    and coalesce(pr.is_banned, false) = false
    and pr.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', coalesce(pr.id, pe.id),
           'full_name', coalesce(pe.full_name, pr.full_name),
           'avatar_url', pr.avatar_url
         )), '[]'::jsonb)
  into v_attendees
  from (
    select ac.person_id, ac.created_at
    from attendance_credentials ac
    join people pe0 on pe0.id = ac.person_id
    left join profiles pr0 on pr0.id = pe0.auth_user_id
    where ac.event_id = p_event_id
      and ac.status in ('active','used')
      and ac.credential_type in ('member','member_rsvp')
      and coalesce(pr0.is_internal, false) = false
      and coalesce(pe0.banned, false) = false
      and coalesce(pe0.is_banned, false) = false
      and coalesce(pe0.metadata->>'duplicate_role', '') is distinct from 'archived'
      and coalesce(pr0.banned, false) = false
      and coalesce(pr0.is_banned, false) = false
      and pr0.deleted_at is null
    order by ac.created_at asc
    limit 8
  ) x
  join people pe on pe.id = x.person_id
  left join profiles pr on pr.id = pe.auth_user_id and pr.deleted_at is null;

  return jsonb_build_object(
    'member_count', v_member_count,
    'public_count', v_public_count,
    'guest_count', v_guest_count,
    'total_count', v_member_count + v_public_count,
    'attendees', v_attendees
  );
end;
$function$;

revoke all on function public.get_event_attendees(uuid) from public, anon;
grant execute on function public.get_event_attendees(uuid) to authenticated, service_role;


-- TRIPWIRE 2: RLS on, no anon grants, replacement landed.
do $$
declare
  v_rls boolean;
  v_anon_table int;
  v_anon_fn int;
  v_attendees text;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'blocked_emails';
  if v_rls is not true then
    raise exception 'TRIPWIRE 2: blocked_emails RLS is not enabled.';
  end if;

  select count(*) into v_anon_table
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'blocked_emails' and grantee = 'anon';
  if v_anon_table > 0 then
    raise exception 'TRIPWIRE 2: anon has grants on blocked_emails.';
  end if;

  select count(*) into v_anon_fn
  from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'is_email_blocked' and grantee = 'anon';
  if v_anon_fn > 0 then
    raise exception 'TRIPWIRE 2: anon can execute is_email_blocked.';
  end if;

  v_attendees := pg_get_functiondef('public.get_event_attendees(uuid)'::regprocedure);
  if position('duplicate_role' in v_attendees) = 0 then
    raise exception 'TRIPWIRE 2: get_event_attendees was not replaced.';
  end if;
end $$;

commit;
