-- Extend ambassador_referrals.status CHECK constraint to allow flagged_self_refer.
-- This status fires when an ambassador attempts to refer themselves (uses their
-- own code on their own signup). Flagged for admin review before any payout.

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
  'flagged_self_refer'::text
]));