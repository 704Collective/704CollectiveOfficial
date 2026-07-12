-- ─────────────────────────────────────────────────────────────────
-- Migration: add_missing_josh_tables
-- Date: 2026-04-06
-- ─────────────────────────────────────────────────────────────────

-- ── 1. processed_webhook_events ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     text UNIQUE NOT NULL,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_webhook_events" ON public.processed_webhook_events;
CREATE POLICY "service_role_only_webhook_events"
  ON public.processed_webhook_events
  USING (false)
  WITH CHECK (false);

-- ── 2. financial_cache ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text UNIQUE NOT NULL,
  data       jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.financial_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_write_financial_cache" ON public.financial_cache;
CREATE POLICY "admin_read_write_financial_cache"
  ON public.financial_cache
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'super_admin')
    )
  );

-- ── 3. cancellation_surveys ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cancellation_surveys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason       text,
  feedback     text,
  would_rejoin boolean,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.cancellation_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_insert_cancellation_survey" ON public.cancellation_surveys;
CREATE POLICY "owner_insert_cancellation_survey"
  ON public.cancellation_surveys
  FOR INSERT
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_cancellation_surveys" ON public.cancellation_surveys;
CREATE POLICY "admin_read_cancellation_surveys"
  ON public.cancellation_surveys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'super_admin')
    )
  );

-- ── 4. guest_event_notifications ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guest_event_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_email text NOT NULL,
  event_id    uuid REFERENCES public.events(id) ON DELETE CASCADE,
  sent_at     timestamptz DEFAULT now(),
  opened      boolean DEFAULT false
);

ALTER TABLE public.guest_event_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_guest_notifications" ON public.guest_event_notifications;
CREATE POLICY "service_role_only_guest_notifications"
  ON public.guest_event_notifications
  USING (false)
  WITH CHECK (false);

-- ── 5. homepage_images ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homepage_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url     text NOT NULL,
  alt_text      text,
  display_order integer DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.homepage_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_homepage_images" ON public.homepage_images;
CREATE POLICY "admin_all_homepage_images"
  ON public.homepage_images
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "public_read_active_homepage_images" ON public.homepage_images;
CREATE POLICY "public_read_active_homepage_images"
  ON public.homepage_images
  FOR SELECT
  USING (is_active = true);

-- ── 6. profiles: new columns ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier text;

-- ── 7. events: new columns ───────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'social',
  ADD COLUMN IF NOT EXISTS social_member_price  numeric,
  ADD COLUMN IF NOT EXISTS business_member_price numeric;

-- ═══════════════════════════════════════════════════════════════════
-- Performance indexes
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tickets_event_id       ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status   ON public.tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_stripe_payment ON public.tickets(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role        ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_events_start_time           ON public.events(start_time);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_cust ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email       ON public.profiles(email) WHERE deleted_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_search ON public.profiles
  USING gin (full_name gin_trgm_ops, email gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════
-- Security-definer helper functions
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.has_role(uuid, text);
CREATE FUNCTION public.has_role(user_uuid uuid, role_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS(SELECT 1 FROM user_roles  WHERE user_id = user_uuid AND role::text = role_name)
    OR
    EXISTS(SELECT 1 FROM profiles    WHERE id      = user_uuid AND role::text = role_name);
$$;

-- is_active_user already exists with dependent RLS policies; just replace body
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = _user_id AND deleted_at IS NULL
  );
$$;

DROP FUNCTION IF EXISTS public.get_community_stats();
CREATE FUNCTION public.get_community_stats()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'total_members',
      COUNT(*) FILTER (
        WHERE subscription_status IN ('active', 'trialing')
           OR membership_override = true
      ),
    'total_events',
      (SELECT COUNT(*) FROM events WHERE is_published = true),
    'total_rsvps',
      (SELECT COUNT(*) FROM tickets WHERE status = 'confirmed')
  )
  FROM profiles
  WHERE deleted_at IS NULL;
$$;
