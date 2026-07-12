-- Expand subscription_status values + soft deactivation metadata
UPDATE public.profiles
SET subscription_status = 'canceled'
WHERE subscription_status = 'cancelled';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (
    subscription_status IS NULL
    OR subscription_status IN (
      'active',
      'inactive',
      'canceled',
      'past_due',
      'trialing',
      'paused',
      'deactivated'
    )
  );
