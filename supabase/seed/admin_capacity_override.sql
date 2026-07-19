-- =====================================================================
-- Allow admin-stamped credentials to bypass the capacity trigger.
-- Only service-role edge functions can write this stamp.
-- =====================================================================
begin;
create or replace function enforce_event_capacity() returns trigger
language plpgsql security definer as $$
DECLARE v_capacity int; v_count int;
BEGIN
  IF NEW.status NOT IN ('active','used') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active','used') THEN RETURN NEW; END IF;
  -- ADMIN OVERRIDE: service-role-stamped credentials bypass capacity
  IF (NEW.metadata->>'admin_override') = 'true' THEN RETURN NEW; END IF;
  SELECT capacity INTO v_capacity FROM events WHERE id = NEW.event_id FOR UPDATE;
  IF v_capacity IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM attendance_credentials
  WHERE event_id = NEW.event_id AND status IN ('active','used');
  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'EVENT_AT_CAPACITY' USING ERRCODE='P0001', HINT='Event is at capacity';
  END IF;
  RETURN NEW;
END; $$;

-- =====================================================================
-- tickets capacity triggers: same admin_override bypass.
-- Bodies otherwise byte-identical to prod (baseline 20260712000000).
-- =====================================================================
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

  -- ADMIN OVERRIDE: service-role-stamped tickets bypass capacity
  IF (NEW.metadata->>'admin_override') = 'true' THEN
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

CREATE OR REPLACE FUNCTION "public"."check_event_capacity_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  event_capacity int;
  current_count int;
BEGIN
  -- ADMIN OVERRIDE: service-role-stamped tickets bypass capacity
  IF (NEW.metadata->>'admin_override') = 'true' THEN
    RETURN NEW;
  END IF;

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
commit;
