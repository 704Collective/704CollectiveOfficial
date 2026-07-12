-- Add profile columns needed for ban system, application tracking, and vendor/sponsor flags
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS application_status text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_sponsor boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_venue boolean DEFAULT false;

-- Index banned users for fast middleware lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned) WHERE is_banned = true;
-- Index application_status for admin filtering
CREATE INDEX IF NOT EXISTS idx_profiles_application_status ON profiles(application_status) WHERE application_status IS NOT NULL;
