-- ============================================================================
-- PROFILES GUARD TRIGGER + PERSON MIRROR
-- ============================================================================
-- cursor_report_membersettings.md §6 / cursor_report_profilewriters.md §5.
--
-- The RLS policy "Users can update own profile" is `auth.uid() = id` with no
-- column restriction, and `authenticated` holds table-level UPDATE, so a member
-- session could PATCH any column of its own row (role, subscription_status,
-- membership_override, email, ...). Middleware and every member-visibility
-- predicate key on those columns.
--
-- A. profiles_guard_columns: BEFORE UPDATE. Passes through for service role
--    (no auth.uid, or role service_role) and for admins (the SAME has_role
--    call the admin RLS policy uses: has_role(auth.uid(), 'admin'::app_role)).
--    For everyone else, any column that actually CHANGED and is not on the
--    member allowlist raises. Unchanged columns never trip it; columns added
--    later are blocked by default.
--
--    Allowlist = the exact member-browser write set inventoried in
--    cursor_report_profilewriters.md §5(1), minus the signup-upsert columns
--    (email / member_type / subscription_status), which E. below removes from
--    the browser path; those remain handle_new_user's job.
--
-- B. profiles_sync_person_scalars: AFTER UPDATE OF full_name, phone. Mirrors
--    the two member-editable identity scalars onto the linked people row
--    (people.auth_user_id = profiles.id), with phone_e164 normalised the same
--    way admin-manual-membership-override does. No person -> no-op; never
--    fails the member's save.
--
--    people has its own BEFORE UPDATE guard (enforce_people_member_column_guard)
--    that reverts phone_e164 and other protected columns whenever auth.uid()
--    is a non-admin. auth.uid() inside a SECURITY DEFINER function still reads
--    the caller's JWT, so a member-initiated mirror would be reverted. The
--    mirror is a system action: it clears request.jwt.claims / claim.sub for
--    its single people UPDATE (transaction-local set_config) and restores them
--    immediately after, so the surrounding statement's RLS is unaffected.
--
-- Born-private: triggers run as the function owner; no API role needs EXECUTE.
-- ============================================================================

-- ── A. guard ─────────────────────────────────────────────────────────────────
create or replace function public.profiles_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allow text[] := array[
    'full_name', 'phone', 'avatar_url', 'bio', 'updated_at',
    'notify_event_reminders', 'notify_new_events', 'notify_announcements',
    'last_seen_at', 'has_completed_onboarding_rsvp',
    'calendar_token', 'partner_types'
  ];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_bad text[] := '{}';
begin
  -- Service role and non-API (SQL editor, cron, triggers) callers pass.
  if v_uid is null or auth.role() = 'service_role' then
    return new;
  end if;

  -- Admins pass, using the identical call the admin RLS update policy uses.
  if has_role(v_uid, 'admin'::app_role) or has_role(v_uid, 'super_admin'::app_role) then
    return new;
  end if;

  -- Member session: collect every key whose value actually changed.
  for v_key in select jsonb_object_keys(v_new) loop
    if (v_new -> v_key) is distinct from (v_old -> v_key)
       and not (v_key = any (v_allow)) then
      v_bad := v_bad || v_key;
    end if;
  end loop;

  if array_length(v_bad, 1) > 0 then
    raise exception 'profiles_guard_columns: column(s) not editable by members: %',
      array_to_string(v_bad, ', ')
      using errcode = '42501', hint = 'Only profile, notification and calendar fields may be changed from a member session.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_columns on public.profiles;
create trigger trg_profiles_guard_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_columns();

-- ── B. person mirror ─────────────────────────────────────────────────────────
create or replace function public.profiles_sync_person_scalars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_e164 text;
  v_set_name boolean := new.full_name is distinct from old.full_name and coalesce(trim(new.full_name), '') <> '';
  v_set_phone boolean := new.phone is distinct from old.phone;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub    text := current_setting('request.jwt.claim.sub', true);
begin
  if not v_set_name and not v_set_phone then
    return new;
  end if;

  if v_set_phone then
    -- Same semantics as admin-manual-membership-override normalizeE164:
    -- digits only; 10 digits -> +1 prefix; 11 digits starting with 1 -> + prefix; else null.
    v_digits := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
    v_e164 := case
      when length(v_digits) = 10 then '+1' || v_digits
      when length(v_digits) = 11 and left(v_digits, 1) = '1' then '+' || v_digits
      else null
    end;
  end if;

  begin
    -- Run the mirror as a system caller so people's own column guard treats it
    -- like service role (auth.uid() is null). Restored right after.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    update public.people
       set full_name  = case when v_set_name  then new.full_name else full_name end,
           phone      = case when v_set_phone then new.phone     else phone     end,
           phone_e164 = case when v_set_phone then v_e164        else phone_e164 end,
           updated_at = now()
     where auth_user_id = new.id;
    -- zero rows matched -> nothing to mirror; that is fine.

    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    raise warning '[profiles_sync_person_scalars] % % (profile=%)', sqlstate, sqlerrm, new.id;
  end;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_person_scalars on public.profiles;
create trigger trg_profiles_sync_person_scalars
  after update of full_name, phone on public.profiles
  for each row execute function public.profiles_sync_person_scalars();

-- ── D. born-private ──────────────────────────────────────────────────────────
revoke all on function public.profiles_guard_columns()      from public, anon, authenticated;
revoke all on function public.profiles_sync_person_scalars() from public, anon, authenticated;
