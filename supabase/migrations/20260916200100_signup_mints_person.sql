-- Identity Wave A — signup mints a person.
--
-- Finding (cursor_report_identitystatus.md §4): handle_new_user() creates a
-- profiles row on signup and nothing else. A people row only appears later,
-- when a resolver-adopting path runs (first payment, RSVP, intake). Every new
-- account is therefore born unbridged; 8 live production accounts created
-- since 2026-08-24 have no person.
--
-- Fix: a companion AFTER INSERT trigger on auth.users, deliberately separate
-- from handle_new_user so the profile insert that every login depends on is
-- never at risk from this code. It follows _shared/resolvePerson.ts exactly:
--
--   locate  1. people.auth_user_id = new user   -> already bridged, nothing to do
--           2. people.email_lower = new email    -> HEAL: adopt the row (set
--              auth_user_id; the mirror trigger trg_people_sync_auth_user_id
--              writes metadata.profile_id). Roles are left alone: a guest who
--              signs up keeps their guest history; promotion to member is the
--              webhook's job, exactly as in the resolver.
--           3. nothing                           -> MINT: roles ['prospect'],
--              metadata {source, profile_id}, name/phone from signup metadata.
--
-- Invariants honoured: email_lower is GENERATED — never written. roles is
-- merged, never clobbered. Any error is a WARNING, never a failed signup.
-- Trigger names on the same table fire alphabetically, so this runs after
-- on_auth_user_created (the profile insert), though it does not depend on it.
--
-- Why the database layer: it is the only place every account-creation path
-- passes through — the join form, /signup, /partners/signup, admin-create-user,
-- comp-invite, import-members, OAuth and magic-link first sign-in. An app-side
-- call after signUp() would cover two of those.

create or replace function public.handle_new_user_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text;
  v_name     text;
  v_phone    text;
  v_person   uuid;
begin
  v_email := lower(trim(coalesce(new.email, '')));
  if v_email = '' then
    return new;  -- phone-only or anonymous auth: no email, nothing to key on
  end if;

  -- 1. Already bridged (replay / re-fire safety).
  if exists (select 1 from public.people where auth_user_id = new.id) then
    return new;
  end if;

  v_name  := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');

  -- 2. HEAL: a person with this email already exists (guest, prospect, Exchange
  --    registrant). Adopt it. Only an unclaimed row is adoptable; a row bound to a
  --    different auth user is left alone and logged (cannot happen while auth
  --    emails are unique, but never silently steal a row).
  update public.people
     set auth_user_id = new.id,
         full_name    = coalesce(full_name, v_name),
         phone        = coalesce(phone, v_phone)
   where email_lower = v_email
     and auth_user_id is null
  returning id into v_person;

  if v_person is not null then
    return new;
  end if;

  if exists (select 1 from public.people where email_lower = v_email) then
    raise warning '[signup_mints_person] LOUD: people row for this email is bound to another auth user; not healed. auth_user_id=%', new.id;
    return new;
  end if;

  -- 3. MINT.
  insert into public.people (email, full_name, phone, roles, auth_user_id, metadata)
  values (
    v_email,
    coalesce(v_name, split_part(v_email, '@', 1)),
    v_phone,
    array['prospect'],
    new.id,
    jsonb_build_object('source', 'signup_trigger', 'profile_id', new.id::text)
  );

  return new;

exception
  when unique_violation then
    -- A concurrent writer minted first (people_email_lower_unique or
    -- people_auth_user_id_key). Their row wins; adopt it if it is unclaimed.
    update public.people
       set auth_user_id = new.id
     where email_lower = v_email
       and auth_user_id is null;
    return new;
  when others then
    raise warning '[signup_mints_person] % % (auth_user_id=%)', sqlstate, sqlerrm, new.id;
    return new;
end;
$$;

revoke all on function public.handle_new_user_person() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_person on auth.users;
create trigger on_auth_user_created_person
  after insert on auth.users
  for each row execute function public.handle_new_user_person();

comment on function public.handle_new_user_person() is
  'Wave A: every new auth user gets a linked people row (heal by email_lower, else mint roles [prospect]). Companion to handle_new_user; never fails the signup.';
