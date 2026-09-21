-- ============================================================================
-- RLS AUDIT — strip leftover birth-defect grants on the RLS-on/no-policy tables
-- ============================================================================
-- cursor_report_rlsaudit.md §5. Sixteen public tables that run RLS with zero
-- policies still carried `GRANT ALL ... TO anon, authenticated` from the
-- pre-Sep-16 default privileges: 13 hand-made backup snapshots (Apr-Jun 2026)
-- and the two Apple Wallet machinery tables. RLS deny-all already blocked
-- select/insert/update/delete for API roles, but ALL also includes TRUNCATE,
-- REFERENCES and TRIGGER, which RLS does not govern. Every real caller of the
-- wallet tables is service role; the backups have no callers at all.
--
-- Prod: hand-applied by Adam 2026-09-21 with a clean 17/17 receipt
--       (every table {postgres, service_role} only, RLS on, zero policies).
-- person_tags (the 17th) is not listed here: it was born private via
--       20260916200000_wave6a_identity_schema_capture.sql and needed nothing.
--
-- Replay-safe: each revoke is guarded on the table existing, so this applies
-- cleanly on develop (which may lack some backup snapshots) and on any fresh
-- database. Re-running is a no-op.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    '_auth_backup_20260428',
    '_auth_identities_backup_20260428',
    'apple_wallet_passes',
    'apple_wallet_registrations',
    'backup_ambassador_referrals_presweep',
    'backup_attendance_credentials_20260610',
    'backup_business_applications_presweep',
    'backup_contacts_presweep',
    'backup_event_public_rsvps_presweep',
    'backup_events_stale_booleans_20260610',
    'backup_guest_passes_presweep',
    'backup_profiles_presweep',
    'backup_sauna_merge_credentials_20260610',
    'backup_sauna_merge_event_20260610',
    'backup_sauna_merge_tickets_20260610',
    'backup_tickets_presweep'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
      raise notice '[rls-audit] stripped anon/authenticated/PUBLIC from public.%', t;
    else
      raise notice '[rls-audit] public.% not present here, skipped', t;
    end if;
  end loop;
end $$;
