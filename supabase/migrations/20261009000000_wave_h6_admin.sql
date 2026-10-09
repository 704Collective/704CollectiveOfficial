-- ============================================================================
-- WAVE H6 — Admin command center (additive only)
-- ============================================================================
-- network_leads.nudge_sent_at: stamped by the network-reply-nudge function the
-- first time an unanswered intro passes the 2-business-day pledge, so a lead
-- is nudged at most once. No policies, triggers or existing columns altered.
-- ============================================================================

alter table public.network_leads
  add column if not exists nudge_sent_at timestamptz;

comment on column public.network_leads.nudge_sent_at is
  'Wave H6. When the reply-pledge nudge email went to the listing owner for this lead. Null = never nudged. Set once.';

create index if not exists network_leads_awaiting_reply_idx
  on public.network_leads (created_at) where first_replied_at is null and nudge_sent_at is null;
