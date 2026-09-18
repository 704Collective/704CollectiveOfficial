-- ============================================================================
-- IDENTITY WAVE 10 — Stripe/DB drift detector receipts + nightly schedule
-- ============================================================================
-- cursor_report_drifttrio.md §4.4 / §5.1 item 1. The detector edge function
-- (stripe-drift-check) is READ-ONLY against Stripe and against profiles; the
-- only thing it writes is one row here per run, plus super-admin bells and one
-- summary email when an alerting shape (C, E, F, G) is present.
--
-- Shapes (same letters as the recon):
--   A  DB active, no sub id, nothing active in Stripe          (internal tests) watch
--   B  DB active, sub id unknown to Stripe                                     watch
--   C  DB active, Stripe canceled (ghost member)                               ALERT
--   D  DB active, Stripe pause_collection                                      ok
--   E  DB canceled, Stripe still active (still billed)                         ALERT
--   F  DB inactive/other, Stripe active                                        ALERT
--   G  soft-deleted profile, Stripe active                                     ALERT
--   H  DB says 'paused'                                                        watch
--   membership_override = true is always OK (admin-comped by design).
-- ============================================================================

create table if not exists public.drift_checks (
  id                          uuid primary key default gen_random_uuid(),
  ran_at                      timestamptz not null default now(),
  source                      text not null default 'cron',
  stripe_subscriptions_total  integer not null,
  stripe_active               integer not null,
  profiles_total              integer not null,
  shape_counts                jsonb not null default '{}'::jsonb,
  flagged                     jsonb not null default '[]'::jsonb,
  alert_count                 integer not null default 0,
  alert_sent                  boolean not null default false,
  duration_ms                 integer,
  notes                       text,
  constraint drift_checks_source_check check (source = any (array['cron','manual','rehearsal']))
);

comment on table public.drift_checks is
  'One row per stripe-drift-check run (Wave 10). shape_counts = per-shape totals; flagged = the alerting rows (C/E/F/G) with ids and both statuses. Detect-only: the detector never writes Stripe or profiles.';

create index if not exists drift_checks_ran_at_idx on public.drift_checks (ran_at desc);

alter table public.drift_checks enable row level security;

-- Admins may read receipts (future health-dashboard widget). Nobody writes from the browser.
drop policy if exists drift_checks_admin_read on public.drift_checks;
create policy drift_checks_admin_read on public.drift_checks
  for select
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null
  ));

drop policy if exists drift_checks_service_all on public.drift_checks;
create policy drift_checks_service_all on public.drift_checks
  for all to service_role using (true) with check (true);

revoke all on table public.drift_checks from public, anon, authenticated;
grant select on table public.drift_checks to authenticated;
grant all    on table public.drift_checks to service_role;

-- ── notifications.type: the drift bell ──────────────────────────────────────
-- Widening only: every previously accepted value is kept.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'event_reminder','new_event','broadcast','mention','discussion_reply','discussion_open',
    'new_post','hub_post','hub_added','new_message','new_inquiry','inquiry_message','inquiry_reply',
    'partner_team_message','partner_team_reply','task_assigned',
    'referral_earned','payout_setup',
    'stripe_drift'
  ]));

-- ── nightly schedule (06:30 UTC, after Stripe's overnight billing runs) ─────
-- Same shape as the other ten jobs: URL and service key from Vault. Guarded so
-- a database without pg_cron (develop) applies the rest of this file cleanly.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'stripe-drift-check-nightly') then
    perform cron.schedule(
      'stripe-drift-check-nightly',
      '30 6 * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/stripe-drift-check',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')),
          body := '{"source":"cron"}'::jsonb
        )
      $job$
    );
  end if;
end $$;
