-- Founder badge support for member directory / CRM
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding_member boolean NOT NULL DEFAULT false;
