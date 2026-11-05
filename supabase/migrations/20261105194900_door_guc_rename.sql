-- Rename invalid custom GUC 704.door_checkin to app.door_checkin.
-- Function bodies otherwise unchanged. Trigger binding unchanged.

do $$
declare
  v_apply text;
  v_guard text;
begin
  v_apply := pg_get_functiondef('public.door_apply_checkin(uuid, text, text[])'::regprocedure);
  v_guard := pg_get_functiondef('public.tm_door_checkin_guard()'::regprocedure);
  if position('704.door_checkin' in v_apply) = 0 then
    raise exception 'TRIPWIRE 1: public.door_apply_checkin does not contain 704.door_checkin.';
  end if;
  if position('704.door_checkin' in v_guard) = 0 then
    raise exception 'TRIPWIRE 1: public.tm_door_checkin_guard does not contain 704.door_checkin.';
  end if;
end $$;

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
    if current_setting('app.door_checkin', true) is distinct from 'on'
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

  perform set_config('app.door_checkin', 'on', true);

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

do $$
declare
  v_apply text;
  v_guard text;
begin
  v_apply := pg_get_functiondef('public.door_apply_checkin(uuid, text, text[])'::regprocedure);
  v_guard := pg_get_functiondef('public.tm_door_checkin_guard()'::regprocedure);
  if position('app.door_checkin' in v_apply) = 0 or position('704.door_checkin' in v_apply) > 0 then
    raise exception 'TRIPWIRE 2: public.door_apply_checkin GUC rename failed.';
  end if;
  if position('app.door_checkin' in v_guard) = 0 or position('704.door_checkin' in v_guard) > 0 then
    raise exception 'TRIPWIRE 2: public.tm_door_checkin_guard GUC rename failed.';
  end if;
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'attendance_credentials'
      and t.tgname = 'tm_door_checkin_guard'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'TRIPWIRE 2: trigger tm_door_checkin_guard missing or not enabled on attendance_credentials.';
  end if;
  if not has_function_privilege('authenticated', 'public.door_apply_checkin(uuid, text, text[])', 'execute') then
    raise exception 'TRIPWIRE 2: door_apply_checkin is not granted to authenticated.';
  end if;
end $$;
