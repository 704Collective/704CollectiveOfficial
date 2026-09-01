-- Widen ambassador_referrals.status to accept 'paid_out'. Nothing else changes.
--
-- supabase/functions/ambassador-payout/index.ts:286-294 writes, in ONE update
-- and only after the Stripe transfer has already succeeded:
--
--   payout_status = 'sent', payout_sent_at, stripe_transfer_id, status = 'paid_out'
--
-- 'paid_out' was never in the status CHECK constraint, so Postgres rejects that
-- update in full. All four assignments are lost, including stripe_transfer_id.
-- The row therefore stays status='converted', payout_status='owed',
-- stripe_transfer_id IS NULL -- which is exactly what the weekly cron selects on
-- (ambassador-payout:157-160). The referral is picked up and paid again on the
-- next run. The transfer's idempotency key is `payout-${referral.id}`, but
-- Stripe expires idempotency keys after 24 hours, so a run seven days later
-- creates a genuinely new transfer rather than replaying the old one.
--
-- The constraint is widened rather than the code changed to write 'paid'. Three
-- UI surfaces already read 'paid_out' as the terminal state
-- (admin/ambassadors/[id], admin/ambassadors, ambassadors/dashboard), so the
-- code is the side that is already consistent with itself.
--
-- Widening only: every value previously accepted is still accepted, so no
-- existing row can fail revalidation. No drops of data, no row rewrites.
--
-- Known and deliberately NOT included: 'auto_approved' is read by the same UI
-- surfaces and is likewise absent from this constraint. Nothing writes it, so it
-- is a separate question and is left alone here.

ALTER TABLE public.ambassador_referrals
  DROP CONSTRAINT IF EXISTS ambassador_referrals_status_check;

ALTER TABLE public.ambassador_referrals
  ADD CONSTRAINT ambassador_referrals_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'signed_up'::text,
    'converted'::text,
    'churned'::text,
    'approved'::text,
    'denied'::text,
    'paid'::text,
    'flagged_self_refer'::text,
    'paid_out'::text
  ]));
