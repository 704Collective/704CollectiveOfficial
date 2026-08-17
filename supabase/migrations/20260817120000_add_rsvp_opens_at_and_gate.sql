-- Hand-applied to develop and prod around Aug 17. Column + INSERT-only gate on
-- attendance_credentials. Null = open. Source-allowlisted bypasses; UX backstop,
-- per-door checks are the authority.
-- Idempotent by construction.
--
-- Function body below is the prod definition, captured from
-- pg_get_functiondef('public.enforce_event_rsvp_opens_at'::regprocedure) on Aug 17
-- (prod md5 661604d039423e94e3b03bddad590656, 1133 bytes). Prod stores the body with
-- CRLF line endings; this file is LF, so the bodies match byte for byte only after
-- newline normalization -- same caveat as the Wave 1 capture.


-- ============================================================
-- events.rsvp_opens_at
-- Null on every event that predates this and on every event that does not
-- schedule an opening. Null always means open. Prod carries no column comment
-- and no index on it, so neither is added here.
-- ============================================================

alter table public.events add column if not exists rsvp_opens_at timestamptz;


-- ============================================================
-- The backstop gate.
--
-- BEFORE INSERT only: an opening time must never block a check-in, a void, or
-- any other update to a credential that was legitimately issued.
--
-- Bypasses, all keyed on metadata because every writer here runs as the service
-- role (auth.uid() is null inside the edge functions):
--   admin_override = 'true'      admin-issued, already bypasses capacity
--   waitlist_claim               claiming an opened seat implies the event opened
--   admin_add_members_dialog     admins adding members by hand
--   verify_ticket_payment        money already captured; blocking here forces a refund
--   stripe_webhook               same, from the async side
-- Credentials with a null event_id (membership cards) are never event-scoped, and
-- statuses outside active/used are not registrations, mirroring the capacity gate.
--
-- NOT on the list, deliberately, and worth a second look: exchange_intake_heal.
-- The intake door exempts the invited path (those members already RSVP'd and are
-- only sending answers), so during a lock that path saves the answers and logs a
-- non-fatal credential failure instead of re-seating a canceled member.
-- ============================================================

create or replace function public.enforce_event_rsvp_opens_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  opens_at timestamptz;
begin
  -- Event-less credentials (membership cards) are never gated.
  if NEW.event_id is null then
    return NEW;
  end if;
  -- Mirror the capacity gate: only active/used registrations are gated.
  if coalesce(NEW.status,'') not in ('active','used') then
    return NEW;
  end if;
  -- Deliberate acts bypass: admin stamp, or allowlisted sources
  -- (money already moved, seat already earned, or admin hands).
  if (NEW.metadata->>'admin_override') = 'true' then
    return NEW;
  end if;
  if (NEW.metadata->>'source') in ('waitlist_claim','admin_add_members_dialog','verify_ticket_payment','stripe_webhook') then
    return NEW;
  end if;

  select e.rsvp_opens_at into opens_at from public.events e where e.id = NEW.event_id;

  if opens_at is not null and now() < opens_at then
    raise exception 'RSVP_NOT_OPEN' using errcode = 'P0001', hint = opens_at::text;
  end if;

  return NEW;
end;
$function$;


-- prod: CREATE TRIGGER trg_enforce_rsvp_opens_at BEFORE INSERT ON
--       public.attendance_credentials FOR EACH ROW EXECUTE FUNCTION enforce_event_rsvp_opens_at()

drop trigger if exists trg_enforce_rsvp_opens_at on public.attendance_credentials;

create trigger trg_enforce_rsvp_opens_at
  before insert on public.attendance_credentials
  for each row
  execute function public.enforce_event_rsvp_opens_at();
