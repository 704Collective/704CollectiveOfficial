-- Business referral payouts off switch + ledger rows that cron will never select.
--
-- Flip: update public.app_settings
--   set value = 'true'::jsonb, updated_at = now()
--   where key = 'business_referral_payouts_enabled';
-- New approvals after that write real amounts. Rows written while this was
-- false stay amount 0 / payout_status 'disabled'. Do not backfill them.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Single-row feature flags. business_referral_payouts_enabled defaults false. Referrals recorded while off stay unpaid.';

comment on column public.app_settings.value is
  'JSON value for the key. Booleans stored as jsonb true/false.';

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.app_settings to service_role;

insert into public.app_settings (key, value)
values ('business_referral_payouts_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- Website / edge functions read the flag without table grants.
create or replace function public.business_referral_payouts_enabled()
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(
    (select value = 'true'::jsonb
     from public.app_settings
     where key = 'business_referral_payouts_enabled'),
    false
  );
$$;

revoke all on function public.business_referral_payouts_enabled() from public;
grant execute on function public.business_referral_payouts_enabled() to anon, authenticated, service_role;

-- Super-admin write path. No browser write policy on the table.
create or replace function public.set_business_referral_payouts_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.assert_super_admin();
  insert into public.app_settings (key, value, updated_at)
  values ('business_referral_payouts_enabled', to_jsonb(p_enabled), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

revoke all on function public.set_business_referral_payouts_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_business_referral_payouts_enabled(boolean) to authenticated, service_role;

-- Cron selects payout_status = 'owed' only. 'disabled' is never paid.
alter table public.ambassador_referrals
  drop constraint if exists ambassador_referrals_payout_status_check;
alter table public.ambassador_referrals
  add constraint ambassador_referrals_payout_status_check
  check (payout_status = any (array['pending','owed','sent','disabled']));

alter table public.referrals
  drop constraint if exists referrals_payout_status_check;
alter table public.referrals
  add constraint referrals_payout_status_check
  check (payout_status = any (array['pending','owed','sent','disabled']));

-- Allow a recorded-but-unpaid $0 row while the flag is off.
alter table public.referrals
  drop constraint if exists referrals_amount_cents_positive;
alter table public.referrals
  add constraint referrals_amount_cents_nonnegative
  check (amount_cents >= 0);
