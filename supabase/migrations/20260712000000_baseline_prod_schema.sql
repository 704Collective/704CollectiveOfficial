-- ============================================================
-- BASELINE MIGRATION — squash-to-baseline, 2026-07-12
-- Source: supabase db dump --linked against production project
--   bnmtynevbuplqpuqvmna (PostgreSQL 17.6), captured 2026-07-12.
--   Verified object-for-object vs live: 126 tables, 47 app
--   functions, 30 triggers, RLS universal.
-- Replaces the 26 legacy migrations now in supabase/migrations_archive/
--   (kept for history; the CLI only reads supabase/migrations/).
-- The remote schema_migrations logbook is reset to this single
--   version (20260712000000) as part of the same change set.
-- NOTE: storage bucket config, cron.job rows, and Vault secrets are
--   environment state, not schema — provisioned separately (Stage 4).
-- NEVER run supabase db push or supabase db reset --linked
--   against production.
-- ============================================================



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'member',
    'super_admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_waitlist_position"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_max_position INTEGER;
BEGIN
  -- Lock the events row to prevent two simultaneous waitlist joins from racing
  PERFORM 1 FROM events WHERE id = NEW.event_id FOR UPDATE;

  -- Find the highest existing position for this event
  SELECT COALESCE(MAX(position), 0) INTO v_max_position
  FROM event_waitlist
  WHERE event_id = NEW.event_id;

  -- Always assign the next position, regardless of what client sent
  NEW.position := v_max_position + 1;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_waitlist_position"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_admin_conversation_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.admin_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_admin_conversation_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_event_discussion"("p_event_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles pr
    WHERE pr.id = auth.uid()
      AND pr.deleted_at IS NULL
      AND (
        pr.role IN ('admin','super_admin')
        OR (
          pr.member_type IN ('social','business')
          AND (
            pr.subscription_status IN ('active','paused')
            OR (pr.subscription_status = 'canceled' AND pr.subscription_ends_at > now())
            OR pr.membership_override = true
          )
          AND EXISTS (
            SELECT 1
            FROM attendance_credentials ac
            JOIN people pe ON pe.id = ac.person_id
            WHERE ac.event_id = p_event_id
              AND ac.status IN ('active','used')
              AND ac.credential_type IN ('member','member_rsvp')
              AND pe.metadata->>'profile_id' = pr.id::text   -- APP's real bridge (was: pe.email_lower = lower(pr.email))
          )
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_view_event_discussion"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_event_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  event_capacity INTEGER;
  current_count INTEGER;
BEGIN
  SELECT capacity INTO event_capacity FROM public.events WHERE id = NEW.event_id;
  IF event_capacity IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO current_count
  FROM public.tickets WHERE event_id = NEW.event_id AND status = 'confirmed';
  IF current_count >= event_capacity THEN
    RAISE EXCEPTION 'Event is at capacity' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_event_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_event_capacity_public_rsvps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_public_count INTEGER;
BEGIN
  IF NEW.status != 'rsvp' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity
  FROM events
  WHERE id = NEW.event_id
  FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM tickets
  WHERE event_id = NEW.event_id
    AND status NOT IN ('cancelled', 'waitlist');

  SELECT COUNT(*) INTO v_public_count
  FROM event_public_rsvps
  WHERE event_id = NEW.event_id
    AND status = 'rsvp'
    AND (TG_OP = 'INSERT' OR id != NEW.id);

  IF (v_current_count + v_public_count + 1) > v_capacity THEN
    RAISE EXCEPTION 'Event is at capacity'
      USING ERRCODE = 'P0001',
            HINT = format('Event has %s/%s spots filled', v_current_count + v_public_count, v_capacity);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_event_capacity_public_rsvps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_event_capacity_tickets"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_public_count INTEGER;
  v_event_start TIMESTAMPTZ;
BEGIN
  -- Skip if status not changing (e.g., backfill of unrelated columns)
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Skip capacity check for cancelled/waitlist (these don't take a spot)
  IF NEW.status IN ('cancelled', 'waitlist') THEN
    RETURN NEW;
  END IF;

  -- Lock the event row to prevent race conditions, also fetch start_time
  SELECT capacity, start_time INTO v_capacity, v_event_start
  FROM events
  WHERE id = NEW.event_id
  FOR UPDATE;

  -- If no capacity set, allow unlimited
  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip past events (anything before now); historical overbooks shouldn't block writes
  IF v_event_start < NOW() THEN
    RETURN NEW;
  END IF;

  -- Count existing confirmed tickets (excluding this row if UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM tickets
  WHERE event_id = NEW.event_id
    AND status NOT IN ('cancelled', 'waitlist')
    AND (TG_OP = 'INSERT' OR id != NEW.id);

  -- Count existing public RSVPs
  SELECT COUNT(*) INTO v_public_count
  FROM event_public_rsvps
  WHERE event_id = NEW.event_id
    AND status = 'rsvp';

  -- Block if total would exceed capacity
  IF (v_current_count + v_public_count + 1) > v_capacity THEN
    RAISE EXCEPTION 'Event is at capacity'
      USING ERRCODE = 'P0001',
            HINT = format('Event has %s/%s spots filled', v_current_count + v_public_count, v_capacity);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_event_capacity_tickets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_event_capacity_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  event_capacity int;
  current_count int;
BEGIN
  SELECT capacity INTO event_capacity
  FROM events
  WHERE id = NEW.event_id
  FOR UPDATE;

  SELECT COUNT(*) INTO current_count
  FROM tickets
  WHERE event_id = NEW.event_id;

  IF event_capacity IS NOT NULL AND current_count >= event_capacity THEN
    RAISE EXCEPTION 'Event is at full capacity';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_event_capacity_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_event_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_capacity int;
  v_count int;
BEGIN
  -- Only guard transitions INTO a countable state
  IF NEW.status NOT IN ('active','used') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active','used') THEN
    RETURN NEW; -- already counted (e.g. check-in active->used)
  END IF;

  -- Lock the event row: serializes concurrent inserts for this event (kills the race)
  SELECT capacity INTO v_capacity FROM events WHERE id = NEW.event_id FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN NEW; -- no cap
  END IF;

  SELECT count(*) INTO v_count
  FROM attendance_credentials
  WHERE event_id = NEW.event_id AND status IN ('active','used');

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'EVENT_AT_CAPACITY' USING ERRCODE = 'P0001', HINT = 'Event is at capacity';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_event_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_people_member_column_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."enforce_people_member_column_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ambassador_by_code"("p_code" "text") RETURNS TABLE("id" "uuid", "full_name" "text", "is_active" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.full_name, a.is_active
  FROM public.ambassadors a
  WHERE LOWER(a.referral_code) = LOWER(p_code)
    AND a.is_active = true
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_ambassador_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ambassador_leaderboard"() RETURNS TABLE("id" "uuid", "full_name" "text", "referral_code" "text", "total_referrals" bigint, "total_earned_cents" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.full_name, a.referral_code,
    COUNT(r.id) FILTER (WHERE r.status IN ('approved','auto_approved') OR r.paid_out_at IS NOT NULL) AS total_referrals,
    COALESCE(SUM(r.reward_cents) FILTER (WHERE r.paid_out_at IS NOT NULL), 0) AS total_earned_cents
  FROM public.ambassadors a
  LEFT JOIN public.ambassador_referrals r ON r.ambassador_id = a.id
  WHERE a.is_active = true
  GROUP BY a.id, a.full_name, a.referral_code
  ORDER BY total_referrals DESC, total_earned_cents DESC LIMIT 25;
END;
$$;


ALTER FUNCTION "public"."get_ambassador_leaderboard"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."business_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "public_id" "text" NOT NULL,
    "full_name" "text",
    "title" "text",
    "company" "text",
    "phone" "text",
    "email" "text",
    "linkedin_url" "text",
    "website_url" "text",
    "avatar_url" "text",
    "custom_fields" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."business_cards" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_business_card_public"("pid" "text") RETURNS SETOF "public"."business_cards"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.business_cards WHERE public_id = pid LIMIT 1;
$$;


ALTER FUNCTION "public"."get_business_card_public"("pid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_community_stats"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT json_build_object(
    'total_members',
      COUNT(*) FILTER (
        WHERE subscription_status IN ('active', 'trialing')
           OR membership_override = true
      ),
    'total_events',
      (SELECT COUNT(*) FROM events WHERE is_published = true),
    'total_rsvps',
      (SELECT COUNT(*) FROM tickets WHERE status = 'confirmed')
  )
  FROM profiles
  WHERE deleted_at IS NULL;
$$;


ALTER FUNCTION "public"."get_community_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_attendance_count"("p_event_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Require authentication. Anonymous users get 0, which lets the page render
  -- "Open" without exposing real attendance numbers.
  -- The page-side guard also short-circuits the call when signed-out.
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  
  SELECT COUNT(*)::integer INTO v_count
  FROM attendance_credentials
  WHERE event_id = p_event_id
    AND status IN ('active', 'used');
  
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."get_event_attendance_count"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_attendance_counts"("p_event_ids" "uuid"[]) RETURNS TABLE("event_id" "uuid", "count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ac.event_id, COUNT(*)::bigint
  FROM attendance_credentials ac
  WHERE ac.event_id = ANY(p_event_ids)
    AND ac.status IN ('active', 'used')
  GROUP BY ac.event_id;
$$;


ALTER FUNCTION "public"."get_event_attendance_counts"("p_event_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_attendees"("p_event_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_id uuid; v_caller_active boolean;
  v_member_count bigint; v_public_count bigint; v_guest_count bigint; v_attendees jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND deleted_at IS NULL
      AND (role IN ('admin','super_admin')
        OR (member_type IN ('social','business')
            AND (subscription_status IN ('active','paused')
              OR (subscription_status = 'canceled' AND subscription_ends_at > NOW())
              OR membership_override = true)))
  ) INTO v_caller_active;
  IF NOT v_caller_active THEN RAISE EXCEPTION 'Not authorized to view attendees'; END IF;

  SELECT COUNT(*) INTO v_member_count FROM attendance_credentials
  WHERE event_id = p_event_id AND status IN ('active','used') AND credential_type IN ('member','member_rsvp');
  SELECT COUNT(*) INTO v_public_count FROM attendance_credentials
  WHERE event_id = p_event_id AND status IN ('active','used') AND credential_type = 'public_rsvp';
  SELECT COUNT(*) INTO v_guest_count FROM attendance_credentials
  WHERE event_id = p_event_id AND status IN ('active','used') AND credential_type = 'guest_pass';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', COALESCE(pr.id, pe.id), 'full_name', COALESCE(pe.full_name, pr.full_name), 'avatar_url', pr.avatar_url)), '[]'::jsonb)
  INTO v_attendees
  FROM (
    SELECT ac.person_id, ac.created_at FROM attendance_credentials ac
    WHERE ac.event_id = p_event_id AND ac.status IN ('active','used')
      AND ac.credential_type IN ('member','member_rsvp')
    ORDER BY ac.created_at ASC LIMIT 8
  ) x
  JOIN people pe ON pe.id = x.person_id
  LEFT JOIN profiles pr ON lower(pr.email) = pe.email_lower AND pr.deleted_at IS NULL;

  RETURN jsonb_build_object('member_count', v_member_count, 'public_count', v_public_count,
    'guest_count', v_guest_count, 'total_count', v_member_count + v_public_count, 'attendees', v_attendees);
END; $$;


ALTER FUNCTION "public"."get_event_attendees"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_discussion_mentionable_ids"("p_event_id" "uuid") RETURNS TABLE("id" "uuid", "full_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT pr.id, pr.full_name
  FROM profiles pr
  WHERE pr.deleted_at IS NULL
    AND pr.full_name IS NOT NULL
    AND (
      pr.role IN ('admin','super_admin')
      OR (pr.member_type IN ('social','business')
          AND (pr.subscription_status IN ('active','paused')
               OR (pr.subscription_status = 'canceled' AND pr.subscription_ends_at > now())
               OR pr.membership_override = true))
    )
    AND EXISTS (
      SELECT 1 FROM attendance_credentials ac
      JOIN people pe ON pe.id = ac.person_id
      WHERE ac.event_id = p_event_id
        AND ac.status IN ('active','used')
        AND ac.credential_type IN ('member','member_rsvp')
        AND pe.metadata->>'profile_id' = pr.id::text
    );
$$;


ALTER FUNCTION "public"."get_event_discussion_mentionable_ids"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_member_counts"() RETURNS TABLE("active_members" bigint, "paying_members" bigint, "coupon_comped" bigint, "override_comped" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  ) then
    raise exception 'forbidden: admin required';
  end if;

  return query
  with am as (
    select p.id
    from public.profiles p
    where p.deleted_at is null
      and p.subscription_status = 'active'
      and p.email not like '%@704collective.com'
  ),
  classified as (
    select
      am.id,
      (select lc.amount
         from public.payments lc
        where lc.user_id = am.id and lc.status = 'succeeded'
        order by lc.created_at desc
        limit 1) as latest_amount
    from am
  )
  select
    count(*)::bigint                                        as active_members,
    (count(*) filter (where latest_amount > 0))::bigint     as paying_members,
    (count(*) filter (where latest_amount = 0))::bigint     as coupon_comped,
    (count(*) filter (where latest_amount is null))::bigint as override_comped
  from classified;
end;
$$;


ALTER FUNCTION "public"."get_member_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_ambassador_leaderboard"() RETURNS TABLE("ambassador_id" "uuid", "full_name" "text", "referral_code" "text", "monthly_conversions" bigint, "rank" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH start_of_month AS (
    SELECT date_trunc('month', timezone('UTC', now())) AS d
  ),
  monthly_counts AS (
    SELECT
      a.id AS ambassador_id,
      a.full_name,
      a.referral_code,
      COUNT(r.id)::bigint AS monthly_conversions
    FROM public.ambassadors a
    LEFT JOIN public.ambassador_referrals r
      ON r.ambassador_id = a.id
      AND r.status IN ('approved', 'auto_approved', 'converted', 'paid_out')
      AND r.converted_at >= (SELECT d FROM start_of_month)
    WHERE a.is_active = true
    GROUP BY a.id, a.full_name, a.referral_code
    HAVING COUNT(r.id) > 0
  )
  SELECT
    ambassador_id,
    full_name,
    referral_code,
    monthly_conversions,
    ROW_NUMBER() OVER (ORDER BY monthly_conversions DESC, full_name ASC) AS rank
  FROM monthly_counts
  ORDER BY monthly_conversions DESC, full_name ASC
  LIMIT 5;
$$;


ALTER FUNCTION "public"."get_monthly_ambassador_leaderboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_events"() RETURNS SETOF "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'id', ac.id, 'event_id', ac.event_id, 'status', 'confirmed', 'checked_in_at', ac.checked_in_at,
    'events', jsonb_build_object('id', e.id, 'title', e.title, 'start_time', e.start_time,
      'end_time', e.end_time, 'location_name', e.location_name, 'image_url', e.image_url))
  FROM attendance_credentials ac
  JOIN events e ON e.id = ac.event_id
  JOIN people pe ON pe.id = ac.person_id
  JOIN profiles p ON lower(p.email) = pe.email_lower
  WHERE p.id = auth.uid() AND ac.status IN ('active','used')
    AND ac.credential_type IN ('member','member_rsvp')
  ORDER BY e.start_time ASC;
$$;


ALTER FUNCTION "public"."get_my_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ticket_counts"("event_ids" "uuid"[]) RETURNS TABLE("event_id" "uuid", "count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ac.event_id, COUNT(*)::bigint
  FROM attendance_credentials ac
  WHERE ac.event_id = ANY(event_ids) AND ac.status IN ('active','used')
  GROUP BY ac.event_id;
$$;


ALTER FUNCTION "public"."get_ticket_counts"("event_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, member_type)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'member_type', 'social_non_member')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("user_uuid" "uuid", "role_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS(SELECT 1 FROM user_roles  WHERE user_id = user_uuid AND role::text = role_name)
    OR
    EXISTS(SELECT 1 FROM profiles    WHERE id      = user_uuid AND role::text = role_name);
$$;


ALTER FUNCTION "public"."has_role"("user_uuid" "uuid", "role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_user_id
      AND deleted_at IS NULL
      AND (
        subscription_status = 'active'
        OR subscription_status = 'trialing'
        OR membership_override = true
      )
  );
$$;


ALTER FUNCTION "public"."is_active_member"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_user"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = _user_id AND deleted_at IS NULL
  );
$$;


ALTER FUNCTION "public"."is_active_user"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_conversation_participants acp
    WHERE acp.conversation_id = p_conversation_id
      AND acp.user_id = (SELECT auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_event_discussion_moderator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND deleted_at IS NULL AND role IN ('admin','super_admin')
  );
$$;


ALTER FUNCTION "public"."is_event_discussion_moderator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hub_members
    WHERE hub_id = p_hub_id
      AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_event_discussion_mentionables"("p_event_id" "uuid", "p_query" "text") RETURNS TABLE("id" "uuid", "full_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT pr.id, pr.full_name, pr.avatar_url
  FROM profiles pr
  WHERE public.can_view_event_discussion(p_event_id)      -- gate the CALLER
    AND pr.deleted_at IS NULL
    AND pr.full_name IS NOT NULL
    AND pr.full_name ILIKE '%' || COALESCE(p_query, '') || '%'
    -- LISTED person must be an active member (or admin) ...
    AND (
      pr.role IN ('admin','super_admin')
      OR (
        pr.member_type IN ('social','business')
        AND (
          pr.subscription_status IN ('active','paused')
          OR (pr.subscription_status = 'canceled' AND pr.subscription_ends_at > now())
          OR pr.membership_override = true
        )
      )
    )
    -- ... AND actually RSVP'd to THIS event:
    AND EXISTS (
      SELECT 1
      FROM attendance_credentials ac
      JOIN people pe ON pe.id = ac.person_id
      WHERE ac.event_id = p_event_id
        AND ac.status IN ('active','used')
        AND ac.credential_type IN ('member','member_rsvp')
        AND pe.metadata->>'profile_id' = pr.id::text
    )
  ORDER BY pr.full_name
  LIMIT 6;
$$;


ALTER FUNCTION "public"."search_event_discussion_mentionables"("p_event_id" "uuid", "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_hub_path_valid"("path" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$_$;


ALTER FUNCTION "public"."storage_hub_path_valid"("path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."storage_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_is_hub_member_for_path"("path" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hub_members hm
    WHERE hm.user_id = auth.uid()
      AND hm.hub_id::text = split_part(path, '/', 1)
  );
$$;


ALTER FUNCTION "public"."storage_is_hub_member_for_path"("path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_is_portal_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND (
        p.role IN ('admin', 'super_admin')
        OR p.subscription_status IN ('active', 'trialing')
        OR p.membership_override = true
      )
  );
$$;


ALTER FUNCTION "public"."storage_is_portal_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_application_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET application_status = NEW.status
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_application_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_blog_posts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_blog_posts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_social_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_social_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ambassadors_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ambassadors_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contact_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contact_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_event_public_rsvps_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_event_public_rsvps_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_org_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_person_last_attended"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.checked_in_at IS NOT NULL AND
     (OLD.checked_in_at IS NULL OR NEW.checked_in_at > OLD.checked_in_at) THEN
    UPDATE people
    SET last_attended = NEW.checked_in_at
    WHERE id = NEW.person_id
      AND (last_attended IS NULL OR last_attended < NEW.checked_in_at);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_person_last_attended"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_last_attended_from_public_rsvp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  IF NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.checked_in_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the linked profile via contacts.converted_to_member_id
  SELECT converted_to_member_id INTO v_profile_id
  FROM public.contacts
  WHERE id = NEW.contact_id;

  IF v_profile_id IS NULL THEN
    -- Public RSVP not linked to a member, no-op
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET last_attended_at = GREATEST(
    COALESCE(last_attended_at, '1970-01-01'::timestamptz),
    NEW.checked_in_at
  )
  WHERE id = v_profile_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profile_last_attended_from_public_rsvp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_last_attended_from_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only fire when checked_in_at transitions from NULL to a value, OR is set on INSERT
  IF NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.checked_in_at IS NOT NULL THEN
    -- Already had a check-in time, don't double-fire
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    -- Guest ticket with no profile, no-op
    RETURN NEW;
  END IF;

  -- Use GREATEST so out-of-order writes don't regress the value
  UPDATE public.profiles
  SET last_attended_at = GREATEST(
    COALESCE(last_attended_at, '1970-01-01'::timestamptz),
    NEW.checked_in_at
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profile_last_attended_from_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_auth_backup_20260428" (
    "backup_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "email" "text",
    "old_encrypted_password" "text",
    "old_raw_app_meta_data" "jsonb",
    "old_identities" "jsonb"
);


ALTER TABLE "public"."_auth_backup_20260428" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_auth_identities_backup_20260428" (
    "provider_id" "text",
    "user_id" "uuid",
    "identity_data" "jsonb",
    "provider" "text",
    "last_sign_in_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "email" "text",
    "id" "uuid"
);


ALTER TABLE "public"."_auth_identities_backup_20260428" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_conversation_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "created_by" "uuid" NOT NULL,
    "partner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_conversations_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'group'::"text", 'partner_inquiry'::"text"])))
);


ALTER TABLE "public"."admin_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "image_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "file_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "file_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_edited" boolean DEFAULT false NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."admin_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "user_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "admin_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."admin_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint,
    "file_type" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text",
    "due_date" timestamp with time zone,
    "assigned_to" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."admin_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "agent_slug" "text" NOT NULL,
    "memory_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "weight" double precision DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."agent_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambassador_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "stripe_transfer_id" "text",
    "stripe_payout_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    CONSTRAINT "ambassador_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'paid'::"text", 'failed'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."ambassador_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambassador_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "referred_profile_id" "uuid",
    "referred_email" "text" NOT NULL,
    "referred_full_name" "text",
    "tier" "text" NOT NULL,
    "reward_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "signup_ip" "text",
    "signup_user_agent" "text",
    "payment_method_fingerprint" "text",
    "abuse_flags" "jsonb" DEFAULT '{}'::"jsonb",
    "stripe_subscription_id" "text",
    "stripe_transfer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "paid_at" timestamp with time zone,
    "denied_at" timestamp with time zone,
    "denied_reason" "text",
    "referral_code" "text",
    "stripe_session_id" "text",
    "referred_at" timestamp with time zone,
    "first_payment_at" timestamp with time zone,
    "payout_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_sent_at" timestamp with time zone,
    "payout_notes" "text",
    "commission_earned_at" timestamp with time zone,
    "referred_person_id" "uuid",
    "ambassador_person_id" "uuid",
    CONSTRAINT "ambassador_referrals_payout_status_check" CHECK (("payout_status" = ANY (ARRAY['pending'::"text", 'owed'::"text", 'sent'::"text"]))),
    CONSTRAINT "ambassador_referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'signed_up'::"text", 'converted'::"text", 'churned'::"text", 'approved'::"text", 'denied'::"text", 'paid'::"text", 'flagged_self_refer'::"text"]))),
    CONSTRAINT "ambassador_referrals_tier_check" CHECK (("tier" = ANY (ARRAY['social'::"text", 'business'::"text"])))
);


ALTER TABLE "public"."ambassador_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambassadors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "referral_code" "text" NOT NULL,
    "stripe_account_id" "text",
    "stripe_account_status" "text" DEFAULT 'pending'::"text",
    "stripe_onboarding_completed_at" timestamp with time zone,
    "social_reward_cents" integer DEFAULT 2000 NOT NULL,
    "business_reward_cents" integer DEFAULT 12500 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "approved_social_referrals_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'locator'::"text" NOT NULL,
    "profile_id" "uuid",
    CONSTRAINT "ambassadors_type_check" CHECK (("type" = ANY (ARRAY['locator'::"text", 'member'::"text", 'partner'::"text"])))
);


ALTER TABLE "public"."ambassadors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apple_wallet_passes" (
    "serial_number" "text" NOT NULL,
    "auth_token" "text" NOT NULL,
    "person_id" "uuid",
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apple_wallet_passes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apple_wallet_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_id" "text" NOT NULL,
    "serial_number" "text" NOT NULL,
    "push_token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."apple_wallet_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "phone" "text",
    "website" "text",
    "partner_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "credential_type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "used_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "expires_at" timestamp with time zone,
    "issued_by_person_id" "uuid",
    "apple_pass_serial" "text",
    "google_pass_object_id" "text",
    "wallet_status" "text" DEFAULT 'not_issued'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_ambassador_referrals_presweep" (
    "id" "uuid",
    "ambassador_id" "uuid",
    "referred_user_id" "uuid",
    "referred_email" "text",
    "referred_full_name" "text",
    "tier" "text",
    "reward_cents" integer,
    "status" "text",
    "signup_ip" "text",
    "signup_user_agent" "text",
    "payment_method_fingerprint" "text",
    "abuse_flags" "jsonb",
    "stripe_subscription_id" "text",
    "stripe_transfer_id" "text",
    "created_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "paid_out_at" timestamp with time zone,
    "denied_at" timestamp with time zone,
    "denied_reason" "text",
    "referral_code" "text",
    "stripe_session_id" "text",
    "signed_up_at" timestamp with time zone,
    "converted_at" timestamp with time zone,
    "payout_status" "text",
    "payout_sent_at" timestamp with time zone,
    "payout_notes" "text"
);


ALTER TABLE "public"."backup_ambassador_referrals_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_attendance_credentials_20260610" (
    "id" "uuid",
    "token" "text",
    "person_id" "uuid",
    "event_id" "uuid",
    "credential_type" "text",
    "status" "text",
    "used_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "expires_at" timestamp with time zone,
    "issued_by_person_id" "uuid",
    "apple_pass_serial" "text",
    "google_pass_object_id" "text",
    "wallet_status" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_attendance_credentials_20260610" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_business_applications_presweep" (
    "id" "uuid",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "company" "text",
    "title" "text",
    "linkedin_url" "text",
    "website" "text",
    "referral_source" "text",
    "why_join" "text",
    "what_bring" "text",
    "goals" "text",
    "industry" "text",
    "years_in_charlotte" integer,
    "billing_plan" "text",
    "status" "text",
    "admin_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_setup_intent_id" "text",
    "stripe_payment_method_id" "text",
    "card_saved" boolean,
    "profile_id" "uuid",
    "confirmation_sent_at" timestamp with time zone,
    "decision_email_sent_at" timestamp with time zone,
    "conflict_lesson" "text",
    "missing_in_charlotte" "text",
    "one_year_goal" "text",
    "right_intro" "text",
    "recent_wins" "text",
    "referral_code" "text",
    "ambassador_id" "uuid",
    "anything_else" "text",
    "stripe_subscription_id" "text",
    "approved_at" timestamp with time zone
);


ALTER TABLE "public"."backup_business_applications_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_contacts_presweep" (
    "id" "uuid",
    "email" "text",
    "full_name" "text",
    "phone" "text",
    "company" "text",
    "source" "text",
    "source_detail" "text",
    "status" "text",
    "contact_type" "text",
    "unsubscribed_at" timestamp with time zone,
    "unsubscribed_reason" "text",
    "lead_score" integer,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "first_seen_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "converted_to_member_id" "uuid",
    "converted_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "unsubscribed" boolean,
    "social_handles" "jsonb",
    "sms_consent" boolean,
    "sms_consent_at" timestamp with time zone
);


ALTER TABLE "public"."backup_contacts_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_event_public_rsvps_presweep" (
    "id" "uuid",
    "event_id" "uuid",
    "contact_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "sms_consent" boolean,
    "status" "text",
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_event_public_rsvps_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_events_stale_booleans_20260610" (
    "id" "uuid",
    "title" "text",
    "description" "text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "location_name" "text",
    "location_address" "text",
    "image_url" "text",
    "capacity" integer,
    "is_members_only_deprecated" boolean,
    "ticket_price_deprecated" integer,
    "category" "text",
    "recurrence_rule" "text",
    "recurrence_end_date" "date",
    "parent_event_id" "uuid",
    "occurrence_index" integer,
    "tags" "text"[],
    "allows_guest_passes" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "is_business_only_deprecated" boolean,
    "eventbrite_event_id" "text",
    "eventbrite_published" boolean,
    "eventbrite_url" "text",
    "price_deprecated" numeric(10,2),
    "max_attendees_deprecated" integer,
    "is_published" boolean,
    "open_for_venue_partner" boolean,
    "open_for_sponsor_inquiry" boolean,
    "vendor_booth_spots_available" integer,
    "event_type" "text",
    "social_member_price_deprecated" numeric,
    "business_member_price_deprecated" numeric,
    "access_type_deprecated" "text",
    "access_level_deprecated" "text",
    "sponsor_slots_enabled" boolean,
    "sponsor_slots_count" integer,
    "sponsor_slot_price" numeric,
    "vendor_slots_enabled" boolean,
    "vendor_slots_count" integer,
    "vendor_slot_price" numeric,
    "host_slots_enabled" boolean,
    "host_slots_count" integer,
    "host_slot_price" numeric,
    "ticket_mode" "text",
    "price_cents" integer,
    "member_price_cents" integer,
    "required_tier" "text"
);


ALTER TABLE "public"."backup_events_stale_booleans_20260610" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_guest_passes_presweep" (
    "id" "uuid",
    "member_id" "uuid",
    "guest_name" "text",
    "guest_email" "text",
    "guest_phone" "text",
    "event_id" "uuid",
    "qr_code" "text",
    "status" "text",
    "created_at" timestamp with time zone,
    "used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "month_year" "text",
    "converted_to_member_id" "uuid",
    "followup_sent_at" timestamp with time zone
);


ALTER TABLE "public"."backup_guest_passes_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_profiles_presweep" (
    "id" "uuid",
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "stripe_customer_id" "text",
    "subscription_status" "text",
    "subscription_id" "text",
    "member_since" timestamp with time zone,
    "calendar_token" "uuid",
    "notify_event_reminders" boolean,
    "notify_new_events" boolean,
    "notify_announcements" boolean,
    "subscription_ends_at" timestamp with time zone,
    "subscription_paused_until" timestamp with time zone,
    "membership_override" boolean,
    "member_type" "text",
    "membership_duration" "text",
    "admin_notes" "text",
    "hubspot_contact_id" "text",
    "deleted_at" timestamp with time zone,
    "imported_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "phone" "text",
    "cancel_at_period_end" boolean,
    "role" "text",
    "membership_wave" "text",
    "is_founding_member" boolean,
    "is_partner" boolean,
    "partner_type" "text",
    "application_status" "text",
    "banned" boolean,
    "banned_at" timestamp with time zone,
    "banned_reason" "text",
    "first_payment_at" timestamp with time zone,
    "company" "text",
    "title" "text",
    "last_seen_at" timestamp with time zone,
    "is_vendor" boolean,
    "is_sponsor" boolean,
    "is_venue" boolean,
    "account_type" "text",
    "is_banned" boolean,
    "banned_by" "uuid",
    "partner_types" "text"[],
    "partner_status" "text",
    "is_featured_partner" boolean,
    "see_all_cross_conversations" boolean,
    "has_completed_onboarding_rsvp" boolean,
    "deactivated_at" timestamp with time zone,
    "deactivation_reason" "text",
    "marketing_unsubscribed" boolean,
    "tier" "text",
    "industry" "text",
    "linkedin_url" "text",
    "website_url" "text",
    "last_attended_at" timestamp with time zone,
    "sms_consent" boolean,
    "sms_consent_at" timestamp with time zone,
    "sms_consent_ip" "text",
    "sms_consent_user_agent" "text",
    "referred_by_ambassador_id" "uuid",
    "ambassador_referral_id" "uuid",
    "is_locked_in_pricing" boolean,
    "is_internal" boolean,
    "calendar_subscribed_social_at" timestamp with time zone,
    "calendar_subscribed_business_at" timestamp with time zone,
    "calendar_subscribed_all_at" timestamp with time zone,
    "calendar_prompt_dismissed_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "referred_by_code" "text"
);


ALTER TABLE "public"."backup_profiles_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_sauna_merge_credentials_20260610" (
    "id" "uuid",
    "token" "text",
    "person_id" "uuid",
    "event_id" "uuid",
    "credential_type" "text",
    "status" "text",
    "used_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "expires_at" timestamp with time zone,
    "issued_by_person_id" "uuid",
    "apple_pass_serial" "text",
    "google_pass_object_id" "text",
    "wallet_status" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_sauna_merge_credentials_20260610" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_sauna_merge_event_20260610" (
    "id" "uuid",
    "title" "text",
    "description" "text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "location_name" "text",
    "location_address" "text",
    "image_url" "text",
    "capacity" integer,
    "is_members_only_deprecated" boolean,
    "ticket_price_deprecated" integer,
    "category" "text",
    "recurrence_rule" "text",
    "recurrence_end_date" "date",
    "parent_event_id" "uuid",
    "occurrence_index" integer,
    "tags" "text"[],
    "allows_guest_passes" boolean,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "is_business_only_deprecated" boolean,
    "eventbrite_event_id" "text",
    "eventbrite_published" boolean,
    "eventbrite_url" "text",
    "price_deprecated" numeric(10,2),
    "max_attendees_deprecated" integer,
    "is_published" boolean,
    "open_for_venue_partner" boolean,
    "open_for_sponsor_inquiry" boolean,
    "vendor_booth_spots_available" integer,
    "event_type" "text",
    "social_member_price_deprecated" numeric,
    "business_member_price_deprecated" numeric,
    "access_type_deprecated" "text",
    "access_level_deprecated" "text",
    "sponsor_slots_enabled" boolean,
    "sponsor_slots_count" integer,
    "sponsor_slot_price" numeric,
    "vendor_slots_enabled" boolean,
    "vendor_slots_count" integer,
    "vendor_slot_price" numeric,
    "host_slots_enabled" boolean,
    "host_slots_count" integer,
    "host_slot_price" numeric,
    "ticket_mode" "text",
    "price_cents" integer,
    "member_price_cents" integer,
    "required_tier" "text"
);


ALTER TABLE "public"."backup_sauna_merge_event_20260610" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_sauna_merge_tickets_20260610" (
    "id" "uuid",
    "user_id" "uuid",
    "event_id" "uuid",
    "ticket_type" "text",
    "stripe_payment_id" "text",
    "status" "text",
    "guest_email" "text",
    "guest_name" "text",
    "source" "text",
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "created_at" timestamp with time zone,
    "metadata" "jsonb",
    "amount_paid_cents" integer,
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone
);


ALTER TABLE "public"."backup_sauna_merge_tickets_20260610" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_tickets_presweep" (
    "id" "uuid",
    "user_id" "uuid",
    "event_id" "uuid",
    "ticket_type" "text",
    "stripe_payment_id" "text",
    "status" "text",
    "guest_email" "text",
    "guest_name" "text",
    "source" "text",
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "created_at" timestamp with time zone,
    "metadata" "jsonb",
    "amount_paid_cents" integer,
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone
);


ALTER TABLE "public"."backup_tickets_presweep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."best_time_to_post" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "hour_of_day" integer NOT NULL,
    "engagement_score" numeric DEFAULT 0 NOT NULL,
    "sample_size" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "best_time_to_post_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "best_time_to_post_hour_of_day_check" CHECK ((("hour_of_day" >= 0) AND ("hour_of_day" <= 23)))
);


ALTER TABLE "public"."best_time_to_post" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "content" "text" NOT NULL,
    "cover_image_url" "text",
    "author" "text" DEFAULT '704 Collective'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "meta_description" "text",
    "focus_keyword" "text",
    "og_image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "published_at" timestamp with time zone,
    "cover_image_alt" "text",
    "canonical_url" "text",
    "schema_type" "text" DEFAULT 'BlogPosting'::"text" NOT NULL,
    "reading_time_minutes" integer,
    "show_table_of_contents" boolean DEFAULT false NOT NULL,
    "instagram_embed_url" "text",
    "tiktok_embed_url" "text",
    "related_post_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "meta_title" "text",
    CONSTRAINT "blog_posts_schema_type_check" CHECK (("schema_type" = ANY (ARRAY['BlogPosting'::"text", 'Article'::"text", 'NewsArticle'::"text"]))),
    CONSTRAINT "blog_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."blog_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "company" "text",
    "title" "text",
    "linkedin_url" "text",
    "website" "text",
    "referral_source" "text",
    "why_join" "text",
    "what_bring" "text",
    "goals" "text",
    "industry" "text",
    "years_in_charlotte" integer,
    "billing_plan" "text" DEFAULT 'monthly'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "admin_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_setup_intent_id" "text",
    "stripe_payment_method_id" "text",
    "card_saved" boolean DEFAULT false,
    "profile_id" "uuid",
    "confirmation_sent_at" timestamp with time zone,
    "decision_email_sent_at" timestamp with time zone,
    "conflict_lesson" "text",
    "missing_in_charlotte" "text",
    "one_year_goal" "text",
    "right_intro" "text",
    "recent_wins" "text",
    "referral_code" "text",
    "ambassador_id" "uuid",
    "anything_else" "text",
    "stripe_subscription_id" "text",
    "approved_at" timestamp with time zone,
    CONSTRAINT "business_applications_billing_plan_check" CHECK (("billing_plan" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "business_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'approved'::"text", 'denied'::"text", 'waitlisted'::"text"])))
);


ALTER TABLE "public"."business_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text",
    "title" "text",
    "industry" "text",
    "bio" "text",
    "website_url" "text",
    "linkedin_url" "text",
    "phone" "text",
    "services" "text"[],
    "looking_for" "text"[],
    "card_background" "text" DEFAULT '#1A1A1A'::"text",
    "card_accent" "text" DEFAULT '#C6A664'::"text",
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "instagram_url" "text",
    "tiktok_url" "text",
    "facebook_url" "text",
    "logo_url" "text",
    "additional_photos" "text"[]
);


ALTER TABLE "public"."business_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cancellation_surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "reason" "text",
    "feedback" "text",
    "would_rejoin" boolean,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cancellation_surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "profile_id" "uuid",
    "activity_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "company" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "source_detail" "text",
    "status" "text" DEFAULT 'active'::"text",
    "contact_type" "text" DEFAULT 'prospect'::"text",
    "unsubscribed_at" timestamp with time zone,
    "unsubscribed_reason" "text",
    "lead_score" integer DEFAULT 0,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"(),
    "last_activity_at" timestamp with time zone DEFAULT "now"(),
    "converted_to_member_id" "uuid",
    "converted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unsubscribed" boolean DEFAULT false,
    "social_handles" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sms_consent" boolean DEFAULT false NOT NULL,
    "sms_consent_at" timestamp with time zone
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'group'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_ad_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "access_token" "text",
    "is_connected" boolean DEFAULT false,
    "connected_by" "uuid",
    "connected_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_ad_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_ad_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ad_account_id" "uuid" NOT NULL,
    "campaign_name" "text",
    "ad_set_name" "text",
    "ad_name" "text",
    "platform_campaign_id" "text",
    "date" "date" NOT NULL,
    "impressions" integer DEFAULT 0,
    "clicks" integer DEFAULT 0,
    "spend" numeric(10,2) DEFAULT 0,
    "conversions" integer DEFAULT 0,
    "revenue" numeric(10,2) DEFAULT 0,
    "ctr" numeric(6,4),
    "cpc" numeric(8,2),
    "roas" numeric(8,2),
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_ad_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "contact_id" "uuid",
    "conversion_type" "text" NOT NULL,
    "source_type" "text",
    "source_id" "uuid",
    "source_detail" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "revenue" numeric(10,2),
    "converted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_dashboard_widgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dashboard_id" "uuid" NOT NULL,
    "widget_type" "text" NOT NULL,
    "title" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "position_x" integer DEFAULT 0,
    "position_y" integer DEFAULT 0,
    "width" integer DEFAULT 4,
    "height" integer DEFAULT 2,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_dashboard_widgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_dashboards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false,
    "is_shared" boolean DEFAULT true,
    "layout" "jsonb" DEFAULT '[]'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_dashboards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_id" "uuid",
    "profile_id" "uuid",
    "stage" "text" DEFAULT 'applied'::"text" NOT NULL,
    "value" numeric(10,2),
    "deal_type" "text" DEFAULT 'business_membership'::"text",
    "industry" "text",
    "notes" "text",
    "internal_notes" "text",
    "application_data" "jsonb" DEFAULT '{}'::"jsonb",
    "stripe_setup_intent_id" "text",
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "last_stage_change_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "denial_reason" "text",
    "waitlist_reason" "text",
    "assigned_to" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_form_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "field_order" integer NOT NULL,
    "field_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "placeholder" "text",
    "help_text" "text",
    "options" "jsonb",
    "is_required" boolean DEFAULT false,
    "maps_to_field" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_form_fields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_form_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "deal_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "ip_address" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_form_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "slug" "text" NOT NULL,
    "form_type" "text" DEFAULT 'general'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "submit_button_text" "text" DEFAULT 'Submit'::"text",
    "success_message" "text" DEFAULT 'Thank you! We will be in touch shortly.'::"text",
    "redirect_url" "text",
    "notify_email" "text",
    "auto_create_contact" boolean DEFAULT true,
    "auto_enroll_drip_id" "uuid",
    "auto_create_deal" boolean DEFAULT false,
    "deal_stage" "text" DEFAULT 'applied'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_renewal_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "reminder_type" "text" NOT NULL,
    "days_before" integer,
    "sent_at" timestamp with time zone,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resend_message_id" "text"
);


ALTER TABLE "public"."crm_renewal_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_sequence_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "profile_id" "uuid",
    "current_step" integer DEFAULT 1,
    "next_send_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text",
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "stopped_reason" "text"
);


ALTER TABLE "public"."crm_sequence_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_sequence_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "delay_days" integer DEFAULT 0,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_sequence_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_survey_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "question_order" integer NOT NULL,
    "question_type" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "options" "jsonb",
    "is_required" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_survey_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "contact_id" "uuid",
    "responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "nps_score" integer,
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_survey_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_type" "text" DEFAULT 'manual'::"text",
    "trigger_event_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "send_delay_hours" integer DEFAULT 2,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text",
    "stop_on_conversion" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drip_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drip_campaign_id" "uuid" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_name" "text",
    "current_step" integer DEFAULT 1,
    "next_send_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text",
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "stopped_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "last_sent_at" timestamp with time zone
);


ALTER TABLE "public"."drip_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drip_campaign_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "delay_days" integer DEFAULT 0,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "delay_hours" integer DEFAULT 0
);


ALTER TABLE "public"."drip_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "preview_text" "text",
    "body_html" "text",
    "body_json" "jsonb",
    "template_id" "uuid",
    "audience" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text",
    "scheduled_for" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "sent_count" integer DEFAULT 0,
    "open_count" integer DEFAULT 0,
    "click_count" integer DEFAULT 0,
    "bounce_count" integer DEFAULT 0,
    "unsubscribe_count" integer DEFAULT 0,
    "utm_campaign" "text",
    "utm_medium" "text" DEFAULT 'email'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "audience_type" "text" DEFAULT 'all_members'::"text",
    "audience_segment_ids" "text"[],
    "from_name" "text" DEFAULT '704 Collective'::"text",
    "from_email" "text" DEFAULT 'no-reply@704collective.com'::"text",
    "recipient_count" integer DEFAULT 0,
    "delivered_count" integer DEFAULT 0,
    "sending_at" timestamp with time zone,
    "audience_event_id" "uuid"
);


ALTER TABLE "public"."email_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "to_email" "text" NOT NULL,
    "to_name" "text",
    "from_email" "text" DEFAULT 'no-reply@704collective.com'::"text",
    "reply_to" "text",
    "subject" "text" NOT NULL,
    "template" "text",
    "campaign_id" "uuid",
    "sequence_id" "uuid",
    "drip_campaign_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text",
    "resend_id" "text",
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "scheduled_for" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "profile_id" "uuid",
    "drip_enrollment_id" "uuid",
    "resend_message_id" "text",
    "open_count" integer DEFAULT 0,
    "click_url" "text"
);


ALTER TABLE "public"."email_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_json" "jsonb",
    "preview_text" "text",
    "is_default" boolean DEFAULT false,
    "template_type" "text" DEFAULT 'marketing'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discussion_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_discussion_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discussion_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "post_id" "uuid",
    "comment_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edl_target_chk" CHECK ((("post_id" IS NOT NULL) OR ("comment_id" IS NOT NULL)))
);


ALTER TABLE "public"."event_discussion_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discussion_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "post_id" "uuid",
    "comment_id" "uuid",
    "mentioned_user_id" "uuid" NOT NULL,
    "mentioned_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edm_target_chk" CHECK ((("post_id" IS NOT NULL) OR ("comment_id" IS NOT NULL)))
);


ALTER TABLE "public"."event_discussion_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discussion_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "uploader_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "thumbnail_url" "text",
    "media_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "source" "text" DEFAULT 'upload'::"text" NOT NULL,
    "source_post_id" "uuid",
    "file_size_bytes" bigint,
    "width" integer,
    "height" integer,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_discussion_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_discussion_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text",
    "image_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_discussion_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "inquiry_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "amount_offering" numeric,
    "desired_return" "text",
    "custom_details" "text",
    "venue_address" "text",
    "venue_capacity" integer,
    "venue_hours" "text",
    "venue_other_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_inquiries_inquiry_type_check" CHECK (("inquiry_type" = ANY (ARRAY['vendor'::"text", 'sponsor'::"text", 'venue'::"text", 'new_event'::"text"]))),
    CONSTRAINT "event_inquiries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."event_inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_inquiry_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_inquiry_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_public_rsvps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "sms_consent" boolean DEFAULT false,
    "status" "text" DEFAULT 'rsvp'::"text" NOT NULL,
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_public_rsvps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "stripe_customer_id" "text",
    "subscription_status" "text" DEFAULT 'inactive'::"text",
    "subscription_id" "text",
    "member_since" timestamp with time zone,
    "calendar_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notify_event_reminders" boolean DEFAULT true,
    "notify_new_events" boolean DEFAULT true,
    "notify_announcements" boolean DEFAULT true,
    "subscription_ends_at" timestamp with time zone,
    "subscription_paused_until" timestamp with time zone,
    "membership_override" boolean DEFAULT false NOT NULL,
    "member_type" "text" DEFAULT 'social'::"text",
    "membership_duration" "text",
    "admin_notes" "text",
    "hubspot_contact_id" "text",
    "deleted_at" timestamp with time zone,
    "imported_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "cancel_at_period_end" boolean DEFAULT false,
    "role" "text" DEFAULT 'lead'::"text" NOT NULL,
    "membership_wave" "text",
    "is_founding_member" boolean DEFAULT false NOT NULL,
    "is_partner" boolean DEFAULT false NOT NULL,
    "partner_type" "text",
    "application_status" "text",
    "banned" boolean DEFAULT false NOT NULL,
    "banned_at" timestamp with time zone,
    "banned_reason" "text",
    "first_payment_at" timestamp with time zone,
    "company" "text",
    "title" "text",
    "last_seen_at" timestamp with time zone,
    "is_vendor" boolean DEFAULT false,
    "is_sponsor" boolean DEFAULT false,
    "is_venue" boolean DEFAULT false,
    "account_type" "text" DEFAULT 'member'::"text",
    "is_banned" boolean DEFAULT false,
    "banned_by" "uuid",
    "partner_types" "text"[],
    "partner_status" "text",
    "is_featured_partner" boolean DEFAULT false NOT NULL,
    "see_all_cross_conversations" boolean DEFAULT false NOT NULL,
    "has_completed_onboarding_rsvp" boolean DEFAULT false NOT NULL,
    "deactivated_at" timestamp with time zone,
    "deactivation_reason" "text",
    "marketing_unsubscribed" boolean DEFAULT false,
    "tier" "text",
    "industry" "text",
    "linkedin_url" "text",
    "website_url" "text",
    "last_attended_at" timestamp with time zone,
    "sms_consent" boolean DEFAULT false NOT NULL,
    "sms_consent_at" timestamp with time zone,
    "sms_consent_ip" "text",
    "sms_consent_user_agent" "text",
    "referred_by_ambassador_id" "uuid",
    "ambassador_referral_id" "uuid",
    "is_locked_in_pricing" boolean DEFAULT false NOT NULL,
    "is_internal" boolean DEFAULT false NOT NULL,
    "calendar_subscribed_social_at" timestamp with time zone,
    "calendar_subscribed_business_at" timestamp with time zone,
    "calendar_subscribed_all_at" timestamp with time zone,
    "calendar_prompt_dismissed_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "referred_by_code" "text",
    CONSTRAINT "profiles_account_type_check" CHECK (("account_type" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'member'::"text", 'partner'::"text"]))),
    CONSTRAINT "profiles_application_status_check" CHECK (("application_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'denied'::"text", 'waitlist'::"text"]))),
    CONSTRAINT "profiles_member_type_check" CHECK (("member_type" = ANY (ARRAY['social'::"text", 'business'::"text", 'social_non_member'::"text", 'business_non_member'::"text", 'non_member'::"text", 'partner'::"text", 'vendor'::"text", 'venue'::"text", 'sponsor'::"text"]))),
    CONSTRAINT "profiles_membership_wave_check" CHECK (("membership_wave" = ANY (ARRAY['founding'::"text", 'wave_2'::"text", 'wave_3'::"text", 'wave_4'::"text", 'wave_5'::"text"]))),
    CONSTRAINT "profiles_partner_type_check" CHECK (("partner_type" = ANY (ARRAY['vendor'::"text", 'venue'::"text", 'sponsor'::"text", 'general'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'lead'::"text"]))),
    CONSTRAINT "profiles_subscription_status_check" CHECK ((("subscription_status" IS NULL) OR ("subscription_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'canceled'::"text", 'past_due'::"text", 'trialing'::"text", 'paused'::"text", 'deactivated'::"text"]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "event_id" "uuid",
    "ticket_type" "text" NOT NULL,
    "stripe_payment_id" "text",
    "status" "text" DEFAULT 'confirmed'::"text",
    "guest_email" "text",
    "guest_name" "text",
    "source" "text" DEFAULT 'direct'::"text",
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "amount_paid_cents" integer,
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text", 'used'::"text"]))),
    CONSTRAINT "tickets_ticket_type_check" CHECK (("ticket_type" = ANY (ARRAY['member_free'::"text", 'public_free'::"text", 'public_paid'::"text", 'social_member'::"text", 'business_member'::"text", 'guest_pass'::"text", 'comp'::"text"])))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."event_participants_view" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."event_id",
    "t"."user_id",
    NULL::"uuid" AS "contact_id",
    NULL::"uuid" AS "public_rsvp_id",
    "p"."full_name",
    COALESCE("p"."email", "t"."guest_email") AS "email",
    "t"."guest_name",
    "t"."ticket_type",
    "t"."status",
    "t"."stripe_payment_id",
    "t"."checked_in_at",
    "t"."checked_in_by",
    NULL::boolean AS "sms_consent",
    'ticket'::"text" AS "participant_source",
    "t"."created_at"
   FROM ("public"."tickets" "t"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "t"."user_id")))
UNION ALL
 SELECT "r"."id",
    "r"."event_id",
    NULL::"uuid" AS "user_id",
    "r"."contact_id",
    "r"."id" AS "public_rsvp_id",
    (("r"."first_name" || ' '::"text") || "r"."last_name") AS "full_name",
    "r"."email",
    NULL::"text" AS "guest_name",
    'public_free'::"text" AS "ticket_type",
    "r"."status",
    NULL::"text" AS "stripe_payment_id",
    "r"."checked_in_at",
    "r"."checked_in_by",
    "r"."sms_consent",
    'public_rsvp'::"text" AS "participant_source",
    "r"."created_at"
   FROM "public"."event_public_rsvps" "r";


ALTER VIEW "public"."event_participants_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "profile_id" "uuid",
    "email" "text",
    "full_name" "text",
    "suggestion" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "read_at" timestamp with time zone,
    "read_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."event_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notified_at" timestamp with time zone,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."event_waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "location_name" "text",
    "location_address" "text",
    "image_url" "text",
    "capacity" integer,
    "is_members_only_deprecated" boolean DEFAULT false,
    "ticket_price_deprecated" integer DEFAULT 1000,
    "category" "text" DEFAULT 'other'::"text",
    "recurrence_rule" "text",
    "recurrence_end_date" "date",
    "parent_event_id" "uuid",
    "occurrence_index" integer DEFAULT 0,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "allows_guest_passes" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_business_only_deprecated" boolean DEFAULT false NOT NULL,
    "eventbrite_event_id" "text",
    "eventbrite_published" boolean DEFAULT false,
    "eventbrite_url" "text",
    "price_deprecated" numeric(10,2) DEFAULT 0,
    "max_attendees_deprecated" integer,
    "is_published" boolean DEFAULT true,
    "open_for_venue_partner" boolean,
    "open_for_sponsor_inquiry" boolean DEFAULT true NOT NULL,
    "vendor_booth_spots_available" integer DEFAULT 0 NOT NULL,
    "event_type" "text" DEFAULT 'social'::"text",
    "social_member_price_deprecated" numeric,
    "business_member_price_deprecated" numeric,
    "access_type_deprecated" "text" DEFAULT 'members_only'::"text",
    "access_level_deprecated" "text" DEFAULT 'all'::"text",
    "sponsor_slots_enabled" boolean DEFAULT false NOT NULL,
    "sponsor_slots_count" integer DEFAULT 0 NOT NULL,
    "sponsor_slot_price" numeric,
    "vendor_slots_enabled" boolean DEFAULT false NOT NULL,
    "vendor_slots_count" integer DEFAULT 0 NOT NULL,
    "vendor_slot_price" numeric,
    "host_slots_enabled" boolean DEFAULT false NOT NULL,
    "host_slots_count" integer DEFAULT 0 NOT NULL,
    "host_slot_price" numeric,
    "ticket_mode" "text" DEFAULT 'none'::"text" NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "member_price_cents" integer,
    "required_tier" "text" DEFAULT 'public'::"text" NOT NULL,
    "discussion_opened_at" timestamp with time zone,
    CONSTRAINT "events_capacity_check" CHECK ((("capacity" IS NULL) OR (("capacity" >= 0) AND ("capacity" <= 10000)))),
    CONSTRAINT "events_ticket_mode_check" CHECK (("ticket_mode" = ANY (ARRAY['none'::"text", 'public_only'::"text", 'all'::"text"]))),
    CONSTRAINT "required_tier_valid" CHECK (("required_tier" = ANY (ARRAY['public'::"text", 'social'::"text", 'business'::"text", 'founder'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."access_type_deprecated" IS 'members_only | public_ticketed | public_free';



COMMENT ON COLUMN "public"."events"."access_level_deprecated" IS 'all | social_only | business_only (members_only only)';



CREATE TABLE IF NOT EXISTS "public"."feed_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feed_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feed_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_mutes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "muted_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feed_mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "images" "text"[],
    "video_url" "text",
    "feed_type" "text" DEFAULT 'business'::"text" NOT NULL,
    "is_shadow_hidden" boolean DEFAULT false NOT NULL,
    "shadow_hidden_by" "uuid",
    "shadow_hidden_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feed_posts_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['business'::"text", 'social'::"text"])))
);


ALTER TABLE "public"."feed_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feed_type" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feed_shares_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['business'::"text", 'social'::"text"])))
);


ALTER TABLE "public"."feed_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cache_key" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financial_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_event_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guest_email" "text" NOT NULL,
    "event_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "opened" boolean DEFAULT false
);


ALTER TABLE "public"."guest_event_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_pass_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guest_pass_code" "text" NOT NULL,
    "contact_id" "uuid",
    "event_id" "uuid",
    "inviter_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guest_pass_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_passes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "guest_name" "text" NOT NULL,
    "guest_email" "text" NOT NULL,
    "guest_phone" "text",
    "event_id" "uuid",
    "qr_code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "month_year" "text" NOT NULL,
    "converted_to_member_id" "uuid",
    "followup_sent_at" timestamp with time zone
);


ALTER TABLE "public"."guest_passes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hashtag_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "monitor_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "platform_post_id" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "author_handle" "text",
    "content" "text" NOT NULL,
    "media_url" "text",
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "url" "text",
    "posted_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hashtag_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hashtag_monitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "hashtag" "text" NOT NULL,
    "platforms" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "total_mentions" integer DEFAULT 0 NOT NULL,
    "last_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hashtag_monitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "alt_text" "text",
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "uploaded_by" "uuid"
);


ALTER TABLE "public"."homepage_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hub_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_edited" boolean DEFAULT false NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."hub_post_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hub_post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text",
    "image_urls" "text"[],
    "file_urls" "text"[],
    "file_names" "text"[],
    "is_edited" boolean DEFAULT false NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."hub_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint,
    "file_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hub_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "header_image_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "account_id" "text",
    "account_name" "text",
    "scopes" "text"[],
    "expires_at" timestamp with time zone,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "integrations_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'hubspot'::"text", 'google'::"text", 'apple'::"text"])))
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."introductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_person_id" "uuid" NOT NULL,
    "target_person_id" "uuid" NOT NULL,
    "context_message" "text",
    "status" "text" DEFAULT 'pending_approval'::"text" NOT NULL,
    "approved_by_person_id" "uuid",
    "approved_at" timestamp with time zone,
    "target_responded_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "source_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."introductions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "stripe_payment_intent_id" "text",
    "stripe_customer_id" "text",
    "stripe_event_id" "text",
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text",
    "status" "text" NOT NULL,
    "payment_type" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['subscription'::"text", 'ticket'::"text", 'one_time'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['succeeded'::"text", 'failed'::"text", 'refunded'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."member_counts" AS
 WITH "active_members" AS (
         SELECT "p"."id"
           FROM "public"."profiles" "p"
          WHERE (("p"."deleted_at" IS NULL) AND ("p"."subscription_status" = 'active'::"text") AND ("p"."email" !~~ '%@704collective.com'::"text"))
        ), "classified" AS (
         SELECT "am"."id",
            ( SELECT "lc"."amount"
                   FROM "public"."payments" "lc"
                  WHERE (("lc"."user_id" = "am"."id") AND ("lc"."status" = 'succeeded'::"text"))
                  ORDER BY "lc"."created_at" DESC
                 LIMIT 1) AS "latest_amount"
           FROM "active_members" "am"
        )
 SELECT "count"(*) AS "active_members",
    "count"(*) FILTER (WHERE ("latest_amount" > 0)) AS "paying_members",
    "count"(*) FILTER (WHERE ("latest_amount" = 0)) AS "coupon_comped",
    "count"(*) FILTER (WHERE ("latest_amount" IS NULL)) AS "override_comped"
   FROM "classified";


ALTER VIEW "public"."member_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "is_edited" boolean DEFAULT false,
    "image_urls" "text"[],
    "file_urls" "text"[],
    "file_names" "text"[]
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "event_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "conversation_id" "uuid",
    "action_url" "text",
    "crm_type" "text",
    "is_dismissed" boolean DEFAULT false,
    "priority" "text" DEFAULT 'normal'::"text",
    "notification_type" "text",
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['event_reminder'::"text", 'new_event'::"text", 'broadcast'::"text", 'mention'::"text", 'discussion_reply'::"text", 'discussion_open'::"text", 'new_post'::"text", 'hub_post'::"text", 'hub_added'::"text", 'new_message'::"text", 'new_inquiry'::"text", 'inquiry_message'::"text", 'inquiry_reply'::"text", 'partner_team_message'::"text", 'partner_team_reply'::"text", 'task_assigned'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "member_brief" "text",
    "member_brief_generated_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."onboarding_responses" OWNER TO "postgres";


COMMENT ON TABLE "public"."onboarding_responses" IS 'Stores Typeform-style onboarding survey responses. responses jsonb holds arbitrary Q&A pairs keyed by question id. version supports survey schema evolution. member_brief is AI-generated summary populated by Project 8.1 work. Empty until Project 8.1 wires up the onboarding flow.';



CREATE TABLE IF NOT EXISTS "public"."organization_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT '704 Collective'::"text" NOT NULL,
    "contact_email" "text" DEFAULT 'hello@704collective.com'::"text",
    "phone" "text",
    "description" "text",
    "instagram_url" "text",
    "tiktok_url" "text",
    "website_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."organization_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "website" "text",
    "phone" "text" NOT NULL,
    "description" "text" NOT NULL,
    "logo_url" "text",
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "partner_types" "text"[] NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invite_id" "uuid",
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "denial_reason" "text",
    CONSTRAINT "partner_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."partner_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "email" "text",
    "unique_token" "text" NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "revoked" boolean DEFAULT false NOT NULL,
    "revoked_by" "uuid",
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."partner_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "amount" numeric NOT NULL,
    "description" "text" NOT NULL,
    "stripe_invoice_id" "text",
    "stripe_invoice_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "waived_by" "uuid",
    "waived_at" timestamp with time zone,
    "due_date" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "partner_invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'waived'::"text"])))
);


ALTER TABLE "public"."partner_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "website" "text",
    "phone" "text",
    "logo_url" "text",
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "partner_types" "text"[] NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "featured_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."partner_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid",
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "phone" "text",
    "website" "text",
    "partner_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "approved_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "partners_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "email_lower" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "email"))) STORED,
    "full_name" "text",
    "phone" "text",
    "phone_e164" "text",
    "sms_consent" boolean DEFAULT false,
    "sms_consent_at" timestamp with time zone,
    "roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "member_tier" "text",
    "member_status" "text",
    "override_paying" boolean DEFAULT false,
    "stripe_customer_id" "text",
    "joined_at" timestamp with time zone,
    "last_attended" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "referred_by_code" "text",
    "referred_by_person_id" "uuid",
    "member_brief" "text",
    "member_brief_generated_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_edited" boolean DEFAULT false NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."post_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "comment_id" "uuid"
);


ALTER TABLE "public"."post_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "feed_type" "text" NOT NULL,
    "content" "text",
    "image_urls" "text"[],
    "file_urls" "text"[],
    "file_names" "text"[],
    "is_edited" boolean DEFAULT false NOT NULL,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "posts_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['social'::"text", 'business'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_webhook_events" (
    "stripe_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."processed_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prospects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'new'::"text",
    "hubspot_contact_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."prospects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_reply_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_reply_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_account_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "follower_count" integer DEFAULT 0 NOT NULL,
    "follower_change" integer DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "reach" integer DEFAULT 0 NOT NULL,
    "profile_views" integer DEFAULT 0 NOT NULL,
    "website_clicks" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."social_account_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_handle" "text",
    "account_type" "text" DEFAULT 'business'::"text",
    "avatar_url" "text",
    "follower_count" integer DEFAULT 0 NOT NULL,
    "following_count" integer DEFAULT 0 NOT NULL,
    "post_count" integer DEFAULT 0 NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_error" "text",
    "platform_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['personal'::"text", 'business'::"text", 'creator'::"text"]))),
    CONSTRAINT "social_accounts_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'linkedin'::"text", 'tiktok'::"text", 'youtube'::"text", 'pinterest'::"text", 'snapchat'::"text", 'twitter'::"text"]))),
    CONSTRAINT "social_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disconnected'::"text", 'error'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."social_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_inbox_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "platform_message_id" "text" NOT NULL,
    "platform_post_id" "text",
    "type" "text" NOT NULL,
    "direction" "text" DEFAULT 'inbound'::"text" NOT NULL,
    "author_name" "text" NOT NULL,
    "author_handle" "text",
    "author_avatar_url" "text",
    "author_platform_id" "text",
    "content" "text" NOT NULL,
    "media_url" "text",
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "assigned_to" "uuid",
    "contact_id" "uuid",
    "parent_message_id" "uuid",
    "sentiment" "text",
    "labels" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "received_at" timestamp with time zone NOT NULL,
    "replied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_inbox_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "social_inbox_messages_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text"]))),
    CONSTRAINT "social_inbox_messages_status_check" CHECK (("status" = ANY (ARRAY['unread'::"text", 'read'::"text", 'replied'::"text", 'archived'::"text", 'spam'::"text"]))),
    CONSTRAINT "social_inbox_messages_type_check" CHECK (("type" = ANY (ARRAY['comment'::"text", 'dm'::"text", 'mention'::"text", 'reply'::"text"])))
);


ALTER TABLE "public"."social_inbox_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_inbox_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "sent_by" "uuid" NOT NULL,
    "platform_reply_id" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."social_inbox_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_post_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "platform_post_id" "text" NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "reach" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "shares" integer DEFAULT 0 NOT NULL,
    "saves" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "video_views" integer DEFAULT 0 NOT NULL,
    "video_completion_rate" numeric DEFAULT 0 NOT NULL,
    "engagement_rate" numeric DEFAULT 0 NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."social_post_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "caption" "text" NOT NULL,
    "media_urls" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "media_types" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "platform_post_ids" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_account_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "campaign_id" "uuid",
    "link_url" "text",
    "hashtags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "mentions" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "first_comment" "text",
    "approval_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_by" "uuid",
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_rule" "text",
    "parent_post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_posts_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "social_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'published'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."social_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsors_vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_name" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text",
    "partnership_type" "text" DEFAULT 'sponsor'::"text",
    "hubspot_deal_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."sponsors_vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."utm_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "contact_id" "uuid",
    "page_url" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "utm_term" "text",
    "referrer" "text",
    "converted" boolean DEFAULT false,
    "converted_at" timestamp with time zone,
    "conversion_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."utm_tracking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Default Workspace'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_conversation_participants"
    ADD CONSTRAINT "admin_conversation_participants_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."admin_conversation_participants"
    ADD CONSTRAINT "admin_conversation_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_conversations"
    ADD CONSTRAINT "admin_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_messages"
    ADD CONSTRAINT "admin_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_requests"
    ADD CONSTRAINT "admin_requests_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_requests"
    ADD CONSTRAINT "admin_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_resources"
    ADD CONSTRAINT "admin_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_task_comments"
    ADD CONSTRAINT "admin_task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_tasks"
    ADD CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."agent_memory"
    ADD CONSTRAINT "agent_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassador_payouts"
    ADD CONSTRAINT "ambassador_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassador_payouts"
    ADD CONSTRAINT "ambassador_payouts_stripe_transfer_id_key" UNIQUE ("stripe_transfer_id");



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."apple_wallet_passes"
    ADD CONSTRAINT "apple_wallet_passes_pkey" PRIMARY KEY ("serial_number");



ALTER TABLE ONLY "public"."apple_wallet_registrations"
    ADD CONSTRAINT "apple_wallet_registrations_device_id_serial_number_key" UNIQUE ("device_id", "serial_number");



ALTER TABLE ONLY "public"."apple_wallet_registrations"
    ADD CONSTRAINT "apple_wallet_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_credentials"
    ADD CONSTRAINT "attendance_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."best_time_to_post"
    ADD CONSTRAINT "best_time_to_post_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."best_time_to_post"
    ADD CONSTRAINT "best_time_to_post_social_account_id_day_of_week_hour_of_day_key" UNIQUE ("social_account_id", "day_of_week", "hour_of_day");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."business_applications"
    ADD CONSTRAINT "business_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_cards"
    ADD CONSTRAINT "business_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_cards"
    ADD CONSTRAINT "business_cards_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."business_cards"
    ADD CONSTRAINT "business_cards_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."cancellation_surveys"
    ADD CONSTRAINT "cancellation_surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_activity"
    ADD CONSTRAINT "contact_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_contact_id_tag_key" UNIQUE ("contact_id", "tag");



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_ad_accounts"
    ADD CONSTRAINT "crm_ad_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_ad_accounts"
    ADD CONSTRAINT "crm_ad_accounts_platform_account_id_key" UNIQUE ("platform", "account_id");



ALTER TABLE ONLY "public"."crm_ad_performance"
    ADD CONSTRAINT "crm_ad_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_conversions"
    ADD CONSTRAINT "crm_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_dashboard_widgets"
    ADD CONSTRAINT "crm_dashboard_widgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_dashboards"
    ADD CONSTRAINT "crm_dashboards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_deals"
    ADD CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_form_fields"
    ADD CONSTRAINT "crm_form_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_form_submissions"
    ADD CONSTRAINT "crm_form_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_forms"
    ADD CONSTRAINT "crm_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_forms"
    ADD CONSTRAINT "crm_forms_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."crm_renewal_reminders"
    ADD CONSTRAINT "crm_renewal_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_sequence_id_step_number_key" UNIQUE ("sequence_id", "step_number");



ALTER TABLE ONLY "public"."crm_sequences"
    ADD CONSTRAINT "crm_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_survey_questions"
    ADD CONSTRAINT "crm_survey_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_survey_responses"
    ADD CONSTRAINT "crm_survey_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_surveys"
    ADD CONSTRAINT "crm_surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_campaigns"
    ADD CONSTRAINT "drip_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_enrollments"
    ADD CONSTRAINT "drip_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_steps"
    ADD CONSTRAINT "drip_steps_drip_campaign_id_step_number_key" UNIQUE ("drip_campaign_id", "step_number");



ALTER TABLE ONLY "public"."drip_steps"
    ADD CONSTRAINT "drip_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_discussion_comments"
    ADD CONSTRAINT "event_discussion_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_discussion_likes"
    ADD CONSTRAINT "event_discussion_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_discussion_photos"
    ADD CONSTRAINT "event_discussion_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_discussion_posts"
    ADD CONSTRAINT "event_discussion_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_inquiries"
    ADD CONSTRAINT "event_inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_inquiry_messages"
    ADD CONSTRAINT "event_inquiry_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_public_rsvps"
    ADD CONSTRAINT "event_public_rsvps_event_id_email_key" UNIQUE ("event_id", "email");



ALTER TABLE ONLY "public"."event_public_rsvps"
    ADD CONSTRAINT "event_public_rsvps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_suggestions"
    ADD CONSTRAINT "event_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_waitlist"
    ADD CONSTRAINT "event_waitlist_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_waitlist"
    ADD CONSTRAINT "event_waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."feed_mutes"
    ADD CONSTRAINT "feed_mutes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_mutes"
    ADD CONSTRAINT "feed_mutes_user_id_muted_user_id_key" UNIQUE ("user_id", "muted_user_id");



ALTER TABLE ONLY "public"."feed_posts"
    ADD CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_shares"
    ADD CONSTRAINT "feed_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_cache"
    ADD CONSTRAINT "financial_cache_cache_key_key" UNIQUE ("cache_key");



ALTER TABLE ONLY "public"."financial_cache"
    ADD CONSTRAINT "financial_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_event_notifications"
    ADD CONSTRAINT "guest_event_notifications_email_event_unique" UNIQUE ("guest_email", "event_id");



ALTER TABLE ONLY "public"."guest_event_notifications"
    ADD CONSTRAINT "guest_event_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_pass_events"
    ADD CONSTRAINT "guest_pass_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_passes"
    ADD CONSTRAINT "guest_passes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_passes"
    ADD CONSTRAINT "guest_passes_qr_code_key" UNIQUE ("qr_code");



ALTER TABLE ONLY "public"."hashtag_mentions"
    ADD CONSTRAINT "hashtag_mentions_monitor_id_platform_post_id_key" UNIQUE ("monitor_id", "platform_post_id");



ALTER TABLE ONLY "public"."hashtag_mentions"
    ADD CONSTRAINT "hashtag_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hashtag_monitors"
    ADD CONSTRAINT "hashtag_monitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hashtag_monitors"
    ADD CONSTRAINT "hashtag_monitors_workspace_id_hashtag_key" UNIQUE ("workspace_id", "hashtag");



ALTER TABLE ONLY "public"."homepage_images"
    ADD CONSTRAINT "homepage_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_hub_id_user_id_key" UNIQUE ("hub_id", "user_id");



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_post_comments"
    ADD CONSTRAINT "hub_post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_post_likes"
    ADD CONSTRAINT "hub_post_likes_hub_post_id_user_id_key" UNIQUE ("hub_post_id", "user_id");



ALTER TABLE ONLY "public"."hub_post_likes"
    ADD CONSTRAINT "hub_post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_posts"
    ADD CONSTRAINT "hub_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_resources"
    ADD CONSTRAINT "hub_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hubs"
    ADD CONSTRAINT "hubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_provider_unique" UNIQUE ("provider");



ALTER TABLE ONLY "public"."introductions"
    ADD CONSTRAINT "introductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_responses"
    ADD CONSTRAINT "onboarding_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_responses"
    ADD CONSTRAINT "onboarding_responses_user_version_unique" UNIQUE ("user_id", "version");



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_applications"
    ADD CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_unique_token_key" UNIQUE ("unique_token");



ALTER TABLE ONLY "public"."partner_invoices"
    ADD CONSTRAINT "partner_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_listings"
    ADD CONSTRAINT "partner_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_listings"
    ADD CONSTRAINT "partner_listings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_webhook_events"
    ADD CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("stripe_event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_calendar_token_key" UNIQUE ("calendar_token");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_reply_templates"
    ADD CONSTRAINT "saved_reply_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_account_metrics"
    ADD CONSTRAINT "social_account_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_account_metrics"
    ADD CONSTRAINT "social_account_metrics_social_account_id_date_key" UNIQUE ("social_account_id", "date");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_workspace_id_platform_account_id_key" UNIQUE ("workspace_id", "platform", "account_id");



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_platform_message_id_key" UNIQUE ("platform_message_id");



ALTER TABLE ONLY "public"."social_inbox_replies"
    ADD CONSTRAINT "social_inbox_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_post_id_social_account_id_key" UNIQUE ("post_id", "social_account_id");



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsors_vendors"
    ADD CONSTRAINT "sponsors_vendors_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."sponsors_vendors"
    ADD CONSTRAINT "sponsors_vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "unique_stripe_customer" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."utm_tracking"
    ADD CONSTRAINT "utm_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "admin_conv_participants_conv_idx" ON "public"."admin_conversation_participants" USING "btree" ("conversation_id");



CREATE INDEX "admin_conv_participants_user_idx" ON "public"."admin_conversation_participants" USING "btree" ("user_id");



CREATE INDEX "admin_conversations_created_by_idx" ON "public"."admin_conversations" USING "btree" ("created_by");



CREATE UNIQUE INDEX "admin_conversations_one_partner_inquiry_per_partner" ON "public"."admin_conversations" USING "btree" ("partner_id") WHERE (("type" = 'partner_inquiry'::"text") AND ("partner_id" IS NOT NULL));



CREATE INDEX "admin_conversations_partner_id_idx" ON "public"."admin_conversations" USING "btree" ("partner_id") WHERE ("partner_id" IS NOT NULL);



CREATE INDEX "admin_messages_conversation_id_idx" ON "public"."admin_messages" USING "btree" ("conversation_id");



CREATE INDEX "admin_messages_created_at_idx" ON "public"."admin_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_resources_created_at_idx" ON "public"."admin_resources" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_resources_uploaded_by_idx" ON "public"."admin_resources" USING "btree" ("uploaded_by");



CREATE INDEX "agent_memory_agent" ON "public"."agent_memory" USING "btree" ("agent_slug", "created_at" DESC);



CREATE INDEX "agent_memory_expires" ON "public"."agent_memory" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "agent_memory_person" ON "public"."agent_memory" USING "btree" ("person_id", "weight" DESC);



CREATE INDEX "ambassador_payouts_ambassador_id_idx" ON "public"."ambassador_payouts" USING "btree" ("ambassador_id");



CREATE INDEX "ambassador_payouts_status_idx" ON "public"."ambassador_payouts" USING "btree" ("status");



CREATE INDEX "ambassador_referrals_ambassador_id_idx" ON "public"."ambassador_referrals" USING "btree" ("ambassador_id");



CREATE INDEX "ambassador_referrals_created_at_idx" ON "public"."ambassador_referrals" USING "btree" ("created_at" DESC);



CREATE INDEX "ambassador_referrals_referred_email_idx" ON "public"."ambassador_referrals" USING "btree" ("referred_email");



CREATE INDEX "ambassador_referrals_status_idx" ON "public"."ambassador_referrals" USING "btree" ("status");



CREATE INDEX "ambassador_referrals_stripe_session_id_idx" ON "public"."ambassador_referrals" USING "btree" ("stripe_session_id");



CREATE INDEX "ambassadors_email_idx" ON "public"."ambassadors" USING "btree" ("email");



CREATE INDEX "ambassadors_is_active_idx" ON "public"."ambassadors" USING "btree" ("is_active");



CREATE INDEX "ambassadors_profile_id_idx" ON "public"."ambassadors" USING "btree" ("profile_id");



CREATE INDEX "ambassadors_referral_code_lower_idx" ON "public"."ambassadors" USING "btree" ("lower"("referral_code"));



CREATE INDEX "attendance_credentials_event" ON "public"."attendance_credentials" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "attendance_credentials_issued_by" ON "public"."attendance_credentials" USING "btree" ("issued_by_person_id", "created_at") WHERE ("issued_by_person_id" IS NOT NULL);



CREATE INDEX "attendance_credentials_person" ON "public"."attendance_credentials" USING "btree" ("person_id");



CREATE UNIQUE INDEX "attendance_credentials_token" ON "public"."attendance_credentials" USING "btree" ("token");



CREATE INDEX "attendance_credentials_type_status" ON "public"."attendance_credentials" USING "btree" ("credential_type", "status");



CREATE INDEX "blog_posts_published_at_idx" ON "public"."blog_posts" USING "btree" ("published_at" DESC NULLS LAST);



CREATE INDEX "blog_posts_slug_idx" ON "public"."blog_posts" USING "btree" ("slug");



CREATE INDEX "blog_posts_status_idx" ON "public"."blog_posts" USING "btree" ("status");



CREATE INDEX "business_applications_created_at_idx" ON "public"."business_applications" USING "btree" ("created_at" DESC);



CREATE INDEX "business_applications_email_idx" ON "public"."business_applications" USING "btree" ("email");



CREATE INDEX "business_applications_status_idx" ON "public"."business_applications" USING "btree" ("status");



CREATE INDEX "business_cards_public_id_idx" ON "public"."business_cards" USING "btree" ("public_id");



CREATE INDEX "contact_notes_contact_id_idx" ON "public"."contact_notes" USING "btree" ("contact_id");



CREATE INDEX "contact_notes_created_at_idx" ON "public"."contact_notes" USING "btree" ("created_at" DESC);



CREATE INDEX "conv_participants_conv_id_idx" ON "public"."conversation_participants" USING "btree" ("conversation_id");



CREATE INDEX "conv_participants_user_id_idx" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "conversations_created_by_idx" ON "public"."conversations" USING "btree" ("created_by");



CREATE INDEX "conversations_updated_at_idx" ON "public"."conversations" USING "btree" ("updated_at" DESC);



CREATE INDEX "email_log_campaign_id_idx" ON "public"."email_log" USING "btree" ("campaign_id");



CREATE INDEX "email_log_resend_message_id_idx" ON "public"."email_log" USING "btree" ("resend_message_id");



CREATE INDEX "event_inquiries_event_id_idx" ON "public"."event_inquiries" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "event_inquiries_partner_id_idx" ON "public"."event_inquiries" USING "btree" ("partner_id");



CREATE INDEX "event_inquiry_messages_inquiry_id_idx" ON "public"."event_inquiry_messages" USING "btree" ("inquiry_id");



CREATE INDEX "event_suggestions_created_at_idx" ON "public"."event_suggestions" USING "btree" ("created_at" DESC);



CREATE INDEX "event_suggestions_is_read_idx" ON "public"."event_suggestions" USING "btree" ("is_read");



CREATE INDEX "events_eventbrite_event_id_idx" ON "public"."events" USING "btree" ("eventbrite_event_id");



CREATE INDEX "hashtag_mentions_monitor_idx" ON "public"."hashtag_mentions" USING "btree" ("monitor_id");



CREATE INDEX "hashtag_monitors_workspace_idx" ON "public"."hashtag_monitors" USING "btree" ("workspace_id");



CREATE INDEX "hub_members_hub_id_idx" ON "public"."hub_members" USING "btree" ("hub_id");



CREATE INDEX "hub_members_user_id_idx" ON "public"."hub_members" USING "btree" ("user_id");



CREATE INDEX "hub_post_comments_post_id_idx" ON "public"."hub_post_comments" USING "btree" ("hub_post_id");



CREATE INDEX "hub_post_likes_post_id_idx" ON "public"."hub_post_likes" USING "btree" ("hub_post_id");



CREATE INDEX "hub_posts_active_idx" ON "public"."hub_posts" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "hub_posts_author_id_idx" ON "public"."hub_posts" USING "btree" ("author_id");



CREATE INDEX "hub_posts_hub_id_idx" ON "public"."hub_posts" USING "btree" ("hub_id");



CREATE INDEX "hub_resources_hub_id_idx" ON "public"."hub_resources" USING "btree" ("hub_id");



CREATE INDEX "hub_resources_uploaded_by_idx" ON "public"."hub_resources" USING "btree" ("uploaded_by");



CREATE INDEX "idx_admin_tasks_archived_at" ON "public"."admin_tasks" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "idx_admin_tasks_deleted_at" ON "public"."admin_tasks" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_apple_wallet_reg_serial" ON "public"."apple_wallet_registrations" USING "btree" ("serial_number");



CREATE INDEX "idx_blog_posts_published_at" ON "public"."blog_posts" USING "btree" ("published_at");



CREATE INDEX "idx_blog_posts_slug" ON "public"."blog_posts" USING "btree" ("slug");



CREATE INDEX "idx_blog_posts_status" ON "public"."blog_posts" USING "btree" ("status");



CREATE INDEX "idx_blog_posts_tags" ON "public"."blog_posts" USING "gin" ("tags");



CREATE INDEX "idx_business_applications_stripe_subscription_id" ON "public"."business_applications" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_contact_activity_contact" ON "public"."contact_activity" USING "btree" ("contact_id");



CREATE INDEX "idx_contact_activity_profile" ON "public"."contact_activity" USING "btree" ("profile_id");



CREATE INDEX "idx_contact_activity_type" ON "public"."contact_activity" USING "btree" ("activity_type");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_status" ON "public"."contacts" USING "btree" ("status");



CREATE INDEX "idx_contacts_type" ON "public"."contacts" USING "btree" ("contact_type");



CREATE INDEX "idx_conversation_participants_user" ON "public"."conversation_participants" USING "btree" ("user_id");



CREATE INDEX "idx_crm_conversions_source" ON "public"."crm_conversions" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_crm_conversions_type" ON "public"."crm_conversions" USING "btree" ("conversion_type");



CREATE INDEX "idx_crm_deals_contact" ON "public"."crm_deals" USING "btree" ("contact_id");



CREATE INDEX "idx_crm_deals_stage" ON "public"."crm_deals" USING "btree" ("stage");



CREATE INDEX "idx_drip_enrollments_next_send" ON "public"."drip_enrollments" USING "btree" ("next_send_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_drip_enrollments_status" ON "public"."drip_enrollments" USING "btree" ("status");



CREATE INDEX "idx_edc_event" ON "public"."event_discussion_comments" USING "btree" ("event_id");



CREATE INDEX "idx_edc_parent" ON "public"."event_discussion_comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_edc_post" ON "public"."event_discussion_comments" USING "btree" ("post_id", "created_at");



CREATE INDEX "idx_edl_event" ON "public"."event_discussion_likes" USING "btree" ("event_id");



CREATE INDEX "idx_edm_event" ON "public"."event_discussion_mentions" USING "btree" ("event_id");



CREATE INDEX "idx_edm_user" ON "public"."event_discussion_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_edp_event" ON "public"."event_discussion_posts" USING "btree" ("event_id", "created_at" DESC);



CREATE INDEX "idx_edph_event" ON "public"."event_discussion_photos" USING "btree" ("event_id", "created_at" DESC);



CREATE INDEX "idx_email_log_campaign" ON "public"."email_log" USING "btree" ("campaign_id");



CREATE INDEX "idx_email_log_scheduled" ON "public"."email_log" USING "btree" ("scheduled_for") WHERE ("status" = 'queued'::"text");



CREATE INDEX "idx_email_log_status" ON "public"."email_log" USING "btree" ("status");



CREATE INDEX "idx_email_log_to_email" ON "public"."email_log" USING "btree" ("to_email");



CREATE INDEX "idx_event_public_rsvps_contact_id" ON "public"."event_public_rsvps" USING "btree" ("contact_id");



CREATE INDEX "idx_event_public_rsvps_created_at" ON "public"."event_public_rsvps" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_event_public_rsvps_email" ON "public"."event_public_rsvps" USING "btree" ("lower"("email"));



CREATE INDEX "idx_event_public_rsvps_event_id" ON "public"."event_public_rsvps" USING "btree" ("event_id");



CREATE INDEX "idx_events_start_time" ON "public"."events" USING "btree" ("start_time");



CREATE INDEX "idx_events_tags" ON "public"."events" USING "gin" ("tags");



CREATE INDEX "idx_feed_comments_post_id" ON "public"."feed_comments" USING "btree" ("post_id");



CREATE INDEX "idx_feed_likes_post_id" ON "public"."feed_likes" USING "btree" ("post_id");



CREATE INDEX "idx_feed_posts_created_at" ON "public"."feed_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_feed_posts_feed_type" ON "public"."feed_posts" USING "btree" ("feed_type");



CREATE INDEX "idx_feed_posts_user_id" ON "public"."feed_posts" USING "btree" ("user_id");



CREATE INDEX "idx_guest_passes_member_month" ON "public"."guest_passes" USING "btree" ("member_id", "month_year");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_onboarding_responses_completed_at" ON "public"."onboarding_responses" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_onboarding_responses_responses_gin" ON "public"."onboarding_responses" USING "gin" ("responses");



CREATE INDEX "idx_onboarding_responses_user_id" ON "public"."onboarding_responses" USING "btree" ("user_id");



CREATE INDEX "idx_payments_created_at" ON "public"."payments" USING "btree" ("created_at");



CREATE INDEX "idx_payments_stripe_pi" ON "public"."payments" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_payments_user_id" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_application_status" ON "public"."profiles" USING "btree" ("application_status") WHERE ("application_status" IS NOT NULL);



CREATE INDEX "idx_profiles_canceled_at" ON "public"."profiles" USING "btree" ("canceled_at" DESC) WHERE ("canceled_at" IS NOT NULL);



CREATE INDEX "idx_profiles_deleted_at" ON "public"."profiles" USING "btree" ("deleted_at");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_is_banned" ON "public"."profiles" USING "btree" ("is_banned") WHERE ("is_banned" = true);



CREATE INDEX "idx_profiles_no_calendar_subscription" ON "public"."profiles" USING "btree" ("id") WHERE (("calendar_subscribed_social_at" IS NULL) AND ("calendar_subscribed_business_at" IS NULL) AND ("calendar_subscribed_all_at" IS NULL) AND ("calendar_prompt_dismissed_at" IS NULL));



CREATE INDEX "idx_profiles_search" ON "public"."profiles" USING "gin" ("full_name" "public"."gin_trgm_ops", "email" "public"."gin_trgm_ops");



CREATE INDEX "idx_profiles_search_trigram" ON "public"."profiles" USING "gin" (((("full_name" || ' '::"text") || "email")) "public"."gin_trgm_ops");



CREATE INDEX "idx_profiles_stripe_cust" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_profiles_stripe_customer_id" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_profiles_subscription_status" ON "public"."profiles" USING "btree" ("subscription_status");



CREATE INDEX "idx_rate_limits_key_window" ON "public"."rate_limits" USING "btree" ("key", "window_start");



CREATE INDEX "idx_tickets_event_id" ON "public"."tickets" USING "btree" ("event_id");



CREATE INDEX "idx_tickets_event_status" ON "public"."tickets" USING "btree" ("event_id", "status");



CREATE INDEX "idx_tickets_stripe_payment" ON "public"."tickets" USING "btree" ("stripe_payment_id") WHERE ("stripe_payment_id" IS NOT NULL);



CREATE INDEX "idx_user_roles_user_role" ON "public"."user_roles" USING "btree" ("user_id", "role");



CREATE INDEX "idx_utm_tracking_campaign" ON "public"."utm_tracking" USING "btree" ("utm_campaign");



CREATE INDEX "introductions_pending_approval" ON "public"."introductions" USING "btree" ("created_at") WHERE ("status" = 'pending_approval'::"text");



CREATE INDEX "introductions_requester" ON "public"."introductions" USING "btree" ("requester_person_id");



CREATE INDEX "introductions_status" ON "public"."introductions" USING "btree" ("status");



CREATE INDEX "introductions_target" ON "public"."introductions" USING "btree" ("target_person_id");



CREATE INDEX "messages_conversation_id_idx" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "messages_created_at_idx" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "messages_sender_id_idx" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "notifications_undismissed_idx" ON "public"."notifications" USING "btree" ("user_id") WHERE ("is_dismissed" = false);



CREATE UNIQUE INDEX "one_active_credential_per_person_per_event" ON "public"."attendance_credentials" USING "btree" ("person_id", "event_id") WHERE (("event_id" IS NOT NULL) AND ("status" = 'active'::"text"));



CREATE UNIQUE INDEX "one_active_member_credential_per_person" ON "public"."attendance_credentials" USING "btree" ("person_id") WHERE (("credential_type" = 'member'::"text") AND ("status" = 'active'::"text") AND ("event_id" IS NULL));



CREATE INDEX "partner_applications_invite_id_idx" ON "public"."partner_applications" USING "btree" ("invite_id") WHERE ("invite_id" IS NOT NULL);



CREATE INDEX "partner_applications_status_idx" ON "public"."partner_applications" USING "btree" ("status");



CREATE INDEX "partner_applications_user_id_idx" ON "public"."partner_applications" USING "btree" ("user_id");



CREATE INDEX "partner_invites_created_by_idx" ON "public"."partner_invites" USING "btree" ("created_by");



CREATE INDEX "partner_invites_email_idx" ON "public"."partner_invites" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "partner_invoices_partner_id_idx" ON "public"."partner_invoices" USING "btree" ("partner_id");



CREATE INDEX "partner_listings_featured_idx" ON "public"."partner_listings" USING "btree" ("is_featured", "featured_order") WHERE ("is_featured" = true);



CREATE INDEX "people_canceled_at" ON "public"."people" USING "btree" ("canceled_at") WHERE ("canceled_at" IS NOT NULL);



CREATE UNIQUE INDEX "people_email_lower_unique" ON "public"."people" USING "btree" ("email_lower");



CREATE INDEX "people_last_attended" ON "public"."people" USING "btree" ("last_attended") WHERE ("last_attended" IS NOT NULL);



CREATE INDEX "people_member_status" ON "public"."people" USING "btree" ("member_status") WHERE ("member_status" IS NOT NULL);



CREATE INDEX "people_member_tier" ON "public"."people" USING "btree" ("member_tier") WHERE ("member_tier" IS NOT NULL);



CREATE INDEX "people_referred_by" ON "public"."people" USING "btree" ("referred_by_person_id") WHERE ("referred_by_person_id" IS NOT NULL);



CREATE INDEX "people_roles_gin" ON "public"."people" USING "gin" ("roles");



CREATE INDEX "post_comments_author_id_idx" ON "public"."post_comments" USING "btree" ("author_id");



CREATE INDEX "post_comments_post_id_idx" ON "public"."post_comments" USING "btree" ("post_id");



CREATE INDEX "post_likes_post_id_idx" ON "public"."post_likes" USING "btree" ("post_id");



CREATE INDEX "post_likes_user_id_idx" ON "public"."post_likes" USING "btree" ("user_id");



CREATE INDEX "post_mentions_mentioned_user_idx" ON "public"."post_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "post_mentions_post_id_idx" ON "public"."post_mentions" USING "btree" ("post_id");



CREATE INDEX "posts_active_idx" ON "public"."posts" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "posts_author_id_idx" ON "public"."posts" USING "btree" ("author_id");



CREATE INDEX "posts_created_at_idx" ON "public"."posts" USING "btree" ("created_at" DESC);



CREATE INDEX "posts_feed_type_idx" ON "public"."posts" USING "btree" ("feed_type");



CREATE INDEX "profiles_is_banned_idx" ON "public"."profiles" USING "btree" ("is_banned");



CREATE INDEX "profiles_is_internal_idx" ON "public"."profiles" USING "btree" ("is_internal");



CREATE INDEX "profiles_last_attended_at_idx" ON "public"."profiles" USING "btree" ("last_attended_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "profiles_referred_by_ambassador_idx" ON "public"."profiles" USING "btree" ("referred_by_ambassador_id") WHERE ("referred_by_ambassador_id" IS NOT NULL);



CREATE INDEX "social_account_metrics_account_idx" ON "public"."social_account_metrics" USING "btree" ("social_account_id");



CREATE INDEX "social_account_metrics_date_idx" ON "public"."social_account_metrics" USING "btree" ("date");



CREATE INDEX "social_accounts_workspace_id_idx" ON "public"."social_accounts" USING "btree" ("workspace_id");



CREATE INDEX "social_inbox_account_idx" ON "public"."social_inbox_messages" USING "btree" ("social_account_id");



CREATE INDEX "social_inbox_status_idx" ON "public"."social_inbox_messages" USING "btree" ("status");



CREATE INDEX "social_inbox_workspace_idx" ON "public"."social_inbox_messages" USING "btree" ("workspace_id");



CREATE INDEX "social_post_metrics_post_id_idx" ON "public"."social_post_metrics" USING "btree" ("post_id");



CREATE INDEX "social_posts_scheduled_at_idx" ON "public"."social_posts" USING "btree" ("scheduled_at");



CREATE INDEX "social_posts_status_idx" ON "public"."social_posts" USING "btree" ("status");



CREATE INDEX "social_posts_workspace_id_idx" ON "public"."social_posts" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "tickets_guest_email_event_unique" ON "public"."tickets" USING "btree" ("event_id", "lower"("guest_email")) WHERE (("guest_email" IS NOT NULL) AND ("status" <> 'cancelled'::"text") AND ("created_at" >= '2026-05-17 00:00:00+00'::timestamp with time zone));



CREATE UNIQUE INDEX "uq_edl_comment" ON "public"."event_discussion_likes" USING "btree" ("comment_id", "user_id") WHERE ("comment_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_edl_post" ON "public"."event_discussion_likes" USING "btree" ("post_id", "user_id") WHERE ("post_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "admin_messages_bump_conv_updated" AFTER INSERT ON "public"."admin_messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_admin_conversation_timestamp"();



CREATE OR REPLACE TRIGGER "blog_posts_touch_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_blog_posts_updated_at"();



CREATE OR REPLACE TRIGGER "enforce_event_capacity" BEFORE INSERT ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."check_event_capacity_trigger"();



CREATE OR REPLACE TRIGGER "hashtag_monitors_touch_updated_at" BEFORE UPDATE ON "public"."hashtag_monitors" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "saved_reply_templates_touch_updated_at" BEFORE UPDATE ON "public"."saved_reply_templates" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "set_onboarding_responses_updated_at" BEFORE UPDATE ON "public"."onboarding_responses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "social_accounts_touch_updated_at" BEFORE UPDATE ON "public"."social_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "social_inbox_messages_touch_updated_at" BEFORE UPDATE ON "public"."social_inbox_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "social_post_metrics_touch_updated_at" BEFORE UPDATE ON "public"."social_post_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "social_posts_touch_updated_at" BEFORE UPDATE ON "public"."social_posts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_social_updated_at"();



CREATE OR REPLACE TRIGGER "sync_profile_application_status_trigger" AFTER INSERT OR UPDATE OF "status" ON "public"."business_applications" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_application_status"();



CREATE OR REPLACE TRIGGER "trg_ambassadors_updated_at" BEFORE UPDATE ON "public"."ambassadors" FOR EACH ROW EXECUTE FUNCTION "public"."update_ambassadors_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_waitlist_position" BEFORE INSERT ON "public"."event_waitlist" FOR EACH ROW EXECUTE FUNCTION "public"."assign_waitlist_position"();



CREATE OR REPLACE TRIGGER "trg_check_event_capacity_public_rsvps" BEFORE INSERT OR UPDATE ON "public"."event_public_rsvps" FOR EACH ROW EXECUTE FUNCTION "public"."check_event_capacity_public_rsvps"();



CREATE OR REPLACE TRIGGER "trg_check_event_capacity_tickets" BEFORE INSERT OR UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."check_event_capacity_tickets"();



CREATE OR REPLACE TRIGGER "trg_contact_notes_updated_at" BEFORE UPDATE ON "public"."contact_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_contact_notes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_event_capacity" BEFORE INSERT OR UPDATE OF "status" ON "public"."attendance_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_event_capacity"();



CREATE OR REPLACE TRIGGER "trg_event_public_rsvps_updated_at" BEFORE UPDATE ON "public"."event_public_rsvps" FOR EACH ROW EXECUTE FUNCTION "public"."update_event_public_rsvps_updated_at"();



CREATE OR REPLACE TRIGGER "trg_people_member_column_guard" BEFORE UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_people_member_column_guard"();



CREATE OR REPLACE TRIGGER "trg_update_last_attended" AFTER INSERT OR UPDATE OF "checked_in_at" ON "public"."attendance_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_person_last_attended"();



CREATE OR REPLACE TRIGGER "trg_update_last_attended_from_public_rsvp" AFTER INSERT OR UPDATE OF "checked_in_at" ON "public"."event_public_rsvps" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_last_attended_from_public_rsvp"();



CREATE OR REPLACE TRIGGER "trg_update_last_attended_from_ticket" AFTER INSERT OR UPDATE OF "checked_in_at" ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_last_attended_from_ticket"();



CREATE OR REPLACE TRIGGER "update_admin_tasks_updated_at" BEFORE UPDATE ON "public"."admin_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_applications_updated_at" BEFORE UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_blog_posts_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_business_applications_updated_at" BEFORE UPDATE ON "public"."business_applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_integrations_updated_at" BEFORE UPDATE ON "public"."integrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_organization_settings_updated_at" BEFORE UPDATE ON "public"."organization_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_org_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_conversation_participants"
    ADD CONSTRAINT "admin_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."admin_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_conversation_participants"
    ADD CONSTRAINT "admin_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_conversations"
    ADD CONSTRAINT "admin_conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_conversations"
    ADD CONSTRAINT "admin_conversations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_messages"
    ADD CONSTRAINT "admin_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."admin_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_messages"
    ADD CONSTRAINT "admin_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_requests"
    ADD CONSTRAINT "admin_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."admin_requests"
    ADD CONSTRAINT "admin_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_resources"
    ADD CONSTRAINT "admin_resources_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_task_comments"
    ADD CONSTRAINT "admin_task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."admin_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_task_comments"
    ADD CONSTRAINT "admin_task_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_tasks"
    ADD CONSTRAINT "admin_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_memory"
    ADD CONSTRAINT "agent_memory_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."ambassador_payouts"
    ADD CONSTRAINT "ambassador_payouts_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ambassador_payouts"
    ADD CONSTRAINT "ambassador_payouts_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."ambassador_referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_ambassador_person_id_fkey" FOREIGN KEY ("ambassador_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_referred_person_id_fkey" FOREIGN KEY ("referred_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."ambassador_referrals"
    ADD CONSTRAINT "ambassador_referrals_referred_user_id_fkey" FOREIGN KEY ("referred_profile_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."apple_wallet_passes"
    ADD CONSTRAINT "apple_wallet_passes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."apple_wallet_registrations"
    ADD CONSTRAINT "apple_wallet_registrations_serial_number_fkey" FOREIGN KEY ("serial_number") REFERENCES "public"."apple_wallet_passes"("serial_number") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_credentials"
    ADD CONSTRAINT "attendance_credentials_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."attendance_credentials"
    ADD CONSTRAINT "attendance_credentials_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."attendance_credentials"
    ADD CONSTRAINT "attendance_credentials_issued_by_person_id_fkey" FOREIGN KEY ("issued_by_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."attendance_credentials"
    ADD CONSTRAINT "attendance_credentials_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."best_time_to_post"
    ADD CONSTRAINT "best_time_to_post_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_applications"
    ADD CONSTRAINT "business_applications_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id");



ALTER TABLE ONLY "public"."business_applications"
    ADD CONSTRAINT "business_applications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_applications"
    ADD CONSTRAINT "business_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_cards"
    ADD CONSTRAINT "business_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_profiles"
    ADD CONSTRAINT "business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_surveys"
    ADD CONSTRAINT "cancellation_surveys_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_activity"
    ADD CONSTRAINT "contact_activity_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_activity"
    ADD CONSTRAINT "contact_activity_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contact_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contact_notes"
    ADD CONSTRAINT "contact_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_converted_to_member_id_fkey" FOREIGN KEY ("converted_to_member_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_ad_accounts"
    ADD CONSTRAINT "crm_ad_accounts_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_ad_performance"
    ADD CONSTRAINT "crm_ad_performance_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "public"."crm_ad_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_conversions"
    ADD CONSTRAINT "crm_conversions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_conversions"
    ADD CONSTRAINT "crm_conversions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_dashboard_widgets"
    ADD CONSTRAINT "crm_dashboard_widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "public"."crm_dashboards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_dashboards"
    ADD CONSTRAINT "crm_dashboards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_deals"
    ADD CONSTRAINT "crm_deals_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_deals"
    ADD CONSTRAINT "crm_deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_deals"
    ADD CONSTRAINT "crm_deals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_deals"
    ADD CONSTRAINT "crm_deals_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_form_fields"
    ADD CONSTRAINT "crm_form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."crm_forms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_form_submissions"
    ADD CONSTRAINT "crm_form_submissions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_form_submissions"
    ADD CONSTRAINT "crm_form_submissions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_form_submissions"
    ADD CONSTRAINT "crm_form_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."crm_forms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_forms"
    ADD CONSTRAINT "crm_forms_auto_enroll_drip_id_fkey" FOREIGN KEY ("auto_enroll_drip_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_forms"
    ADD CONSTRAINT "crm_forms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_renewal_reminders"
    ADD CONSTRAINT "crm_renewal_reminders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sequence_enrollments"
    ADD CONSTRAINT "crm_sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sequence_steps"
    ADD CONSTRAINT "crm_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sequences"
    ADD CONSTRAINT "crm_sequences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_survey_questions"
    ADD CONSTRAINT "crm_survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."crm_surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_survey_responses"
    ADD CONSTRAINT "crm_survey_responses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_survey_responses"
    ADD CONSTRAINT "crm_survey_responses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_survey_responses"
    ADD CONSTRAINT "crm_survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."crm_surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_surveys"
    ADD CONSTRAINT "crm_surveys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_surveys"
    ADD CONSTRAINT "crm_surveys_trigger_event_id_fkey" FOREIGN KEY ("trigger_event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drip_campaigns"
    ADD CONSTRAINT "drip_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drip_enrollments"
    ADD CONSTRAINT "drip_enrollments_drip_campaign_id_fkey" FOREIGN KEY ("drip_campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_steps"
    ADD CONSTRAINT "drip_steps_drip_campaign_id_fkey" FOREIGN KEY ("drip_campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_audience_event_id_fkey" FOREIGN KEY ("audience_event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_drip_enrollment_id_fkey" FOREIGN KEY ("drip_enrollment_id") REFERENCES "public"."drip_enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_discussion_comments"
    ADD CONSTRAINT "event_discussion_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_comments"
    ADD CONSTRAINT "event_discussion_comments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_comments"
    ADD CONSTRAINT "event_discussion_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."event_discussion_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_comments"
    ADD CONSTRAINT "event_discussion_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."event_discussion_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_likes"
    ADD CONSTRAINT "event_discussion_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."event_discussion_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_likes"
    ADD CONSTRAINT "event_discussion_likes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_likes"
    ADD CONSTRAINT "event_discussion_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."event_discussion_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_likes"
    ADD CONSTRAINT "event_discussion_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."event_discussion_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_mentioned_by_id_fkey" FOREIGN KEY ("mentioned_by_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_mentions"
    ADD CONSTRAINT "event_discussion_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."event_discussion_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_photos"
    ADD CONSTRAINT "event_discussion_photos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_discussion_photos"
    ADD CONSTRAINT "event_discussion_photos_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."event_discussion_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_discussion_photos"
    ADD CONSTRAINT "event_discussion_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_posts"
    ADD CONSTRAINT "event_discussion_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."event_discussion_posts"
    ADD CONSTRAINT "event_discussion_posts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_inquiries"
    ADD CONSTRAINT "event_inquiries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_inquiries"
    ADD CONSTRAINT "event_inquiries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_inquiry_messages"
    ADD CONSTRAINT "event_inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."event_inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_inquiry_messages"
    ADD CONSTRAINT "event_inquiry_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_public_rsvps"
    ADD CONSTRAINT "event_public_rsvps_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_public_rsvps"
    ADD CONSTRAINT "event_public_rsvps_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_public_rsvps"
    ADD CONSTRAINT "event_public_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_suggestions"
    ADD CONSTRAINT "event_suggestions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_suggestions"
    ADD CONSTRAINT "event_suggestions_read_by_fkey" FOREIGN KEY ("read_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_waitlist"
    ADD CONSTRAINT "event_waitlist_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_comments"
    ADD CONSTRAINT "feed_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_likes"
    ADD CONSTRAINT "feed_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_mutes"
    ADD CONSTRAINT "feed_mutes_muted_user_id_fkey" FOREIGN KEY ("muted_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_mutes"
    ADD CONSTRAINT "feed_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_posts"
    ADD CONSTRAINT "feed_posts_shadow_hidden_by_fkey" FOREIGN KEY ("shadow_hidden_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feed_posts"
    ADD CONSTRAINT "feed_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_shares"
    ADD CONSTRAINT "feed_shares_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_shares"
    ADD CONSTRAINT "feed_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_event_notifications"
    ADD CONSTRAINT "guest_event_notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_pass_events"
    ADD CONSTRAINT "guest_pass_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_pass_events"
    ADD CONSTRAINT "guest_pass_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_pass_events"
    ADD CONSTRAINT "guest_pass_events_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_passes"
    ADD CONSTRAINT "guest_passes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."hashtag_mentions"
    ADD CONSTRAINT "hashtag_mentions_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "public"."hashtag_monitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hashtag_monitors"
    ADD CONSTRAINT "hashtag_monitors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."homepage_images"
    ADD CONSTRAINT "homepage_images_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_post_comments"
    ADD CONSTRAINT "hub_post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_post_comments"
    ADD CONSTRAINT "hub_post_comments_hub_post_id_fkey" FOREIGN KEY ("hub_post_id") REFERENCES "public"."hub_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_post_likes"
    ADD CONSTRAINT "hub_post_likes_hub_post_id_fkey" FOREIGN KEY ("hub_post_id") REFERENCES "public"."hub_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_post_likes"
    ADD CONSTRAINT "hub_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_posts"
    ADD CONSTRAINT "hub_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_posts"
    ADD CONSTRAINT "hub_posts_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_resources"
    ADD CONSTRAINT "hub_resources_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_resources"
    ADD CONSTRAINT "hub_resources_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hubs"
    ADD CONSTRAINT "hubs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."introductions"
    ADD CONSTRAINT "introductions_approved_by_person_id_fkey" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."introductions"
    ADD CONSTRAINT "introductions_requester_person_id_fkey" FOREIGN KEY ("requester_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."introductions"
    ADD CONSTRAINT "introductions_target_person_id_fkey" FOREIGN KEY ("target_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_responses"
    ADD CONSTRAINT "onboarding_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."partner_applications"
    ADD CONSTRAINT "partner_applications_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "public"."partner_invites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_applications"
    ADD CONSTRAINT "partner_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_applications"
    ADD CONSTRAINT "partner_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_invites"
    ADD CONSTRAINT "partner_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_invoices"
    ADD CONSTRAINT "partner_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_invoices"
    ADD CONSTRAINT "partner_invoices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_invoices"
    ADD CONSTRAINT "partner_invoices_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_invoices"
    ADD CONSTRAINT "partner_invoices_waived_by_fkey" FOREIGN KEY ("waived_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partner_listings"
    ADD CONSTRAINT "partner_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_referred_by_person_id_fkey" FOREIGN KEY ("referred_by_person_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_ambassador_referral_id_fkey" FOREIGN KEY ("ambassador_referral_id") REFERENCES "public"."ambassador_referrals"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_ambassador_id_fkey" FOREIGN KEY ("referred_by_ambassador_id") REFERENCES "public"."ambassadors"("id");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."saved_reply_templates"
    ADD CONSTRAINT "saved_reply_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_reply_templates"
    ADD CONSTRAINT "saved_reply_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_account_metrics"
    ADD CONSTRAINT "social_account_metrics_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_parent_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "public"."social_inbox_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_inbox_messages"
    ADD CONSTRAINT "social_inbox_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_inbox_replies"
    ADD CONSTRAINT "social_inbox_replies_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."social_inbox_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_inbox_replies"
    ADD CONSTRAINT "social_inbox_replies_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_parent_fkey" FOREIGN KEY ("parent_post_id") REFERENCES "public"."social_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sponsors_vendors"
    ADD CONSTRAINT "sponsors_vendors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."utm_tracking"
    ADD CONSTRAINT "utm_tracking_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."utm_tracking"
    ADD CONSTRAINT "utm_tracking_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can create events" ON "public"."events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can create task comments" ON "public"."admin_task_comments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can create tasks" ON "public"."admin_tasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can delete applications" ON "public"."applications" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can delete events" ON "public"."events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can delete partners" ON "public"."partners" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can delete task comments" ON "public"."admin_task_comments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can delete tasks" ON "public"."admin_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can insert organization settings" ON "public"."organization_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can insert partners" ON "public"."partners" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can insert tickets" ON "public"."tickets" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can manage admin users" ON "public"."admin_users" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can manage all waitlist entries" ON "public"."event_waitlist" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can manage contact tags" ON "public"."contact_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Admins can manage prospects" ON "public"."prospects" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can manage sponsors_vendors" ON "public"."sponsors_vendors" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can read all public RSVPs" ON "public"."event_public_rsvps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can read applications" ON "public"."business_applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can read suggestions" ON "public"."event_suggestions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can update all guest passes" ON "public"."guest_passes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")));



CREATE POLICY "Admins can update applications" ON "public"."applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update applications" ON "public"."business_applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can update events" ON "public"."events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update organization settings" ON "public"."organization_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update partners" ON "public"."partners" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update public RSVPs" ON "public"."event_public_rsvps" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update requests" ON "public"."admin_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update tasks" ON "public"."admin_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can update tickets" ON "public"."tickets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view admin users" ON "public"."admin_users" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all applications" ON "public"."applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all guest passes" ON "public"."guest_passes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all notifications" ON "public"."notifications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all partners" ON "public"."partners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")));



CREATE POLICY "Admins can view all requests" ON "public"."admin_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all task comments" ON "public"."admin_task_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all tasks" ON "public"."admin_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view all tickets" ON "public"."tickets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Admins can view guest pass events" ON "public"."guest_pass_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Admins can view organization settings" ON "public"."organization_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Allow guest ticket creation" ON "public"."tickets" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("user_id" IS NULL) AND ("guest_email" IS NOT NULL)));



CREATE POLICY "Anyone can apply" ON "public"."business_applications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert public RSVPs" ON "public"."event_public_rsvps" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can view events" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Anyone can view homepage images" ON "public"."homepage_images" FOR SELECT USING (true);



CREATE POLICY "Anyone can view published blog posts" ON "public"."blog_posts" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Authenticated users can create admin requests" ON "public"."admin_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can suggest" ON "public"."event_suggestions" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Deny all access for anon" ON "public"."processed_webhook_events" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "Deny all access for authenticated" ON "public"."processed_webhook_events" AS RESTRICTIVE TO "authenticated" USING (false);



CREATE POLICY "Members can insert own guest passes" ON "public"."guest_passes" FOR INSERT WITH CHECK ((("auth"."uid"() = "member_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Members can update own guest passes" ON "public"."guest_passes" FOR UPDATE USING ((("auth"."uid"() = "member_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Members can view other member profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Members can view own guest passes" ON "public"."guest_passes" FOR SELECT USING ((("auth"."uid"() = "member_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Only admins can manage integrations" ON "public"."integrations" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Super admins can delete suggestions" ON "public"."event_suggestions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Super admins can read all payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text") AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "Users can create own tickets" ON "public"."tickets" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "tickets"."event_id") AND (("e"."access_level_deprecated" IS NULL) OR ("e"."access_level_deprecated" = 'all'::"text"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("e"."id" = "tickets"."event_id") AND ("e"."access_level_deprecated" = 'business_only'::"text") AND ("p"."member_type" = 'business'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("e"."id" = "tickets"."event_id") AND ("e"."access_level_deprecated" = 'social_only'::"text") AND ("p"."member_type" = ANY (ARRAY['social'::"text", 'business'::"text"]))))))));



CREATE POLICY "Users can insert own applications" ON "public"."applications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can join waitlist" ON "public"."event_waitlist" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can leave waitlist" ON "public"."event_waitlist" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can read own applications" ON "public"."business_applications" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can read own payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can update own applications" ON "public"."business_applications" FOR UPDATE USING (("auth"."uid"() = "profile_id")) WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update own calendar_token" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own tickets" ON "public"."tickets" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can view own applications" ON "public"."applications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can view own partner record" ON "public"."partners" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own tickets" ON "public"."tickets" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



CREATE POLICY "Users can view own waitlist entries" ON "public"."event_waitlist" FOR SELECT USING ((("auth"."uid"() = "user_id") AND "public"."is_active_user"("auth"."uid"())));



ALTER TABLE "public"."_auth_backup_20260428" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_auth_identities_backup_20260428" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ac_admin_write" ON "public"."attendance_credentials" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "ac_select_own_or_admin" ON "public"."attendance_credentials" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."people" "p"
  WHERE (("p"."id" = "attendance_credentials"."person_id") AND (("p"."metadata" ->> 'profile_id'::"text") = ("auth"."uid"())::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "admin_all_contact_activity" ON "public"."contact_activity" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_contact_tags" ON "public"."contact_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_contacts" ON "public"."contacts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_ad_accounts" ON "public"."crm_ad_accounts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_ad_performance" ON "public"."crm_ad_performance" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_conversions" ON "public"."crm_conversions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_dashboard_widgets" ON "public"."crm_dashboard_widgets" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_dashboards" ON "public"."crm_dashboards" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_deals" ON "public"."crm_deals" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_form_fields" ON "public"."crm_form_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_form_submissions" ON "public"."crm_form_submissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_forms" ON "public"."crm_forms" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_renewal_reminders" ON "public"."crm_renewal_reminders" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_sequence_enrollments" ON "public"."crm_sequence_enrollments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_sequence_steps" ON "public"."crm_sequence_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_sequences" ON "public"."crm_sequences" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_survey_questions" ON "public"."crm_survey_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_survey_responses" ON "public"."crm_survey_responses" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_crm_surveys" ON "public"."crm_surveys" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_drip_campaigns" ON "public"."drip_campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_drip_enrollments" ON "public"."drip_enrollments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_drip_steps" ON "public"."drip_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_email_campaigns" ON "public"."email_campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_email_log" ON "public"."email_log" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_email_templates" ON "public"."email_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_all_homepage_images" ON "public"."homepage_images" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "admin_all_utm_tracking" ON "public"."utm_tracking" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "admin_conv_participants_delete" ON "public"."admin_conversation_participants" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "admin_conv_participants_insert" ON "public"."admin_conversation_participants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "admin_conv_participants_select" ON "public"."admin_conversation_participants" FOR SELECT USING (("public"."is_admin_conversation_participant"("conversation_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "admin_conv_participants_update" ON "public"."admin_conversation_participants" FOR UPDATE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."admin_conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_conversations_insert" ON "public"."admin_conversations" FOR INSERT WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "admin_conversations_select" ON "public"."admin_conversations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_conversation_participant"("id")));



CREATE POLICY "admin_conversations_update" ON "public"."admin_conversations" FOR UPDATE USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_conversation_participant"("id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_conversation_participant"("id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."admin_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_messages_insert" ON "public"."admin_messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_admin_conversation_participant"("conversation_id")));



CREATE POLICY "admin_messages_select" ON "public"."admin_messages" FOR SELECT USING ((("deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR "public"."is_admin_conversation_participant"("conversation_id"))));



CREATE POLICY "admin_read_cancellation_surveys" ON "public"."cancellation_surveys" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "admin_read_write_financial_cache" ON "public"."financial_cache" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."admin_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_resources_all" ON "public"."admin_resources" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."admin_task_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_memory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_memory_admin_only" ON "public"."agent_memory" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."ambassador_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ambassador_payouts_admin_all" ON "public"."ambassador_payouts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



ALTER TABLE "public"."ambassador_referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ambassador_referrals_admin_all" ON "public"."ambassador_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "ambassador_referrals_owner_read" ON "public"."ambassador_referrals" FOR SELECT USING (("ambassador_id" IN ( SELECT "ambassadors"."id"
   FROM "public"."ambassadors"
  WHERE ("ambassadors"."profile_id" = "auth"."uid"()))));



ALTER TABLE "public"."ambassadors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ambassadors_admin_all" ON "public"."ambassadors" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "ambassadors_public_leaderboard" ON "public"."ambassadors" FOR SELECT USING (("is_active" = true));



CREATE POLICY "anon_deny_contact_activity" ON "public"."contact_activity" TO "anon" USING (false);



CREATE POLICY "anon_deny_contact_tags" ON "public"."contact_tags" TO "anon" USING (false);



CREATE POLICY "anon_deny_contacts" ON "public"."contacts" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_ad_accounts" ON "public"."crm_ad_accounts" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_ad_performance" ON "public"."crm_ad_performance" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_conversions" ON "public"."crm_conversions" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_dashboard_widgets" ON "public"."crm_dashboard_widgets" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_dashboards" ON "public"."crm_dashboards" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_deals" ON "public"."crm_deals" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_form_fields" ON "public"."crm_form_fields" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_form_submissions" ON "public"."crm_form_submissions" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_forms" ON "public"."crm_forms" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_renewal_reminders" ON "public"."crm_renewal_reminders" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_sequence_enrollments" ON "public"."crm_sequence_enrollments" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_sequence_steps" ON "public"."crm_sequence_steps" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_sequences" ON "public"."crm_sequences" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_survey_questions" ON "public"."crm_survey_questions" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_survey_responses" ON "public"."crm_survey_responses" TO "anon" USING (false);



CREATE POLICY "anon_deny_crm_surveys" ON "public"."crm_surveys" TO "anon" USING (false);



CREATE POLICY "anon_deny_drip_campaigns" ON "public"."drip_campaigns" TO "anon" USING (false);



CREATE POLICY "anon_deny_drip_enrollments" ON "public"."drip_enrollments" TO "anon" USING (false);



CREATE POLICY "anon_deny_drip_steps" ON "public"."drip_steps" TO "anon" USING (false);



CREATE POLICY "anon_deny_email_campaigns" ON "public"."email_campaigns" TO "anon" USING (false);



CREATE POLICY "anon_deny_email_log" ON "public"."email_log" TO "anon" USING (false);



CREATE POLICY "anon_deny_email_templates" ON "public"."email_templates" TO "anon" USING (false);



CREATE POLICY "anon_deny_guest_passes" ON "public"."guest_passes" TO "anon" USING (false);



CREATE POLICY "anon_deny_payments" ON "public"."payments" TO "anon" USING (false);



CREATE POLICY "anon_deny_profiles" ON "public"."profiles" TO "anon" USING (false);



CREATE POLICY "anon_deny_utm_tracking" ON "public"."utm_tracking" TO "anon" USING (false);



ALTER TABLE "public"."apple_wallet_passes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apple_wallet_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_ambassador_referrals_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_attendance_credentials_20260610" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_business_applications_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_contacts_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_event_public_rsvps_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_events_stale_booleans_20260610" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_guest_passes_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_profiles_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_sauna_merge_credentials_20260610" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_sauna_merge_event_20260610" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_sauna_merge_tickets_20260610" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_tickets_presweep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."best_time_to_post" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "best_time_to_post_authenticated" ON "public"."best_time_to_post" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_posts_delete_admin" ON "public"."blog_posts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("p"."deleted_at" IS NULL)))));



CREATE POLICY "blog_posts_insert_admin" ON "public"."blog_posts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("p"."deleted_at" IS NULL)))));



CREATE POLICY "blog_posts_select_admin" ON "public"."blog_posts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("p"."deleted_at" IS NULL)))));



CREATE POLICY "blog_posts_select_published" ON "public"."blog_posts" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "blog_posts_update_admin" ON "public"."blog_posts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("p"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("p"."deleted_at" IS NULL)))));



ALTER TABLE "public"."business_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_cards_insert" ON "public"."business_cards" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "business_cards_select_owner" ON "public"."business_cards" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "business_cards_update" ON "public"."business_cards" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."business_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cancellation_surveys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_notes_admin_delete" ON "public"."contact_notes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "contact_notes_admin_insert" ON "public"."contact_notes" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))) AND ("author_id" = "auth"."uid"())));



CREATE POLICY "contact_notes_admin_select" ON "public"."contact_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



CREATE POLICY "contact_notes_admin_update" ON "public"."contact_notes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))));



ALTER TABLE "public"."contact_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conv_participants_insert" ON "public"."conversation_participants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_participants"."conversation_id") AND (("c"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."conversation_participants" "cp2"
          WHERE (("cp2"."conversation_id" = "conversation_participants"."conversation_id") AND ("cp2"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "conv_participants_select" ON "public"."conversation_participants" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "conv_participants_select_peers" ON "public"."conversation_participants" FOR SELECT USING ("public"."is_conversation_member"("conversation_id"));



CREATE POLICY "conv_participants_update" ON "public"."conversation_participants" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert" ON "public"."conversations" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true)) AND ("p"."deleted_at" IS NULL))))));



CREATE POLICY "conversations_select" ON "public"."conversations" FOR SELECT USING (("id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"()))));



CREATE POLICY "conversations_select_own_created" ON "public"."conversations" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "conversations_update" ON "public"."conversations" FOR UPDATE USING (("id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."crm_ad_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_ad_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_dashboard_widgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_dashboards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_form_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_form_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_forms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_renewal_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_sequence_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_sequence_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_survey_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_survey_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_surveys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_anon_business_profiles" ON "public"."business_profiles" TO "anon" USING (false);



CREATE POLICY "deny_anon_conversations" ON "public"."conversations" TO "anon" USING (false);



CREATE POLICY "deny_anon_feed_comments" ON "public"."feed_comments" TO "anon" USING (false);



CREATE POLICY "deny_anon_feed_likes" ON "public"."feed_likes" TO "anon" USING (false);



CREATE POLICY "deny_anon_feed_mutes" ON "public"."feed_mutes" TO "anon" USING (false);



CREATE POLICY "deny_anon_feed_posts" ON "public"."feed_posts" TO "anon" USING (false);



CREATE POLICY "deny_anon_feed_shares" ON "public"."feed_shares" TO "anon" USING (false);



CREATE POLICY "deny_anon_messages" ON "public"."messages" TO "anon" USING (false);



CREATE POLICY "deny_anon_participants" ON "public"."conversation_participants" TO "anon" USING (false);



ALTER TABLE "public"."drip_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drip_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drip_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "edc_insert" ON "public"."event_discussion_comments" FOR INSERT WITH CHECK (("public"."can_view_event_discussion"("event_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "edc_select" ON "public"."event_discussion_comments" FOR SELECT USING (("public"."can_view_event_discussion"("event_id") AND (("deleted_at" IS NULL) OR "public"."is_event_discussion_moderator"())));



CREATE POLICY "edc_update" ON "public"."event_discussion_comments" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"())) WITH CHECK ((("author_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"()));



CREATE POLICY "edl_delete" ON "public"."event_discussion_likes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "edl_insert" ON "public"."event_discussion_likes" FOR INSERT WITH CHECK (("public"."can_view_event_discussion"("event_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "edl_select" ON "public"."event_discussion_likes" FOR SELECT USING ("public"."can_view_event_discussion"("event_id"));



CREATE POLICY "edm_insert" ON "public"."event_discussion_mentions" FOR INSERT WITH CHECK (("public"."can_view_event_discussion"("event_id") AND ("mentioned_by_id" = "auth"."uid"())));



CREATE POLICY "edm_select" ON "public"."event_discussion_mentions" FOR SELECT USING ("public"."can_view_event_discussion"("event_id"));



CREATE POLICY "edp_insert" ON "public"."event_discussion_posts" FOR INSERT WITH CHECK (("public"."can_view_event_discussion"("event_id") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "edp_select" ON "public"."event_discussion_posts" FOR SELECT USING (("public"."can_view_event_discussion"("event_id") AND (("deleted_at" IS NULL) OR "public"."is_event_discussion_moderator"())));



CREATE POLICY "edp_update" ON "public"."event_discussion_posts" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"())) WITH CHECK ((("author_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"()));



CREATE POLICY "edph_insert" ON "public"."event_discussion_photos" FOR INSERT WITH CHECK (("public"."can_view_event_discussion"("event_id") AND ("uploader_id" = "auth"."uid"())));



CREATE POLICY "edph_select" ON "public"."event_discussion_photos" FOR SELECT USING (("public"."can_view_event_discussion"("event_id") AND (("deleted_at" IS NULL) OR "public"."is_event_discussion_moderator"())));



CREATE POLICY "edph_update" ON "public"."event_discussion_photos" FOR UPDATE USING ((("uploader_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"())) WITH CHECK ((("uploader_id" = "auth"."uid"()) OR "public"."is_event_discussion_moderator"()));



ALTER TABLE "public"."email_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discussion_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discussion_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discussion_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discussion_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_discussion_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_inquiries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_inquiries_insert" ON "public"."event_inquiries" FOR INSERT WITH CHECK ((("partner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "event_inquiries_select" ON "public"."event_inquiries" FOR SELECT USING ((("partner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "event_inquiries_update" ON "public"."event_inquiries" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."event_inquiry_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_inquiry_messages_insert" ON "public"."event_inquiry_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."event_inquiries" "ei"
  WHERE (("ei"."id" = "event_inquiry_messages"."inquiry_id") AND (("ei"."partner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))))))));



CREATE POLICY "event_inquiry_messages_select" ON "public"."event_inquiry_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."event_inquiries" "ei"
  WHERE (("ei"."id" = "event_inquiry_messages"."inquiry_id") AND (("ei"."partner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))))));



ALTER TABLE "public"."event_public_rsvps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_mutes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_event_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_pass_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_passes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hashtag_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hashtag_mentions_authenticated" ON "public"."hashtag_mentions" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."hashtag_monitors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hashtag_monitors_authenticated" ON "public"."hashtag_monitors" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."homepage_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hub_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_members_delete" ON "public"."hub_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "hub_members_insert" ON "public"."hub_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "hub_members_select" ON "public"."hub_members" FOR SELECT USING (("public"."is_hub_member"("hub_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hub_members_update" ON "public"."hub_members" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."hub_post_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_post_comments_delete" ON "public"."hub_post_comments" FOR DELETE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hub_post_comments_insert" ON "public"."hub_post_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM ("public"."hub_posts" "hp"
     JOIN "public"."hub_members" "hm" ON ((("hm"."hub_id" = "hp"."hub_id") AND ("hm"."user_id" = "auth"."uid"()))))
  WHERE ("hp"."id" = "hub_post_comments"."hub_post_id"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



CREATE POLICY "hub_post_comments_select" ON "public"."hub_post_comments" FOR SELECT USING ((("deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
   FROM ("public"."hub_posts" "hp"
     JOIN "public"."hub_members" "hm" ON ((("hm"."hub_id" = "hp"."hub_id") AND ("hm"."user_id" = "auth"."uid"()))))
  WHERE ("hp"."id" = "hub_post_comments"."hub_post_id"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



CREATE POLICY "hub_post_comments_update" ON "public"."hub_post_comments" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."hub_post_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_post_likes_delete" ON "public"."hub_post_likes" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hub_post_likes_insert" ON "public"."hub_post_likes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM ("public"."hub_posts" "hp"
     JOIN "public"."hub_members" "hm" ON ((("hm"."hub_id" = "hp"."hub_id") AND ("hm"."user_id" = "auth"."uid"()))))
  WHERE ("hp"."id" = "hub_post_likes"."hub_post_id"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



CREATE POLICY "hub_post_likes_select" ON "public"."hub_post_likes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."hub_posts" "hp"
     JOIN "public"."hub_members" "hm" ON ((("hm"."hub_id" = "hp"."hub_id") AND ("hm"."user_id" = "auth"."uid"()))))
  WHERE ("hp"."id" = "hub_post_likes"."hub_post_id"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."hub_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_posts_delete" ON "public"."hub_posts" FOR DELETE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hub_posts_insert" ON "public"."hub_posts" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."hub_id" = "hub_posts"."hub_id") AND ("hm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



CREATE POLICY "hub_posts_select" ON "public"."hub_posts" FOR SELECT USING ((("deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."hub_id" = "hub_posts"."hub_id") AND ("hm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))));



CREATE POLICY "hub_posts_update" ON "public"."hub_posts" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."hub_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_resources_delete" ON "public"."hub_resources" FOR DELETE USING ((("uploaded_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hub_resources_insert" ON "public"."hub_resources" FOR INSERT WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."hub_id" = "hub_resources"."hub_id") AND ("hm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "hub_resources_select" ON "public"."hub_resources" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."hub_id" = "hub_resources"."hub_id") AND ("hm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."hubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hubs_delete" ON "public"."hubs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "hubs_insert" ON "public"."hubs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "hubs_select" ON "public"."hubs" FOR SELECT USING (("public"."is_hub_member"("id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "hubs_update" ON "public"."hubs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intro_admin_write" ON "public"."introductions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "intro_select_party_or_admin" ON "public"."introductions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."people" "p"
  WHERE (("p"."id" = "introductions"."requester_person_id") AND (("p"."metadata" ->> 'profile_id'::"text") = ("auth"."uid"())::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."people" "p"
  WHERE (("p"."id" = "introductions"."target_person_id") AND (("p"."metadata" ->> 'profile_id'::"text") = ("auth"."uid"())::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."introductions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_insert_survey_responses" ON "public"."crm_survey_responses" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "members_read_feed_comments" ON "public"."feed_comments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "members_read_feed_likes" ON "public"."feed_likes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "members_read_feed_posts" ON "public"."feed_posts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "members_read_own_messages" ON "public"."messages" FOR SELECT TO "authenticated" USING (("conversation_id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"()))));



CREATE POLICY "members_see_own_conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"()))));



CREATE POLICY "members_see_own_participation" ON "public"."conversation_participants" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "members_send_messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("conversation_id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "members_view_business_profiles" ON "public"."business_profiles" FOR SELECT TO "authenticated" USING (("is_visible" = true));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("conversation_id" IN ( SELECT "conversation_participants"."conversation_id"
   FROM "public"."conversation_participants"
  WHERE ("conversation_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "messages"."conversation_id") AND ("cp"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE USING ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_participants" "cp"
  WHERE (("cp"."conversation_id" = "messages"."conversation_id") AND ("cp"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."onboarding_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_responses_delete" ON "public"."onboarding_responses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "onboarding_responses_insert" ON "public"."onboarding_responses" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "onboarding_responses_select" ON "public"."onboarding_responses" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "onboarding_responses_update" ON "public"."onboarding_responses" FOR UPDATE USING (((("user_id" = "auth"."uid"()) AND ("completed_at" IS NULL)) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))))) WITH CHECK (((("user_id" = "auth"."uid"()) AND ("completed_at" IS NULL)) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."organization_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_insert_cancellation_survey" ON "public"."cancellation_surveys" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."partner_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "partner_applications_insert" ON "public"."partner_applications" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "partner_applications_select" ON "public"."partner_applications" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "partner_applications_update_admin" ON "public"."partner_applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."partner_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "partner_invites_insert_admin" ON "public"."partner_invites" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "partner_invites_select_admin" ON "public"."partner_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "partner_invites_update_admin" ON "public"."partner_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."partner_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "partner_invoices_insert_admin" ON "public"."partner_invoices" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "partner_invoices_select" ON "public"."partner_invoices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "partner_invoices_update_admin" ON "public"."partner_invoices" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."partner_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "partner_listings_delete" ON "public"."partner_listings" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "partner_listings_insert" ON "public"."partner_listings" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "partner_listings_select" ON "public"."partner_listings" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("is_featured" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR (("is_published" = true) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (((("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true)) AND ("p"."member_type" = ANY (ARRAY['social'::"text", 'business'::"text"]))) OR ("p"."member_type" = ANY (ARRAY['partner'::"text", 'vendor'::"text", 'venue'::"text", 'sponsor'::"text"])) OR ("p"."partner_status" = 'approved'::"text"))))))));



CREATE POLICY "partner_listings_update" ON "public"."partner_listings" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people_delete_admin" ON "public"."people" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "people_insert_admin" ON "public"."people" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "people_select_own_or_admin" ON "public"."people" FOR SELECT USING (((("metadata" ->> 'profile_id'::"text") = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "people_update_own_or_admin" ON "public"."people" FOR UPDATE USING (((("metadata" ->> 'profile_id'::"text") = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."post_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_comments_delete" ON "public"."post_comments" FOR DELETE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "post_comments_insert" ON "public"."post_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "po"
  WHERE (("po"."id" = "post_comments"."post_id") AND ("po"."deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "p2"
          WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text")))))))))))));



CREATE POLICY "post_comments_select" ON "public"."post_comments" FOR SELECT USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "po"
  WHERE (("po"."id" = "post_comments"."post_id") AND ("po"."deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "p2"
          WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text")))))))))))));



CREATE POLICY "post_comments_update" ON "public"."post_comments" FOR UPDATE USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_likes_delete" ON "public"."post_likes" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "post_likes_insert" ON "public"."post_likes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."posts" "po"
  WHERE (("po"."id" = "post_likes"."post_id") AND ("po"."deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "p2"
          WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text")))))))))))));



CREATE POLICY "post_likes_select" ON "public"."post_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "po"
  WHERE (("po"."id" = "post_likes"."post_id") AND ("po"."deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "p2"
          WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text"))))))))))));



ALTER TABLE "public"."post_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_mentions_insert" ON "public"."post_mentions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."posts" "po"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("po"."id" = "post_mentions"."post_id") AND ("po"."deleted_at" IS NULL) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true)) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND ("p"."member_type" = 'business'::"text"))))))));



CREATE POLICY "post_mentions_select" ON "public"."post_mentions" FOR SELECT USING ((("mentioned_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."posts" "po"
  WHERE (("po"."id" = "post_mentions"."post_id") AND ("po"."deleted_at" IS NULL) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("po"."feed_type" = 'social'::"text") OR (("po"."feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "p2"
          WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text")))))))))))));



ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_delete" ON "public"."posts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "posts_insert" ON "public"."posts" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("feed_type" = 'social'::"text") OR (("feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p2"
  WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text"))))))))));



CREATE POLICY "posts_select" ON "public"."posts" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))) OR (("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."deleted_at" IS NULL) AND (("p"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p"."membership_override" = true))))) AND (("feed_type" = 'social'::"text") OR (("feed_type" = 'business'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p2"
  WHERE (("p2"."id" = "auth"."uid"()) AND ("p2"."deleted_at" IS NULL) AND (("p2"."subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text"])) OR ("p2"."membership_override" = true)) AND ("p2"."member_type" = 'business'::"text")))))))));



CREATE POLICY "posts_update" ON "public"."posts" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))) OR (("author_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])) AND ("profiles"."deleted_at" IS NULL)))) OR ("author_id" = "auth"."uid"())));



ALTER TABLE "public"."processed_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prospects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_insert_form_submissions" ON "public"."crm_form_submissions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "public_insert_utm" ON "public"."utm_tracking" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "public_read_active_homepage_images" ON "public"."homepage_images" FOR SELECT USING (("is_active" = true));



CREATE POLICY "public_read_form_fields" ON "public"."crm_form_fields" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."crm_forms"
  WHERE (("crm_forms"."id" = "crm_form_fields"."form_id") AND ("crm_forms"."status" = 'active'::"text")))));



CREATE POLICY "public_read_forms" ON "public"."crm_forms" FOR SELECT TO "authenticated", "anon" USING (("status" = 'active'::"text"));



ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_reply_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_reply_templates_authenticated" ON "public"."saved_reply_templates" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_only_guest_notifications" ON "public"."guest_event_notifications" USING (false) WITH CHECK (false);



CREATE POLICY "service_role_only_rate_limits" ON "public"."rate_limits" TO "service_role" USING (true);



CREATE POLICY "service_role_only_webhook_events" ON "public"."processed_webhook_events" USING (false) WITH CHECK (false);



ALTER TABLE "public"."social_account_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_account_metrics_authenticated" ON "public"."social_account_metrics" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_accounts_authenticated" ON "public"."social_accounts" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_inbox_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_inbox_messages_authenticated" ON "public"."social_inbox_messages" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_inbox_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_inbox_replies_authenticated" ON "public"."social_inbox_replies" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_post_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_post_metrics_authenticated" ON "public"."social_post_metrics" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_posts_authenticated" ON "public"."social_posts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "social_workspaces_authenticated" ON "public"."workspaces" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sponsors_vendors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_own_posts" ON "public"."feed_posts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_insert_own_posts" ON "public"."feed_posts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_business_profile" ON "public"."business_profiles" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_comments" ON "public"."feed_comments" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_likes" ON "public"."feed_likes" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_mutes" ON "public"."feed_mutes" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_shares" ON "public"."feed_shares" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_update_own_posts" ON "public"."feed_posts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_view_own_admin_requests" ON "public"."admin_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."utm_tracking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."assign_waitlist_position"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_waitlist_position"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_waitlist_position"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_admin_conversation_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_admin_conversation_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_admin_conversation_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_event_discussion"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_event_discussion"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_event_discussion"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_event_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_event_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_event_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_event_capacity_public_rsvps"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_event_capacity_public_rsvps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_event_capacity_public_rsvps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_event_capacity_tickets"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_event_capacity_tickets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_event_capacity_tickets"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_event_capacity_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_event_capacity_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_event_capacity_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_event_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_event_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_event_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_people_member_column_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_people_member_column_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_people_member_column_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ambassador_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_ambassador_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ambassador_by_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ambassador_leaderboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_ambassador_leaderboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ambassador_leaderboard"() TO "service_role";



GRANT ALL ON TABLE "public"."business_cards" TO "anon";
GRANT ALL ON TABLE "public"."business_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."business_cards" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_business_card_public"("pid" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_business_card_public"("pid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_business_card_public"("pid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_business_card_public"("pid" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_community_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_event_attendance_count"("p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_event_attendance_count"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_attendance_count"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_attendance_counts"("p_event_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_attendance_counts"("p_event_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_attendance_counts"("p_event_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_attendees"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_attendees"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_discussion_mentionable_ids"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_discussion_mentionable_ids"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_discussion_mentionable_ids"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_member_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_member_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_member_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_ambassador_leaderboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_ambassador_leaderboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_ambassador_leaderboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ticket_counts"("event_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_ticket_counts"("event_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ticket_counts"("event_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("user_uuid" "uuid", "role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("user_uuid" "uuid", "role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("user_uuid" "uuid", "role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_member"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_member"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_member"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_conversation_participant"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_event_discussion_moderator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_event_discussion_moderator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_event_discussion_moderator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_hub_member"("p_hub_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_event_discussion_mentionables"("p_event_id" "uuid", "p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_event_discussion_mentionables"("p_event_id" "uuid", "p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_event_discussion_mentionables"("p_event_id" "uuid", "p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_hub_path_valid"("path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_hub_path_valid"("path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_hub_path_valid"("path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."storage_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_is_hub_member_for_path"("path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_is_hub_member_for_path"("path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_is_hub_member_for_path"("path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_is_portal_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."storage_is_portal_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_is_portal_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_application_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_application_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_application_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_blog_posts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_blog_posts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_blog_posts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_social_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_social_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_social_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ambassadors_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ambassadors_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ambassadors_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contact_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contact_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contact_notes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_event_public_rsvps_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_event_public_rsvps_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_event_public_rsvps_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_org_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_org_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_person_last_attended"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_person_last_attended"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_person_last_attended"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_public_rsvp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_public_rsvp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_public_rsvp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profile_last_attended_from_ticket"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."_auth_backup_20260428" TO "anon";
GRANT ALL ON TABLE "public"."_auth_backup_20260428" TO "authenticated";
GRANT ALL ON TABLE "public"."_auth_backup_20260428" TO "service_role";



GRANT ALL ON TABLE "public"."_auth_identities_backup_20260428" TO "anon";
GRANT ALL ON TABLE "public"."_auth_identities_backup_20260428" TO "authenticated";
GRANT ALL ON TABLE "public"."_auth_identities_backup_20260428" TO "service_role";



GRANT ALL ON TABLE "public"."admin_conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."admin_conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."admin_conversations" TO "anon";
GRANT ALL ON TABLE "public"."admin_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."admin_messages" TO "anon";
GRANT ALL ON TABLE "public"."admin_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_messages" TO "service_role";



GRANT ALL ON TABLE "public"."admin_requests" TO "anon";
GRANT ALL ON TABLE "public"."admin_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_requests" TO "service_role";



GRANT ALL ON TABLE "public"."admin_resources" TO "anon";
GRANT ALL ON TABLE "public"."admin_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_resources" TO "service_role";



GRANT ALL ON TABLE "public"."admin_task_comments" TO "anon";
GRANT ALL ON TABLE "public"."admin_task_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_task_comments" TO "service_role";



GRANT ALL ON TABLE "public"."admin_tasks" TO "anon";
GRANT ALL ON TABLE "public"."admin_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."agent_memory" TO "anon";
GRANT ALL ON TABLE "public"."agent_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_memory" TO "service_role";



GRANT ALL ON TABLE "public"."ambassador_payouts" TO "anon";
GRANT ALL ON TABLE "public"."ambassador_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."ambassador_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."ambassador_referrals" TO "anon";
GRANT ALL ON TABLE "public"."ambassador_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."ambassador_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."ambassadors" TO "anon";
GRANT ALL ON TABLE "public"."ambassadors" TO "authenticated";
GRANT ALL ON TABLE "public"."ambassadors" TO "service_role";



GRANT ALL ON TABLE "public"."apple_wallet_passes" TO "anon";
GRANT ALL ON TABLE "public"."apple_wallet_passes" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_wallet_passes" TO "service_role";



GRANT ALL ON TABLE "public"."apple_wallet_registrations" TO "anon";
GRANT ALL ON TABLE "public"."apple_wallet_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."apple_wallet_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_credentials" TO "anon";
GRANT ALL ON TABLE "public"."attendance_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."backup_ambassador_referrals_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_ambassador_referrals_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_ambassador_referrals_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_attendance_credentials_20260610" TO "anon";
GRANT ALL ON TABLE "public"."backup_attendance_credentials_20260610" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_attendance_credentials_20260610" TO "service_role";



GRANT ALL ON TABLE "public"."backup_business_applications_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_business_applications_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_business_applications_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_contacts_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_contacts_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_contacts_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_event_public_rsvps_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_event_public_rsvps_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_event_public_rsvps_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_events_stale_booleans_20260610" TO "anon";
GRANT ALL ON TABLE "public"."backup_events_stale_booleans_20260610" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_events_stale_booleans_20260610" TO "service_role";



GRANT ALL ON TABLE "public"."backup_guest_passes_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_guest_passes_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_guest_passes_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_profiles_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_profiles_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_profiles_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."backup_sauna_merge_credentials_20260610" TO "anon";
GRANT ALL ON TABLE "public"."backup_sauna_merge_credentials_20260610" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_sauna_merge_credentials_20260610" TO "service_role";



GRANT ALL ON TABLE "public"."backup_sauna_merge_event_20260610" TO "anon";
GRANT ALL ON TABLE "public"."backup_sauna_merge_event_20260610" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_sauna_merge_event_20260610" TO "service_role";



GRANT ALL ON TABLE "public"."backup_sauna_merge_tickets_20260610" TO "anon";
GRANT ALL ON TABLE "public"."backup_sauna_merge_tickets_20260610" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_sauna_merge_tickets_20260610" TO "service_role";



GRANT ALL ON TABLE "public"."backup_tickets_presweep" TO "anon";
GRANT ALL ON TABLE "public"."backup_tickets_presweep" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_tickets_presweep" TO "service_role";



GRANT ALL ON TABLE "public"."best_time_to_post" TO "anon";
GRANT ALL ON TABLE "public"."best_time_to_post" TO "authenticated";
GRANT ALL ON TABLE "public"."best_time_to_post" TO "service_role";



GRANT ALL ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT ALL ON TABLE "public"."business_applications" TO "anon";
GRANT ALL ON TABLE "public"."business_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."business_applications" TO "service_role";



GRANT ALL ON TABLE "public"."business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."cancellation_surveys" TO "anon";
GRANT ALL ON TABLE "public"."cancellation_surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."cancellation_surveys" TO "service_role";



GRANT ALL ON TABLE "public"."contact_activity" TO "anon";
GRANT ALL ON TABLE "public"."contact_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_activity" TO "service_role";



GRANT ALL ON TABLE "public"."contact_notes" TO "anon";
GRANT ALL ON TABLE "public"."contact_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_notes" TO "service_role";



GRANT ALL ON TABLE "public"."contact_tags" TO "anon";
GRANT ALL ON TABLE "public"."contact_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_tags" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."crm_ad_accounts" TO "anon";
GRANT ALL ON TABLE "public"."crm_ad_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_ad_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."crm_ad_performance" TO "anon";
GRANT ALL ON TABLE "public"."crm_ad_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_ad_performance" TO "service_role";



GRANT ALL ON TABLE "public"."crm_conversions" TO "anon";
GRANT ALL ON TABLE "public"."crm_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."crm_dashboard_widgets" TO "anon";
GRANT ALL ON TABLE "public"."crm_dashboard_widgets" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_dashboard_widgets" TO "service_role";



GRANT ALL ON TABLE "public"."crm_dashboards" TO "anon";
GRANT ALL ON TABLE "public"."crm_dashboards" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_dashboards" TO "service_role";



GRANT ALL ON TABLE "public"."crm_deals" TO "anon";
GRANT ALL ON TABLE "public"."crm_deals" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_deals" TO "service_role";



GRANT ALL ON TABLE "public"."crm_form_fields" TO "anon";
GRANT ALL ON TABLE "public"."crm_form_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_form_fields" TO "service_role";



GRANT ALL ON TABLE "public"."crm_form_submissions" TO "anon";
GRANT ALL ON TABLE "public"."crm_form_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_form_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."crm_forms" TO "anon";
GRANT ALL ON TABLE "public"."crm_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_forms" TO "service_role";



GRANT ALL ON TABLE "public"."crm_renewal_reminders" TO "anon";
GRANT ALL ON TABLE "public"."crm_renewal_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_renewal_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sequence_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "anon";
GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sequence_steps" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sequences" TO "anon";
GRANT ALL ON TABLE "public"."crm_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."crm_survey_questions" TO "anon";
GRANT ALL ON TABLE "public"."crm_survey_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_survey_questions" TO "service_role";



GRANT ALL ON TABLE "public"."crm_survey_responses" TO "anon";
GRANT ALL ON TABLE "public"."crm_survey_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_survey_responses" TO "service_role";



GRANT ALL ON TABLE "public"."crm_surveys" TO "anon";
GRANT ALL ON TABLE "public"."crm_surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_surveys" TO "service_role";



GRANT ALL ON TABLE "public"."drip_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."drip_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."drip_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."drip_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."drip_steps" TO "anon";
GRANT ALL ON TABLE "public"."drip_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_steps" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."email_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."email_log" TO "anon";
GRANT ALL ON TABLE "public"."email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."event_discussion_comments" TO "anon";
GRANT ALL ON TABLE "public"."event_discussion_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."event_discussion_comments" TO "service_role";



GRANT ALL ON TABLE "public"."event_discussion_likes" TO "anon";
GRANT ALL ON TABLE "public"."event_discussion_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."event_discussion_likes" TO "service_role";



GRANT ALL ON TABLE "public"."event_discussion_mentions" TO "anon";
GRANT ALL ON TABLE "public"."event_discussion_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."event_discussion_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."event_discussion_photos" TO "anon";
GRANT ALL ON TABLE "public"."event_discussion_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."event_discussion_photos" TO "service_role";



GRANT ALL ON TABLE "public"."event_discussion_posts" TO "anon";
GRANT ALL ON TABLE "public"."event_discussion_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."event_discussion_posts" TO "service_role";



GRANT ALL ON TABLE "public"."event_inquiries" TO "anon";
GRANT ALL ON TABLE "public"."event_inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."event_inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."event_inquiry_messages" TO "anon";
GRANT ALL ON TABLE "public"."event_inquiry_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."event_inquiry_messages" TO "service_role";



GRANT ALL ON TABLE "public"."event_public_rsvps" TO "anon";
GRANT ALL ON TABLE "public"."event_public_rsvps" TO "authenticated";
GRANT ALL ON TABLE "public"."event_public_rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."event_participants_view" TO "service_role";



GRANT ALL ON TABLE "public"."event_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."event_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."event_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."event_waitlist" TO "anon";
GRANT ALL ON TABLE "public"."event_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."event_waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."feed_comments" TO "anon";
GRANT ALL ON TABLE "public"."feed_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_comments" TO "service_role";



GRANT ALL ON TABLE "public"."feed_likes" TO "anon";
GRANT ALL ON TABLE "public"."feed_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_likes" TO "service_role";



GRANT ALL ON TABLE "public"."feed_mutes" TO "anon";
GRANT ALL ON TABLE "public"."feed_mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_mutes" TO "service_role";



GRANT ALL ON TABLE "public"."feed_posts" TO "anon";
GRANT ALL ON TABLE "public"."feed_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_posts" TO "service_role";



GRANT ALL ON TABLE "public"."feed_shares" TO "anon";
GRANT ALL ON TABLE "public"."feed_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_shares" TO "service_role";



GRANT ALL ON TABLE "public"."financial_cache" TO "anon";
GRANT ALL ON TABLE "public"."financial_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_cache" TO "service_role";



GRANT ALL ON TABLE "public"."guest_event_notifications" TO "anon";
GRANT ALL ON TABLE "public"."guest_event_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_event_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."guest_pass_events" TO "anon";
GRANT ALL ON TABLE "public"."guest_pass_events" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_pass_events" TO "service_role";



GRANT ALL ON TABLE "public"."guest_passes" TO "anon";
GRANT ALL ON TABLE "public"."guest_passes" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_passes" TO "service_role";



GRANT ALL ON TABLE "public"."hashtag_mentions" TO "anon";
GRANT ALL ON TABLE "public"."hashtag_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."hashtag_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."hashtag_monitors" TO "anon";
GRANT ALL ON TABLE "public"."hashtag_monitors" TO "authenticated";
GRANT ALL ON TABLE "public"."hashtag_monitors" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_images" TO "anon";
GRANT ALL ON TABLE "public"."homepage_images" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_images" TO "service_role";



GRANT ALL ON TABLE "public"."hub_members" TO "anon";
GRANT ALL ON TABLE "public"."hub_members" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_members" TO "service_role";



GRANT ALL ON TABLE "public"."hub_post_comments" TO "anon";
GRANT ALL ON TABLE "public"."hub_post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."hub_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."hub_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."hub_posts" TO "anon";
GRANT ALL ON TABLE "public"."hub_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_posts" TO "service_role";



GRANT ALL ON TABLE "public"."hub_resources" TO "anon";
GRANT ALL ON TABLE "public"."hub_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_resources" TO "service_role";



GRANT ALL ON TABLE "public"."hubs" TO "anon";
GRANT ALL ON TABLE "public"."hubs" TO "authenticated";
GRANT ALL ON TABLE "public"."hubs" TO "service_role";



GRANT ALL ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT ALL ON TABLE "public"."introductions" TO "anon";
GRANT ALL ON TABLE "public"."introductions" TO "authenticated";
GRANT ALL ON TABLE "public"."introductions" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."member_counts" TO "anon";
GRANT ALL ON TABLE "public"."member_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."member_counts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_responses" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_responses" TO "service_role";



GRANT ALL ON TABLE "public"."organization_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_settings" TO "service_role";



GRANT ALL ON TABLE "public"."partner_applications" TO "anon";
GRANT ALL ON TABLE "public"."partner_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_applications" TO "service_role";



GRANT ALL ON TABLE "public"."partner_invites" TO "anon";
GRANT ALL ON TABLE "public"."partner_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_invites" TO "service_role";



GRANT ALL ON TABLE "public"."partner_invoices" TO "anon";
GRANT ALL ON TABLE "public"."partner_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."partner_listings" TO "anon";
GRANT ALL ON TABLE "public"."partner_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_listings" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."post_comments" TO "anon";
GRANT ALL ON TABLE "public"."post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."post_likes" TO "anon";
GRANT ALL ON TABLE "public"."post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."post_mentions" TO "anon";
GRANT ALL ON TABLE "public"."post_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."post_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."processed_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."prospects" TO "anon";
GRANT ALL ON TABLE "public"."prospects" TO "authenticated";
GRANT ALL ON TABLE "public"."prospects" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."saved_reply_templates" TO "anon";
GRANT ALL ON TABLE "public"."saved_reply_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_reply_templates" TO "service_role";



GRANT ALL ON TABLE "public"."social_account_metrics" TO "anon";
GRANT ALL ON TABLE "public"."social_account_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."social_account_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."social_accounts" TO "anon";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."social_inbox_messages" TO "anon";
GRANT ALL ON TABLE "public"."social_inbox_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."social_inbox_messages" TO "service_role";



GRANT ALL ON TABLE "public"."social_inbox_replies" TO "anon";
GRANT ALL ON TABLE "public"."social_inbox_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."social_inbox_replies" TO "service_role";



GRANT ALL ON TABLE "public"."social_post_metrics" TO "anon";
GRANT ALL ON TABLE "public"."social_post_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."social_post_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."social_posts" TO "anon";
GRANT ALL ON TABLE "public"."social_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_posts" TO "service_role";



GRANT ALL ON TABLE "public"."sponsors_vendors" TO "anon";
GRANT ALL ON TABLE "public"."sponsors_vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsors_vendors" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."utm_tracking" TO "anon";
GRANT ALL ON TABLE "public"."utm_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."utm_tracking" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































