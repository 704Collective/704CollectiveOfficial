-- Phase 2 of the member referral ledger: the payout tail.
--
-- Two tables, both mirrors of the ambassador machinery so the same Monday run
-- can drive both ledgers:
--
--   member_payout_accounts  the referrer's Stripe Connect account, keyed by
--                           profile. Mirrors ambassadors.stripe_account_id /
--                           stripe_account_status / stripe_onboarding_completed_at.
--   member_payouts          one row per transfer, mirrors ambassador_payouts.
--                           UNIQUE (stripe_transfer_id) so a transfer can never
--                           be logged twice.
--
-- referrals itself is untouched: its status check already allows the terminal
-- words the payout pass writes ('paid' / payout_status 'sent').
--
-- Born-private convention (cursor_report_funcexposure.md): every object created
-- here ends with explicit REVOKE lines for PUBLIC/anon/authenticated and a
-- narrow GRANT, so the project's default ACL cannot hand API roles anything
-- this migration did not name.
--
-- Additive only. No drops of data, no row rewrites. Develop first, then prod.

-- ── notifications.type: two new bell types ──────────────────────────────────
-- notifications_type_check is an allow-list. The referrer bells written by
-- stripe-webhook ('referral_earned', on the owed flip) and by the Monday run
-- ('payout_setup', while money is owed with no usable Connect account) need
-- to be on it. Widening only: every previously accepted value is kept.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'event_reminder','new_event','broadcast','mention','discussion_reply','discussion_open',
    'new_post','hub_post','hub_added','new_message','new_inquiry','inquiry_message','inquiry_reply',
    'partner_team_message','partner_team_reply','task_assigned',
    'referral_earned','payout_setup'
  ]));

-- ── member_payout_accounts ──────────────────────────────────────────────────

create table if not exists public.member_payout_accounts (
  profile_id                     uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id              text unique,
  stripe_account_status          text not null default 'pending',
  stripe_onboarding_completed_at timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint member_payout_accounts_status_check
    check (stripe_account_status = any (array['pending','onboarding','active','restricted']))
);

comment on table public.member_payout_accounts is
  'Stripe Connect (Express) account for a member who earns referral payouts. One per profile. Mirrors the three Connect columns on ambassadors. Written only by service-role code (onboarding action, stripe-webhook account.updated, status pull).';
comment on column public.member_payout_accounts.stripe_account_status is
  'pending (row exists, no Stripe account yet) -> onboarding (account created, link issued) -> active (charges+payouts enabled) | restricted (Stripe disabled_reason).';

drop trigger if exists update_member_payout_accounts_updated_at on public.member_payout_accounts;
create trigger update_member_payout_accounts_updated_at
  before update on public.member_payout_accounts
  for each row execute function public.update_updated_at_column();

alter table public.member_payout_accounts enable row level security;

-- Owner may read their own row. Nobody writes from the browser.
drop policy if exists member_payout_accounts_owner_read on public.member_payout_accounts;
create policy member_payout_accounts_owner_read on public.member_payout_accounts
  for select
  using (profile_id = auth.uid());

drop policy if exists member_payout_accounts_service_all on public.member_payout_accounts;
create policy member_payout_accounts_service_all on public.member_payout_accounts
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.member_payout_accounts from public, anon, authenticated;
grant select on table public.member_payout_accounts to authenticated;
grant all    on table public.member_payout_accounts to service_role;

-- ── member_payouts ──────────────────────────────────────────────────────────

create table if not exists public.member_payouts (
  id                  uuid primary key default gen_random_uuid(),
  referral_id         uuid not null references public.referrals(id) on delete cascade,
  referrer_profile_id uuid references public.profiles(id) on delete set null,
  amount_cents        integer not null,
  stripe_transfer_id  text unique,
  destination_source  text not null,
  status              text not null default 'sent',
  failure_reason      text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  constraint member_payouts_amount_positive check (amount_cents > 0),
  constraint member_payouts_status_check
    check (status = any (array['sent','paid','failed','reversed'])),
  constraint member_payouts_destination_check
    check (destination_source = any (array['member','ambassador']))
);

comment on table public.member_payouts is
  'One row per Stripe transfer paid against a referrals row. Mirrors ambassador_payouts. destination_source records whether the money went to the member''s own Connect account or to their existing ambassador account (reuse rule).';

create index if not exists member_payouts_referral_id_idx on public.member_payouts (referral_id);
create index if not exists member_payouts_referrer_idx    on public.member_payouts (referrer_profile_id);

alter table public.member_payouts enable row level security;

drop policy if exists member_payouts_owner_read on public.member_payouts;
create policy member_payouts_owner_read on public.member_payouts
  for select
  using (referrer_profile_id = auth.uid());

drop policy if exists member_payouts_service_all on public.member_payouts;
create policy member_payouts_service_all on public.member_payouts
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.member_payouts from public, anon, authenticated;
grant select on table public.member_payouts to authenticated;
grant all    on table public.member_payouts to service_role;
