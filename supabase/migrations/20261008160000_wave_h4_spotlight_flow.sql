-- ============================================================================
-- WAVE H4 — Spotlight money flow (additive only)
-- ============================================================================
-- 1. network_listing_applications gains the manual-review + approval columns.
-- 2. profiles.member_type gains the value 'listing' (a listing-only account
--    that is never a member). The existing CHECK is widened additively: every
--    previously accepted value is kept. This is the one touch on an existing
--    object this wave; without it the spec'd account type cannot exist.
-- No policies, triggers, functions or existing columns are altered.
-- ============================================================================

alter table public.network_listing_applications
  add column if not exists review_checklist                jsonb,
  add column if not exists review_notes                    text,
  add column if not exists decline_reason                  text,
  add column if not exists approved_payment_link_sent_at   timestamptz,
  add column if not exists converted_listing_id            uuid references public.network_listings(id) on delete set null,
  -- Stripe Checkout link issued on approval (24h validity, re-sendable).
  add column if not exists payment_link_url                text,
  add column if not exists payment_link_expires_at         timestamptz,
  add column if not exists stripe_checkout_session_id      text;

comment on column public.network_listing_applications.review_checklist is
  'Wave H4. Manual 704 Review: {legitimacy, reputation, member_signal, transparency, responsiveness} booleans + optional score.';
comment on column public.network_listing_applications.converted_listing_id is
  'Wave H4. Set by stripe-webhook on first listing payment; doubles as the replay idempotency key.';

create index if not exists network_listing_applications_converted_idx
  on public.network_listing_applications (converted_listing_id) where converted_listing_id is not null;

-- profiles.member_type: add 'listing' (widening only)
alter table public.profiles drop constraint if exists profiles_member_type_check;
alter table public.profiles add constraint profiles_member_type_check
  check (member_type = any (array[
    'social','business','social_non_member','business_non_member','non_member',
    'partner','vendor','venue','sponsor',
    'listing'
  ]));
