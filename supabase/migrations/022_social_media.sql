-- Atlas CRM: social media management (accounts, posts, inbox, analytics, hashtags)
-- Replaces legacy social_posts/social_accounts shapes if present.

DROP TABLE IF EXISTS public.social_post_metrics CASCADE;
DROP TABLE IF EXISTS public.social_inbox_replies CASCADE;
DROP TABLE IF EXISTS public.social_inbox_messages CASCADE;
DROP TABLE IF EXISTS public.hashtag_mentions CASCADE;
DROP TABLE IF EXISTS public.hashtag_monitors CASCADE;
DROP TABLE IF EXISTS public.best_time_to_post CASCADE;
DROP TABLE IF EXISTS public.saved_reply_templates CASCADE;
DROP TABLE IF EXISTS public.social_posts CASCADE;
DROP TABLE IF EXISTS public.social_accounts CASCADE;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default Workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workspaces (id, name)
VALUES ('a0000000-0000-4000-8000-000000000001'::uuid, 'Default Workspace')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_social_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN (
    'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'snapchat', 'twitter'
  )),
  account_id text NOT NULL,
  account_name text NOT NULL,
  account_handle text,
  account_type text CHECK (account_type IN ('personal', 'business', 'creator')) DEFAULT 'business',
  avatar_url text,
  follower_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  post_count integer NOT NULL DEFAULT 0,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error', 'expired')),
  last_synced_at timestamptz,
  sync_error text,
  platform_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, account_id)
);

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  caption text NOT NULL,
  media_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  media_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_account_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  campaign_id uuid,
  link_url text,
  hashtags text[] NOT NULL DEFAULT ARRAY[]::text[],
  mentions text[] NOT NULL DEFAULT ARRAY[]::text[],
  first_comment text,
  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  parent_post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_parent_fkey
  FOREIGN KEY (parent_post_id) REFERENCES public.social_posts (id) ON DELETE SET NULL;

CREATE TABLE public.social_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts (id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  platform_post_id text NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  video_views integer NOT NULL DEFAULT 0,
  video_completion_rate numeric NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, social_account_id)
);

CREATE TABLE public.social_account_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id uuid NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  date date NOT NULL,
  follower_count integer NOT NULL DEFAULT 0,
  follower_change integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  profile_views integer NOT NULL DEFAULT 0,
  website_clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (social_account_id, date)
);

CREATE TABLE public.social_inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  platform_message_id text NOT NULL UNIQUE,
  platform_post_id text,
  type text NOT NULL CHECK (type IN ('comment', 'dm', 'mention', 'reply')),
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  author_name text NOT NULL,
  author_handle text,
  author_avatar_url text,
  author_platform_id text,
  content text NOT NULL,
  media_url text,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived', 'spam')),
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  parent_message_id uuid,
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  received_at timestamptz NOT NULL,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_inbox_messages
  ADD CONSTRAINT social_inbox_messages_parent_fkey
  FOREIGN KEY (parent_message_id) REFERENCES public.social_inbox_messages (id) ON DELETE SET NULL;

CREATE TABLE public.social_inbox_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.social_inbox_messages (id) ON DELETE CASCADE,
  content text NOT NULL,
  sent_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform_reply_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.saved_reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  category text,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hashtag_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  hashtag text NOT NULL,
  platforms text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  total_mentions integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, hashtag)
);

CREATE TABLE public.hashtag_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES public.hashtag_monitors (id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_post_id text NOT NULL,
  author_name text NOT NULL,
  author_handle text,
  content text NOT NULL,
  media_url text,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  url text,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monitor_id, platform_post_id)
);

CREATE TABLE public.best_time_to_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id uuid NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  hour_of_day integer NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  engagement_score numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (social_account_id, day_of_week, hour_of_day)
);

CREATE INDEX IF NOT EXISTS social_accounts_workspace_id_idx ON public.social_accounts (workspace_id);
CREATE INDEX IF NOT EXISTS social_posts_workspace_id_idx ON public.social_posts (workspace_id);
CREATE INDEX IF NOT EXISTS social_posts_status_idx ON public.social_posts (status);
CREATE INDEX IF NOT EXISTS social_posts_scheduled_at_idx ON public.social_posts (scheduled_at);
CREATE INDEX IF NOT EXISTS social_post_metrics_post_id_idx ON public.social_post_metrics (post_id);
CREATE INDEX IF NOT EXISTS social_account_metrics_account_idx ON public.social_account_metrics (social_account_id);
CREATE INDEX IF NOT EXISTS social_account_metrics_date_idx ON public.social_account_metrics (date);
CREATE INDEX IF NOT EXISTS social_inbox_workspace_idx ON public.social_inbox_messages (workspace_id);
CREATE INDEX IF NOT EXISTS social_inbox_status_idx ON public.social_inbox_messages (status);
CREATE INDEX IF NOT EXISTS social_inbox_account_idx ON public.social_inbox_messages (social_account_id);
CREATE INDEX IF NOT EXISTS hashtag_monitors_workspace_idx ON public.hashtag_monitors (workspace_id);
CREATE INDEX IF NOT EXISTS hashtag_mentions_monitor_idx ON public.hashtag_mentions (monitor_id);

DROP TRIGGER IF EXISTS social_accounts_touch_updated_at ON public.social_accounts;
CREATE TRIGGER social_accounts_touch_updated_at
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

DROP TRIGGER IF EXISTS social_posts_touch_updated_at ON public.social_posts;
CREATE TRIGGER social_posts_touch_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

DROP TRIGGER IF EXISTS social_post_metrics_touch_updated_at ON public.social_post_metrics;
CREATE TRIGGER social_post_metrics_touch_updated_at
  BEFORE UPDATE ON public.social_post_metrics
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

DROP TRIGGER IF EXISTS social_inbox_messages_touch_updated_at ON public.social_inbox_messages;
CREATE TRIGGER social_inbox_messages_touch_updated_at
  BEFORE UPDATE ON public.social_inbox_messages
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

DROP TRIGGER IF EXISTS saved_reply_templates_touch_updated_at ON public.saved_reply_templates;
CREATE TRIGGER saved_reply_templates_touch_updated_at
  BEFORE UPDATE ON public.saved_reply_templates
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

DROP TRIGGER IF EXISTS hashtag_monitors_touch_updated_at ON public.hashtag_monitors;
CREATE TRIGGER hashtag_monitors_touch_updated_at
  BEFORE UPDATE ON public.hashtag_monitors
  FOR EACH ROW EXECUTE PROCEDURE public.touch_social_updated_at();

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_account_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reply_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.best_time_to_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_workspaces_authenticated" ON public.workspaces
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_accounts_authenticated" ON public.social_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_posts_authenticated" ON public.social_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_post_metrics_authenticated" ON public.social_post_metrics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_account_metrics_authenticated" ON public.social_account_metrics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_inbox_messages_authenticated" ON public.social_inbox_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "social_inbox_replies_authenticated" ON public.social_inbox_replies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "saved_reply_templates_authenticated" ON public.saved_reply_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hashtag_monitors_authenticated" ON public.hashtag_monitors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hashtag_mentions_authenticated" ON public.hashtag_mentions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "best_time_to_post_authenticated" ON public.best_time_to_post
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS social_handles jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $migration$;
