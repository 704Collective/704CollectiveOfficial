-- =============================================================================
-- RLS audit: drop and recreate policies per 704 Collective access rules
-- =============================================================================

-- Public business card lookup (anon + authenticated) without exposing full table
CREATE OR REPLACE FUNCTION public.get_business_card_public(pid text)
RETURNS SETOF public.business_cards
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.business_cards WHERE public_id = pid LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_business_card_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_card_public(text) TO anon, authenticated;

-- Partner listings: "approved" / visible to directory
ALTER TABLE public.partner_listings
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- POSTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_update" ON public.posts;
DROP POLICY IF EXISTS "posts_delete" ON public.posts;

CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.deleted_at IS NULL
          AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
      )
      AND (
        feed_type = 'social'
        OR (
          feed_type = 'business'
          AND EXISTS (
            SELECT 1 FROM public.profiles p2
            WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
              AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
              AND p2.member_type = 'business'
          )
        )
      )
    )
  )
);

CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.deleted_at IS NULL
          AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
      )
      AND (
        feed_type = 'social'
        OR (
          feed_type = 'business'
          AND EXISTS (
            SELECT 1 FROM public.profiles p2
            WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
              AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
              AND p2.member_type = 'business'
          )
        )
      )
    )
  )
);

CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR (author_id = auth.uid() AND deleted_at IS NULL)
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR author_id = auth.uid()
);

CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- POST LIKES (visibility follows parent post feed_type)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "post_likes_select" ON public.post_likes;
DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
DROP POLICY IF EXISTS "post_likes_delete" ON public.post_likes;

CREATE POLICY "post_likes_select" ON public.post_likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = post_likes.post_id
      AND po.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.deleted_at IS NULL
              AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
          )
          AND (
            po.feed_type = 'social'
            OR (
              po.feed_type = 'business'
              AND EXISTS (
                SELECT 1 FROM public.profiles p2
                WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
                  AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
                  AND p2.member_type = 'business'
              )
            )
          )
        )
      )
  )
);

CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = post_likes.post_id
      AND po.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.deleted_at IS NULL
              AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
          )
          AND (
            po.feed_type = 'social'
            OR (
              po.feed_type = 'business'
              AND EXISTS (
                SELECT 1 FROM public.profiles p2
                WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
                  AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
                  AND p2.member_type = 'business'
              )
            )
          )
        )
      )
  )
);

CREATE POLICY "post_likes_delete" ON public.post_likes FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- POST COMMENTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "post_comments_select" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_insert" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_update" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_delete" ON public.post_comments;

CREATE POLICY "post_comments_select" ON public.post_comments FOR SELECT USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = post_comments.post_id
      AND po.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.deleted_at IS NULL
              AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
          )
          AND (
            po.feed_type = 'social'
            OR (
              po.feed_type = 'business'
              AND EXISTS (
                SELECT 1 FROM public.profiles p2
                WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
                  AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
                  AND p2.member_type = 'business'
              )
            )
          )
        )
      )
  )
);

CREATE POLICY "post_comments_insert" ON public.post_comments FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = post_comments.post_id
      AND po.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.deleted_at IS NULL
              AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
          )
          AND (
            po.feed_type = 'social'
            OR (
              po.feed_type = 'business'
              AND EXISTS (
                SELECT 1 FROM public.profiles p2
                WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
                  AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
                  AND p2.member_type = 'business'
              )
            )
          )
        )
      )
  )
);

CREATE POLICY "post_comments_update" ON public.post_comments FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "post_comments_delete" ON public.post_comments FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- POST MENTIONS (align with post visibility + mentioned user)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "post_mentions_select" ON public.post_mentions;
DROP POLICY IF EXISTS "post_mentions_insert" ON public.post_mentions;

CREATE POLICY "post_mentions_select" ON public.post_mentions FOR SELECT USING (
  mentioned_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.posts po
    WHERE po.id = post_mentions.post_id
      AND po.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.deleted_at IS NULL
              AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
          )
          AND (
            po.feed_type = 'social'
            OR (
              po.feed_type = 'business'
              AND EXISTS (
                SELECT 1 FROM public.profiles p2
                WHERE p2.id = auth.uid() AND p2.deleted_at IS NULL
                  AND (p2.subscription_status IN ('active', 'trialing') OR p2.membership_override = true)
                  AND p2.member_type = 'business'
              )
            )
          )
        )
      )
  )
);

CREATE POLICY "post_mentions_insert" ON public.post_mentions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.posts po
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE po.id = post_mentions.post_id
      AND po.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
      AND (
        po.feed_type = 'social'
        OR (
          po.feed_type = 'business'
          AND p.member_type = 'business'
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- CONVERSATIONS & MESSAGES (participants only; super-admin uses service role)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;

CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
      AND p.deleted_at IS NULL
  )
);

CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- HUBS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hubs_select" ON public.hubs;
DROP POLICY IF EXISTS "hubs_insert" ON public.hubs;
DROP POLICY IF EXISTS "hubs_update" ON public.hubs;
DROP POLICY IF EXISTS "hubs_delete" ON public.hubs;

CREATE POLICY "hubs_select" ON public.hubs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.hub_id = id AND hm.user_id = auth.uid()
  )
);

CREATE POLICY "hubs_insert" ON public.hubs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hubs_update" ON public.hubs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hubs_delete" ON public.hubs FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- HUB MEMBERS (own membership row + admins)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hub_members_select" ON public.hub_members;
DROP POLICY IF EXISTS "hub_members_insert" ON public.hub_members;
DROP POLICY IF EXISTS "hub_members_delete" ON public.hub_members;

CREATE POLICY "hub_members_select" ON public.hub_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.hub_members hm2
    WHERE hm2.hub_id = hub_members.hub_id AND hm2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_members_insert" ON public.hub_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_members_delete" ON public.hub_members FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- HUB POSTS / LIKES / COMMENTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hub_posts_select" ON public.hub_posts;
DROP POLICY IF EXISTS "hub_posts_insert" ON public.hub_posts;
DROP POLICY IF EXISTS "hub_posts_update" ON public.hub_posts;
DROP POLICY IF EXISTS "hub_posts_delete" ON public.hub_posts;

CREATE POLICY "hub_posts_select" ON public.hub_posts FOR SELECT USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
  )
);

CREATE POLICY "hub_posts_insert" ON public.hub_posts FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
  )
);

CREATE POLICY "hub_posts_update" ON public.hub_posts FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_posts_delete" ON public.hub_posts FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "hub_post_likes_select" ON public.hub_post_likes;
DROP POLICY IF EXISTS "hub_post_likes_insert" ON public.hub_post_likes;
DROP POLICY IF EXISTS "hub_post_likes_delete" ON public.hub_post_likes;

CREATE POLICY "hub_post_likes_select" ON public.hub_post_likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.hub_posts hp
    JOIN public.hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
    WHERE hp.id = hub_post_id
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_post_likes_insert" ON public.hub_post_likes FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.hub_posts hp
      JOIN public.hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
      WHERE hp.id = hub_post_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
  )
);

CREATE POLICY "hub_post_likes_delete" ON public.hub_post_likes FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "hub_post_comments_select" ON public.hub_post_comments;
DROP POLICY IF EXISTS "hub_post_comments_insert" ON public.hub_post_comments;
DROP POLICY IF EXISTS "hub_post_comments_update" ON public.hub_post_comments;
DROP POLICY IF EXISTS "hub_post_comments_delete" ON public.hub_post_comments;

CREATE POLICY "hub_post_comments_select" ON public.hub_post_comments FOR SELECT USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.hub_posts hp
      JOIN public.hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
      WHERE hp.id = hub_post_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
  )
);

CREATE POLICY "hub_post_comments_insert" ON public.hub_post_comments FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.hub_posts hp
      JOIN public.hub_members hm ON hm.hub_id = hp.hub_id AND hm.user_id = auth.uid()
      WHERE hp.id = hub_post_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
  )
);

CREATE POLICY "hub_post_comments_update" ON public.hub_post_comments FOR UPDATE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_post_comments_delete" ON public.hub_post_comments FOR DELETE USING (
  author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- HUB RESOURCES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hub_resources_select" ON public.hub_resources;
DROP POLICY IF EXISTS "hub_resources_insert" ON public.hub_resources;
DROP POLICY IF EXISTS "hub_resources_delete" ON public.hub_resources;

CREATE POLICY "hub_resources_select" ON public.hub_resources FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hub_resources_insert" ON public.hub_resources FOR INSERT WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.hub_id = hub_id AND hm.user_id = auth.uid()
  )
);

CREATE POLICY "hub_resources_delete" ON public.hub_resources FOR DELETE USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- ADMIN RESOURCES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_resources_all" ON public.admin_resources;
CREATE POLICY "admin_resources_all" ON public.admin_resources FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- BUSINESS CARDS (owner + RPC for public slug)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "business_cards_public_select" ON public.business_cards;
DROP POLICY IF EXISTS "business_cards_insert" ON public.business_cards;
DROP POLICY IF EXISTS "business_cards_update" ON public.business_cards;

CREATE POLICY "business_cards_select_owner" ON public.business_cards FOR SELECT TO authenticated USING (
  user_id = auth.uid()
);

CREATE POLICY "business_cards_insert" ON public.business_cards FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "business_cards_update" ON public.business_cards FOR UPDATE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- PARTNER INVITES (admins / super_admins only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_invites_select_admin_or_creator" ON public.partner_invites;
DROP POLICY IF EXISTS "partner_invites_insert_admin" ON public.partner_invites;
DROP POLICY IF EXISTS "partner_invites_update_admin_or_creator" ON public.partner_invites;

CREATE POLICY "partner_invites_select_admin" ON public.partner_invites FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "partner_invites_insert_admin" ON public.partner_invites FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  AND created_by = auth.uid()
);

CREATE POLICY "partner_invites_update_admin" ON public.partner_invites FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- PARTNER APPLICATIONS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_applications_select_own_or_admin" ON public.partner_applications;
DROP POLICY IF EXISTS "partner_applications_insert_own" ON public.partner_applications;
DROP POLICY IF EXISTS "partner_applications_update_own_or_admin" ON public.partner_applications;

CREATE POLICY "partner_applications_select" ON public.partner_applications FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "partner_applications_insert" ON public.partner_applications FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "partner_applications_update_admin" ON public.partner_applications FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- PARTNER LISTINGS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_listings_select" ON public.partner_listings;
DROP POLICY IF EXISTS "partner_listings_insert_owner" ON public.partner_listings;
DROP POLICY IF EXISTS "partner_listings_update_owner" ON public.partner_listings;
DROP POLICY IF EXISTS "partner_listings_select_public_featured" ON public.partner_listings;
DROP POLICY IF EXISTS "partner_listings_delete" ON public.partner_listings;

CREATE POLICY "partner_listings_select" ON public.partner_listings FOR SELECT USING (
  user_id = auth.uid()
  OR is_featured = true
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL
        AND (
          (
            (p.subscription_status IN ('active', 'trialing') OR p.membership_override = true)
            AND p.member_type IN ('social', 'business')
          )
          OR p.member_type IN ('partner', 'vendor', 'venue', 'sponsor')
          OR p.partner_status = 'approved'
        )
    )
  )
);

CREATE POLICY "partner_listings_insert" ON public.partner_listings FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "partner_listings_update" ON public.partner_listings FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "partner_listings_delete" ON public.partner_listings FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- ADMIN CONVERSATIONS / PARTICIPANTS / MESSAGES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_conv_participants_select" ON public.admin_conversation_participants;
DROP POLICY IF EXISTS "admin_conv_participants_insert" ON public.admin_conversation_participants;
DROP POLICY IF EXISTS "admin_conv_participants_update" ON public.admin_conversation_participants;

CREATE POLICY "admin_conv_participants_select" ON public.admin_conversation_participants FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_conversations c
    WHERE c.id = admin_conversation_participants.conversation_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "admin_conv_participants_insert" ON public.admin_conversation_participants FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "admin_conv_participants_update" ON public.admin_conversation_participants FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "admin_conversations_select" ON public.admin_conversations;
DROP POLICY IF EXISTS "admin_conversations_insert" ON public.admin_conversations;
DROP POLICY IF EXISTS "admin_conversations_update" ON public.admin_conversations;

CREATE POLICY "admin_conversations_select" ON public.admin_conversations FOR SELECT USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversations.id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "admin_conversations_insert" ON public.admin_conversations FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "admin_conversations_update" ON public.admin_conversations FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversations.id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admin_messages_select" ON public.admin_messages;
DROP POLICY IF EXISTS "admin_messages_insert" ON public.admin_messages;

CREATE POLICY "admin_messages_select" ON public.admin_messages FOR SELECT USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_messages.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "admin_messages_insert" ON public.admin_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- EVENT INQUIRIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "event_inquiries_select" ON public.event_inquiries;
DROP POLICY IF EXISTS "event_inquiries_insert" ON public.event_inquiries;
DROP POLICY IF EXISTS "event_inquiries_update" ON public.event_inquiries;

CREATE POLICY "event_inquiries_select" ON public.event_inquiries FOR SELECT USING (
  partner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "event_inquiries_insert" ON public.event_inquiries FOR INSERT WITH CHECK (
  partner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "event_inquiries_update" ON public.event_inquiries FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "event_inquiry_messages_select" ON public.event_inquiry_messages;
DROP POLICY IF EXISTS "event_inquiry_messages_insert" ON public.event_inquiry_messages;

CREATE POLICY "event_inquiry_messages_select" ON public.event_inquiry_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.event_inquiries ei
    WHERE ei.id = event_inquiry_messages.inquiry_id
      AND (
        ei.partner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
      )
  )
);

CREATE POLICY "event_inquiry_messages_insert" ON public.event_inquiry_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.event_inquiries ei
    WHERE ei.id = inquiry_id
      AND (
        ei.partner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- PARTNER INVOICES (admins only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_invoices_select" ON public.partner_invoices;
DROP POLICY IF EXISTS "partner_invoices_insert_admin" ON public.partner_invoices;
DROP POLICY IF EXISTS "partner_invoices_update_admin" ON public.partner_invoices;

CREATE POLICY "partner_invoices_select" ON public.partner_invoices FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "partner_invoices_insert_admin" ON public.partner_invoices FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  AND created_by = auth.uid()
);

CREATE POLICY "partner_invoices_update_admin" ON public.partner_invoices FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- BLOG POSTS (anon + authenticated read published; admins all)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "blog_posts_select_published" ON public.blog_posts;
CREATE POLICY "blog_posts_select_published" ON public.blog_posts
FOR SELECT
TO anon, authenticated
USING (status = 'published');

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
