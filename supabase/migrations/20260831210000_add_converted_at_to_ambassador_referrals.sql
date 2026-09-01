-- Additive only. No drops, no row rewrites, no backfill.
--
-- The ambassador second-payment conversion in supabase/functions/stripe-webhook
-- (invoice.payment_succeeded, billing_reason = 'subscription_cycle') writes:
--
--   status: 'converted', payout_status: 'owed', converted_at: <now>
--
-- ambassador_referrals has never had a converted_at column, in production or on
-- the develop branch, so that update names a column that does not exist and
-- cannot succeed. The handler logs "Ambassador referral conversion update
-- failed" and continues, which means status never becomes 'converted' and
-- payout_status never becomes 'owed'.
--
-- Those are the exact two values ambassador-payout selects on
-- (supabase/functions/ambassador-payout/index.ts:158-160), so the weekly cron
-- can never find work to do. This column is the missing link in that chain.
--
-- A commission_earned_at column already exists and is written by nothing; it is
-- deliberately left alone rather than repurposed, so the fix stays additive and
-- the code needs no change.

ALTER TABLE public.ambassador_referrals
  ADD COLUMN IF NOT EXISTS converted_at timestamp with time zone;

COMMENT ON COLUMN public.ambassador_referrals.converted_at IS
  'Set when the referred member pays their second billing cycle and the referral '
  'flips to status=converted / payout_status=owed. Written by stripe-webhook on '
  'invoice.payment_succeeded where billing_reason = subscription_cycle.';
