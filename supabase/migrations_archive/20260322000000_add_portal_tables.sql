-- =============================================================================
-- Portal tables: posts/feed, messaging, hubs, resources, business cards
-- Idempotent: uses IF NOT EXISTS for tables/indexes, DROP IF EXISTS for policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. POSTS (global social / business feed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feed_type     text NOT NULL CHECK (feed_type IN ('social', 'business')),
  content       text,
  image_urls    text[],
  file_urls     text[],
  file_names    text[],
  is_edited     boolean NOT NULL DEFAULT false,
  edited_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS posts_author_id_idx  ON posts(author_id);
CREATE INDEX IF NOT EXISTS posts_feed_type_idx  ON posts(feed_type);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_active_idx     ON posts(created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts FOR SELECT USING (
  deleted_at IS NULL AND (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
        AND p.deleted_at IS NULL
        AND (feed_type = 'social' OR p.member_type = 'business')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (
  author_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
        AND p.deleted_at IS NULL
        AND (feed_type = 'social' OR p.member_type = 'business')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "posts_update" ON posts;
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 2. POST LIKES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_likes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_likes_post_id_idx ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS post_likes_user_id_idx ON post_likes(user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_select" ON post_likes;
CREATE POLICY "post_likes_select" ON post_likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "post_likes_insert" ON post_likes;
CREATE POLICY "post_likes_insert" ON post_likes FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "post_likes_delete" ON post_likes;
CREATE POLICY "post_likes_delete" ON post_likes FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. POST COMMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  is_edited  boolean NOT NULL DEFAULT false,
  edited_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS post_comments_post_id_idx   ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS post_comments_author_id_idx ON post_comments(author_id);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_comments_select" ON post_comments;
CREATE POLICY "post_comments_select" ON post_comments FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM posts po
    JOIN profiles p ON p.id = auth.uid()
    WHERE po.id = post_id
      AND po.deleted_at IS NULL
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
      AND (po.feed_type = 'social' OR p.member_type = 'business')
  )
);

DROP POLICY IF EXISTS "post_comments_insert" ON post_comments;
CREATE POLICY "post_comments_insert" ON post_comments FOR INSERT WITH CHECK (
  author_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM posts po
    JOIN profiles p ON p.id = auth.uid()
    WHERE po.id = post_id
      AND po.deleted_at IS NULL
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
      AND (po.feed_type = 'social' OR p.member_type = 'business')
  )
);

DROP POLICY IF EXISTS "post_comments_update" ON post_comments;
CREATE POLICY "post_comments_update" ON post_comments FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 4. POST MENTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_mentions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id        uuid REFERENCES post_comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS post_mentions_mentioned_user_idx ON post_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS post_mentions_post_id_idx        ON post_mentions(post_id);

ALTER TABLE post_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_mentions_select" ON post_mentions;
CREATE POLICY "post_mentions_select" ON post_mentions FOR SELECT USING (
  mentioned_user_id = auth.uid()
);

DROP POLICY IF EXISTS "post_mentions_insert" ON post_mentions;
CREATE POLICY "post_mentions_insert" ON post_mentions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 5. CONVERSATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('direct', 'group')),
  title       text,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON conversations(created_by);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "conversations_update" ON conversations;
CREATE POLICY "conversations_update" ON conversations FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 6. CONVERSATION PARTICIPANTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  last_read_at    timestamptz,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conv_participants_conv_id_idx ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS conv_participants_user_id_idx ON conversation_participants(user_id);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_participants_select" ON conversation_participants;
CREATE POLICY "conv_participants_select" ON conversation_participants FOR SELECT USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "conv_participants_insert" ON conversation_participants;
CREATE POLICY "conv_participants_insert" ON conversation_participants FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM conversation_participants cp2
          WHERE cp2.conversation_id = conversation_id AND cp2.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "conv_participants_update" ON conversation_participants;
CREATE POLICY "conv_participants_update" ON conversation_participants FOR UPDATE USING (
  user_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- 7. MESSAGES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content         text,
  image_urls      text[],
  file_urls       text[],
  file_names      text[],
  is_edited       boolean NOT NULL DEFAULT false,
  edited_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx      ON messages(created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 8. HUBS — table first, policies after hub_members exists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hubs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  description      text,
  header_image_url text,
  created_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 9. HUB MEMBERS — must exist before hubs RLS policies reference it
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, user_id)
);

CREATE INDEX IF NOT EXISTS hub_members_hub_id_idx  ON hub_members(hub_id);
CREATE INDEX IF NOT EXISTS hub_members_user_id_idx ON hub_members(user_id);

ALTER TABLE hub_members ENABLE ROW LEVEL SECURITY;

-- Hubs RLS policies (deferred until hub_members table exists)
DROP POLICY IF EXISTS "hubs_select" ON hubs;
CREATE POLICY "hubs_select" ON hubs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM hub_members hm
    WHERE hm.hub_id = id AND hm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hubs_insert" ON hubs;
CREATE POLICY "hubs_insert" ON hubs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "hubs_update" ON hubs;
CREATE POLICY "hubs_update" ON hubs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- Hub members RLS policies
DROP POLICY IF EXISTS "hub_members_select" ON hub_members;
CREATE POLICY "hub_members_select" ON hub_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM hub_members hm2
    WHERE hm2.hub_id = hub_id AND hm2.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hub_members_insert" ON hub_members;
CREATE POLICY "hub_members_insert" ON hub_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "hub_members_delete" ON hub_members;
CREATE POLICY "hub_members_delete" ON hub_members FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 10. HUB POSTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id     uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text,
  image_urls text[],
  file_urls  text[],
  file_names text[],
  is_edited  boolean NOT NULL DEFAULT false,
  edited_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS hub_posts_hub_id_idx    ON hub_posts(hub_id);
CREATE INDEX IF NOT EXISTS hub_posts_author_id_idx ON hub_posts(author_id);
CREATE INDEX IF NOT EXISTS hub_posts_active_idx    ON hub_posts(created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE hub_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_posts_select" ON hub_posts;
CREATE POLICY "hub_posts_select" ON hub_posts FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hub_posts_insert" ON hub_posts;
CREATE POLICY "hub_posts_insert" ON hub_posts FOR INSERT WITH CHECK (
  author_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hub_posts_update" ON hub_posts;
CREATE POLICY "hub_posts_update" ON hub_posts FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 11. HUB POST LIKES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_post_likes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_post_id  uuid NOT NULL REFERENCES hub_posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS hub_post_likes_post_id_idx ON hub_post_likes(hub_post_id);

ALTER TABLE hub_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_post_likes_select" ON hub_post_likes;
CREATE POLICY "hub_post_likes_select" ON hub_post_likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM hub_posts hp
    JOIN hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
    WHERE hp.id = hub_post_id
  )
);

DROP POLICY IF EXISTS "hub_post_likes_insert" ON hub_post_likes;
CREATE POLICY "hub_post_likes_insert" ON hub_post_likes FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM hub_posts hp
    JOIN hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
    WHERE hp.id = hub_post_id
  )
);

DROP POLICY IF EXISTS "hub_post_likes_delete" ON hub_post_likes;
CREATE POLICY "hub_post_likes_delete" ON hub_post_likes FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 12. HUB POST COMMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_post_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_post_id  uuid NOT NULL REFERENCES hub_posts(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  is_edited    boolean NOT NULL DEFAULT false,
  edited_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS hub_post_comments_post_id_idx ON hub_post_comments(hub_post_id);

ALTER TABLE hub_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_post_comments_select" ON hub_post_comments;
CREATE POLICY "hub_post_comments_select" ON hub_post_comments FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM hub_posts hp
    JOIN hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
    WHERE hp.id = hub_post_id
  )
);

DROP POLICY IF EXISTS "hub_post_comments_insert" ON hub_post_comments;
CREATE POLICY "hub_post_comments_insert" ON hub_post_comments FOR INSERT WITH CHECK (
  author_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM hub_posts hp
    JOIN hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
    WHERE hp.id = hub_post_id
  )
);

DROP POLICY IF EXISTS "hub_post_comments_update" ON hub_post_comments;
CREATE POLICY "hub_post_comments_update" ON hub_post_comments FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 13. HUB RESOURCES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hub_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id      uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_size   bigint,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_resources_hub_id_idx      ON hub_resources(hub_id);
CREATE INDEX IF NOT EXISTS hub_resources_uploaded_by_idx ON hub_resources(uploaded_by);

ALTER TABLE hub_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_resources_select" ON hub_resources;
CREATE POLICY "hub_resources_select" ON hub_resources FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hub_resources_insert" ON hub_resources;
CREATE POLICY "hub_resources_insert" ON hub_resources FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "hub_resources_delete" ON hub_resources;
CREATE POLICY "hub_resources_delete" ON hub_resources FOR DELETE USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 14. ADMIN RESOURCES (global resource library)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_size   bigint,
  file_type   text,
  tags        text[],
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_resources_uploaded_by_idx ON admin_resources(uploaded_by);
CREATE INDEX IF NOT EXISTS admin_resources_created_at_idx  ON admin_resources(created_at DESC);

ALTER TABLE admin_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_resources_all" ON admin_resources;
CREATE POLICY "admin_resources_all" ON admin_resources USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin') AND p.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 15. BUSINESS CARDS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  public_id     text NOT NULL UNIQUE,
  full_name     text,
  title         text,
  company       text,
  phone         text,
  email         text,
  linkedin_url  text,
  website_url   text,
  avatar_url    text,
  custom_fields jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_cards_public_id_idx ON business_cards(public_id);

ALTER TABLE business_cards ENABLE ROW LEVEL SECURITY;

-- Public lookup by public_id (unauthenticated / anyone)
DROP POLICY IF EXISTS "business_cards_public_select" ON business_cards;
CREATE POLICY "business_cards_public_select" ON business_cards FOR SELECT USING (true);

DROP POLICY IF EXISTS "business_cards_insert" ON business_cards;
CREATE POLICY "business_cards_insert" ON business_cards FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "business_cards_update" ON business_cards;
CREATE POLICY "business_cards_update" ON business_cards FOR UPDATE USING (
  user_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- 16. NOTIFICATIONS — add missing columns if not already present
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url        text,
  ADD COLUMN IF NOT EXISTS is_dismissed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_type text;

CREATE INDEX IF NOT EXISTS notifications_undismissed_idx
  ON notifications(user_id) WHERE is_dismissed = false;
