-- ============================================================================
-- DROP DEAD BACKUP SNAPSHOT TABLES (cursor_report_rlsaudit.md §4 / §6)
-- ============================================================================
-- Fourteen hand-made backup snapshots from Apr-Jun 2026 (the 20260428 auth
-- repair pair, the "presweep" identity-sweep set, the 20260610 sauna-merge /
-- stale-boolean set). Nothing in the app, no DB function, view, trigger, FK or
-- publication referenced any of them; RLS deny-all held and the leftover API
-- grants were stripped by 20260921070000_rls_audit_strip_leftover_grants.sql.
--
-- Prod: hand-dropped by Adam 2026-09-21 AFTER a verified cold copy -
--       outputs/backup-cold-copies/ (gitignored), 14 files + manifest.json,
--       1,652 rows, every table's exported count matched its live count.
--       Post-drop receipt: 0 of the 14 remaining, the 3 keepers present.
--
-- Deliberately UNTOUCHED (live machinery, RLS-on/no-policy by design):
--   apple_wallet_passes, apple_wallet_registrations, person_tags.
--
-- Replay-safe: drop table if exists, so develop and fresh databases apply cleanly.
-- ============================================================================

drop table if exists public._auth_backup_20260428;
drop table if exists public._auth_identities_backup_20260428;
drop table if exists public.backup_ambassador_referrals_presweep;
drop table if exists public.backup_attendance_credentials_20260610;
drop table if exists public.backup_business_applications_presweep;
drop table if exists public.backup_contacts_presweep;
drop table if exists public.backup_event_public_rsvps_presweep;
drop table if exists public.backup_events_stale_booleans_20260610;
drop table if exists public.backup_guest_passes_presweep;
drop table if exists public.backup_profiles_presweep;
drop table if exists public.backup_sauna_merge_credentials_20260610;
drop table if exists public.backup_sauna_merge_event_20260610;
drop table if exists public.backup_sauna_merge_tickets_20260610;
drop table if exists public.backup_tickets_presweep;
