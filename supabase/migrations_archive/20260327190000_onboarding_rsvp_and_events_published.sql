-- One-time welcome RSVP gate + published flag for public event listings
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_completed_onboarding_rsvp boolean NOT NULL DEFAULT false;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
