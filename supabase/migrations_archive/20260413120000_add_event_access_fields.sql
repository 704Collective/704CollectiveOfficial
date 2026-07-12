-- Event access & tiered member pricing (admin event form)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS access_type text DEFAULT 'members_only';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS access_level text DEFAULT 'all';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS social_member_price numeric;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS business_member_price numeric;

COMMENT ON COLUMN public.events.access_type IS 'members_only | public_ticketed | public_free';
COMMENT ON COLUMN public.events.access_level IS 'all | social_only | business_only (members_only only)';
