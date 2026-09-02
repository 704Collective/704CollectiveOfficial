-- Phase 1 locked business application flow: the member-referral ledger.
--
-- Named `referrals` deliberately. /admin/referrals already does
-- `from('referrals').select('*')` and reads exactly referrer_name, referrer_email,
-- referred_name, referred_email, status, reward_amount and created_at. Shaping the
-- table to that contract means the page lights up with a zero-line diff.
--
-- Two families of columns:
--   canonical   the ids and the integer money. Source of truth.
--   display     the four denormalised name/email strings the admin page renders,
--               snapshotted at approve time so the ledger still reads correctly
--               if a profile is later renamed or deleted.
--
-- reward_amount is GENERATED from amount_cents rather than stored independently,
-- so the dollars the page prints can never drift from the cents we actually owe.

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),

  -- canonical
  referred_profile_id     uuid references public.profiles(id) on delete set null,
  referred_application_id uuid references public.business_applications(id) on delete set null,
  referrer_profile_id     uuid references public.profiles(id) on delete set null,
  amount_cents            integer not null default 25000,
  status                  text    not null default 'pending',
  stripe_subscription_id  text,

  -- display snapshot, read directly by /admin/referrals
  referrer_name  text,
  referrer_email text,
  referred_name  text,
  referred_email text,
  reward_amount  numeric(12,2) generated always as (amount_cents / 100.0) stored,

  -- Phase 2 payout tail, mirroring ambassador_referrals so the same shape of
  -- watcher and Monday payout run can drive both ledgers.
  payout_status      text not null default 'pending',
  payout_sent_at     timestamptz,
  stripe_transfer_id text,
  payout_notes       text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  converted_at timestamptz,

  constraint referrals_status_check
    check (status = any (array['pending','converted','owed','paid'])),
  constraint referrals_payout_status_check
    check (payout_status = any (array['pending','owed','sent'])),
  constraint referrals_amount_cents_positive
    check (amount_cents > 0),
  -- A member is never paid for referring themselves.
  constraint referrals_no_self_referral
    check (referrer_profile_id is null
           or referred_profile_id is null
           or referrer_profile_id <> referred_profile_id)
);

-- One ledger row per application. Makes an approve retry idempotent rather than
-- doubling what we owe.
create unique index if not exists referrals_application_unique
  on public.referrals (referred_application_id)
  where referred_application_id is not null;

-- The Phase 2 second-payment watcher looks the row up by subscription, exactly
-- as the ambassador conversion watcher already does.
create index if not exists referrals_stripe_subscription_idx
  on public.referrals (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists referrals_referrer_idx on public.referrals (referrer_profile_id);
create index if not exists referrals_created_at_idx on public.referrals (created_at desc);

drop trigger if exists update_referrals_updated_at on public.referrals;
create trigger update_referrals_updated_at
  before update on public.referrals
  for each row execute function public.update_updated_at_column();

alter table public.referrals enable row level security;

-- Mirrors ambassador_referrals: admins see everything, the two parties see their
-- own row, nobody writes from the browser. Every write is service-role.
drop policy if exists referrals_admin_all on public.referrals;
create policy referrals_admin_all on public.referrals
  for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['admin','super_admin'])
      and profiles.deleted_at is null
  ));

drop policy if exists referrals_party_read on public.referrals;
create policy referrals_party_read on public.referrals
  for select
  using (referrer_profile_id = auth.uid() or referred_profile_id = auth.uid());

grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

comment on table public.referrals is
  'Member-to-member business referral ledger. $250 per converted business referral. Shaped to what /admin/referrals already queries.';
comment on column public.referrals.amount_cents is
  'Source of truth for the reward. reward_amount is generated from this.';
comment on column public.referrals.reward_amount is
  'Generated dollars view of amount_cents, read directly by /admin/referrals.';
comment on column public.referrals.status is
  'pending -> converted on the second payment -> owed -> paid.';
