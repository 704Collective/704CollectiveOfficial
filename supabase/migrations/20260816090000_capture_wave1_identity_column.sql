-- Capture-only. Wave 1 identity column, mirror trigger, guard update, and health view v2,
-- applied by hand to prod and develop Aug 13-14. Both environments already have all of it.
-- Idempotent by construction.


-- ============================================================
-- people.auth_user_id column
-- ============================================================

alter table public.people add column if not exists auth_user_id uuid;


-- ============================================================
-- FK to auth.users
-- prod: FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.people'::regclass
      and conname = 'people_auth_user_id_fkey'
  ) then
    alter table public.people
      add constraint people_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;


-- ============================================================
-- Partial unique index: one person per auth user, nulls unconstrained
-- ============================================================

create unique index if not exists people_auth_user_id_key
  on public.people using btree (auth_user_id)
  where (auth_user_id is not null);


-- ============================================================
-- Guard function, current prod body. Differs from the baseline copy by one line:
-- auth_user_id joins the reverted whitelist, so a member cannot repoint their own row.
-- ============================================================

create or replace function public.enforce_people_member_column_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  is_admin boolean;
BEGIN
  -- Service-role / backend writes have no auth.uid(): always allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins and super_admins: allow any change.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin','super_admin'])
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin authenticated caller: only a whitelist of columns may change.
  -- Every other column is forced back to its OLD value.
  NEW.id                       := OLD.id;
  NEW.auth_user_id              := OLD.auth_user_id;
  NEW.email_lower               := OLD.email_lower;
  NEW.phone_e164                := OLD.phone_e164;
  NEW.roles                     := OLD.roles;
  NEW.member_tier               := OLD.member_tier;
  NEW.member_status             := OLD.member_status;
  NEW.override_paying           := OLD.override_paying;
  NEW.stripe_customer_id        := OLD.stripe_customer_id;
  NEW.joined_at                 := OLD.joined_at;
  NEW.canceled_at               := OLD.canceled_at;
  NEW.referred_by_code          := OLD.referred_by_code;
  NEW.referred_by_person_id     := OLD.referred_by_person_id;
  NEW.member_brief              := OLD.member_brief;
  NEW.member_brief_generated_at := OLD.member_brief_generated_at;
  NEW.notes                     := OLD.notes;
  NEW.metadata                  := OLD.metadata;
  NEW.created_at                := OLD.created_at;

  RETURN NEW;
END;
$function$;


-- ============================================================
-- Mirror function. Bidirectional: whichever side of the bridge is written,
-- the other follows. Case A validates the pointer against auth.users and
-- leaves the column null when it is dead or malformed.
-- ============================================================

create or replace function public.sync_people_auth_user_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  mp_old text;
  mp_new text;
  candidate uuid;
BEGIN
  mp_new := NEW.metadata->>'profile_id';
  IF tg_op = 'UPDATE' THEN
    mp_old := OLD.metadata->>'profile_id';
  ELSE
    mp_old := NULL;
  END IF;

  -- Case A: the sticky note changed (today's writers). Column follows.
  IF (tg_op = 'INSERT' AND mp_new IS NOT NULL AND NEW.auth_user_id IS NULL)
     OR (tg_op = 'UPDATE' AND mp_new IS DISTINCT FROM mp_old
         AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id) THEN
    IF mp_new IS NULL THEN
      NEW.auth_user_id := NULL;
    ELSE
      BEGIN
        candidate := mp_new::uuid;
      EXCEPTION WHEN others THEN
        candidate := NULL;
      END;
      IF candidate IS NOT NULL
         AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = candidate) THEN
        NEW.auth_user_id := candidate;
      ELSE
        -- Dead or malformed pointer: stay null, same semantics as today, health view catches it
        NEW.auth_user_id := NULL;
      END IF;
    END IF;

  -- Case B: the real column was written (backfill now, native writers later). Sticky note follows.
  ELSIF (tg_op = 'INSERT' AND NEW.auth_user_id IS NOT NULL
         AND (mp_new IS NULL OR mp_new IS DISTINCT FROM NEW.auth_user_id::text))
     OR (tg_op = 'UPDATE' AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    IF NEW.auth_user_id IS NULL THEN
      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'profile_id';
    ELSE
      NEW.metadata := jsonb_set(coalesce(NEW.metadata, '{}'::jsonb),
                                '{profile_id}', to_jsonb(NEW.auth_user_id::text), true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================================
-- Mirror trigger. BEFORE INSERT OR UPDATE, and it must keep firing after
-- trg_people_member_column_guard, which it does by name order.
-- ============================================================

drop trigger if exists trg_people_sync_auth_user_id on public.people;
create trigger trg_people_sync_auth_user_id
  before insert or update on public.people
  for each row execute function public.sync_people_auth_user_id();


-- ============================================================
-- identity_bridge_health v2: the original five counters plus three that
-- watch the new column against the old sticky note.
-- ============================================================

create or replace view public.identity_bridge_health as
 WITH member_profiles AS (
         SELECT p.id,
            p.email,
            p.full_name,
            p.subscription_status,
            p.membership_override
           FROM profiles p
          WHERE p.deleted_at IS NULL AND ((p.subscription_status = ANY (ARRAY['active'::text, 'trialing'::text])) OR p.membership_override = true) AND p.email !~~ '%@704collective.com'::text
        )
 SELECT ( SELECT count(*) AS count
           FROM member_profiles) AS member_profiles_total,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text))) AS bridged_ok,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text))) AS members_missing_people_row,
    ( SELECT count(*) AS count
           FROM people pe
          WHERE (pe.metadata ->> 'profile_id'::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM profiles p
                  WHERE p.id::text = (pe.metadata ->> 'profile_id'::text)))) AS people_pointing_at_dead_profile,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text)) AND (EXISTS ( SELECT 1
                   FROM people pe2
                  WHERE pe2.email_lower = lower(mp.email)))) AS members_with_unbridged_people_row_by_email,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE pe.auth_user_id = mp.id))) AS members_bridged_by_auth_column,
    ( SELECT count(*) AS count
           FROM people pe
          WHERE pe.auth_user_id IS NOT NULL AND (pe.metadata ->> 'profile_id'::text) IS DISTINCT FROM pe.auth_user_id::text) AS people_column_metadata_mismatch,
    ( SELECT count(*) AS count
           FROM people pe
          WHERE (pe.metadata ->> 'profile_id'::text) IS NOT NULL AND pe.auth_user_id IS NULL AND (EXISTS ( SELECT 1
                   FROM auth.users u
                  WHERE u.id::text = (pe.metadata ->> 'profile_id'::text)))) AS people_backfill_gap;
