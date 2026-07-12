-- =============================================================================
-- Partner portal, admin messaging, inquiries, invoices
-- Idempotent patterns; tables use IF NOT EXISTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles: partner fields
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_types text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_status text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_featured_partner boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- partner_invites (before partner_applications FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        text,
  unique_token text NOT NULL UNIQUE,
  used         boolean NOT NULL DEFAULT false,
  used_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  used_at      timestamptz,
  revoked      boolean NOT NULL DEFAULT false,
  revoked_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_invites_created_by_idx ON partner_invites(created_by);
CREATE INDEX IF NOT EXISTS partner_invites_email_idx ON partner_invites(email) WHERE email IS NOT NULL;

ALTER TABLE partner_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_invites_select_admin_or_creator" ON partner_invites;
CREATE POLICY "partner_invites_select_admin_or_creator" ON partner_invites FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND (p.role IN ('admin','super_admin') OR p.id = partner_invites.created_by)
  )
);

DROP POLICY IF EXISTS "partner_invites_insert_admin" ON partner_invites;
CREATE POLICY "partner_invites_insert_admin" ON partner_invites FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "partner_invites_update_admin_or_creator" ON partner_invites;
CREATE POLICY "partner_invites_update_admin_or_creator" ON partner_invites FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND (p.role IN ('admin','super_admin') OR p.id = partner_invites.created_by)
  )
);

-- ---------------------------------------------------------------------------
-- partner_applications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name   text NOT NULL,
  website        text,
  phone          text NOT NULL,
  description    text NOT NULL,
  logo_url       text,
  photo_urls     text[] NOT NULL DEFAULT '{}',
  partner_types  text[] NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reviewing','approved','denied')),
  invite_id      uuid REFERENCES partner_invites(id) ON DELETE SET NULL,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  denial_reason  text
);

CREATE INDEX IF NOT EXISTS partner_applications_user_id_idx ON partner_applications(user_id);
CREATE INDEX IF NOT EXISTS partner_applications_status_idx ON partner_applications(status);
CREATE INDEX IF NOT EXISTS partner_applications_invite_id_idx ON partner_applications(invite_id) WHERE invite_id IS NOT NULL;

ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_applications_select_own_or_admin" ON partner_applications;
CREATE POLICY "partner_applications_select_own_or_admin" ON partner_applications FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

DROP POLICY IF EXISTS "partner_applications_insert_own" ON partner_applications;
CREATE POLICY "partner_applications_insert_own" ON partner_applications FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "partner_applications_update_own_or_admin" ON partner_applications;
CREATE POLICY "partner_applications_update_own_or_admin" ON partner_applications FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- partner_listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company_name   text NOT NULL,
  description    text NOT NULL,
  website        text,
  phone          text,
  logo_url       text,
  photo_urls     text[] NOT NULL DEFAULT '{}',
  partner_types  text[] NOT NULL,
  is_featured    boolean NOT NULL DEFAULT false,
  featured_order integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_listings_featured_idx ON partner_listings(is_featured, featured_order)
  WHERE is_featured = true;

ALTER TABLE partner_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_listings_select" ON partner_listings;
CREATE POLICY "partner_listings_select" ON partner_listings FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND (
        (p.subscription_status IN ('active','trialing') OR p.membership_override = true)
        AND p.member_type IN ('social','business')
      )
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND (
        p.member_type IN ('partner','vendor','venue','sponsor')
        OR p.partner_status = 'approved'
      )
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

DROP POLICY IF EXISTS "partner_listings_insert_owner" ON partner_listings;
CREATE POLICY "partner_listings_insert_owner" ON partner_listings FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "partner_listings_update_owner" ON partner_listings;
CREATE POLICY "partner_listings_update_owner" ON partner_listings FOR UPDATE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- admin_conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('direct','group','partner_inquiry')),
  title       text,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  partner_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_conversations_created_by_idx ON admin_conversations(created_by);
CREATE INDEX IF NOT EXISTS admin_conversations_partner_id_idx ON admin_conversations(partner_id) WHERE partner_id IS NOT NULL;

ALTER TABLE admin_conversations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- admin_conversation_participants (before policies that reference this table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_conversation_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at     timestamptz,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS admin_conv_participants_conv_idx ON admin_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS admin_conv_participants_user_idx ON admin_conversation_participants(user_id);

ALTER TABLE admin_conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_conv_participants_select" ON admin_conversation_participants;
CREATE POLICY "admin_conv_participants_select" ON admin_conversation_participants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM admin_conversations c
    WHERE c.id = admin_conversation_participants.conversation_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND lower(p.email) = lower('adam@cltbucketlist.com')
  )
);

DROP POLICY IF EXISTS "admin_conv_participants_insert" ON admin_conversation_participants;
CREATE POLICY "admin_conv_participants_insert" ON admin_conversation_participants FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

DROP POLICY IF EXISTS "admin_conv_participants_update" ON admin_conversation_participants;
CREATE POLICY "admin_conv_participants_update" ON admin_conversation_participants FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND lower(p.email) = lower('adam@cltbucketlist.com')
  )
);

-- admin_conversations policies (after admin_conversation_participants exists)
DROP POLICY IF EXISTS "admin_conversations_select" ON admin_conversations;
CREATE POLICY "admin_conversations_select" ON admin_conversations FOR SELECT USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversations.id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND lower(p.email) = lower('adam@cltbucketlist.com')
  )
);

DROP POLICY IF EXISTS "admin_conversations_insert" ON admin_conversations;
CREATE POLICY "admin_conversations_insert" ON admin_conversations FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND (
        p.role IN ('admin','super_admin')
        OR lower(p.email) = lower('adam@cltbucketlist.com')
      )
  )
);

DROP POLICY IF EXISTS "admin_conversations_update" ON admin_conversations;
CREATE POLICY "admin_conversations_update" ON admin_conversations FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversations.id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      AND lower(p.email) = lower('adam@cltbucketlist.com')
  )
);

-- ---------------------------------------------------------------------------
-- admin_messages (references admin_conversations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content          text NOT NULL,
  image_urls       text[] NOT NULL DEFAULT '{}',
  file_urls        text[] NOT NULL DEFAULT '{}',
  file_names       text[] NOT NULL DEFAULT '{}',
  is_edited        boolean NOT NULL DEFAULT false,
  edited_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS admin_messages_conversation_id_idx ON admin_messages(conversation_id);
CREATE INDEX IF NOT EXISTS admin_messages_created_at_idx ON admin_messages(created_at DESC);

ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_messages_select" ON admin_messages;
CREATE POLICY "admin_messages_select" ON admin_messages FOR SELECT USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM admin_conversation_participants cp
      WHERE cp.conversation_id = admin_messages.conversation_id AND cp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL
        AND lower(p.email) = lower('adam@cltbucketlist.com')
    )
  )
);

DROP POLICY IF EXISTS "admin_messages_insert" ON admin_messages;
CREATE POLICY "admin_messages_insert" ON admin_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM admin_conversation_participants cp
      WHERE cp.conversation_id = admin_messages.conversation_id AND cp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL
        AND lower(p.email) = lower('adam@cltbucketlist.com')
    )
  )
);

-- ---------------------------------------------------------------------------
-- event_inquiries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_inquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id         uuid REFERENCES events(id) ON DELETE SET NULL,
  inquiry_type     text NOT NULL CHECK (inquiry_type IN ('vendor','sponsor','venue','new_event')),
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reviewing','approved','denied')),
  message          text NOT NULL,
  amount_offering  numeric,
  desired_return   text,
  custom_details   text,
  venue_address    text,
  venue_capacity   integer,
  venue_hours      text,
  venue_other_info text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_inquiries_partner_id_idx ON event_inquiries(partner_id);
CREATE INDEX IF NOT EXISTS event_inquiries_event_id_idx ON event_inquiries(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE event_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_inquiries_select" ON event_inquiries;
CREATE POLICY "event_inquiries_select" ON event_inquiries FOR SELECT USING (
  partner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

DROP POLICY IF EXISTS "event_inquiries_insert" ON event_inquiries;
CREATE POLICY "event_inquiries_insert" ON event_inquiries FOR INSERT WITH CHECK (
  partner_id = auth.uid()
);

DROP POLICY IF EXISTS "event_inquiries_update" ON event_inquiries;
CREATE POLICY "event_inquiries_update" ON event_inquiries FOR UPDATE USING (
  partner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- event_inquiry_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_inquiry_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id   uuid NOT NULL REFERENCES event_inquiries(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_inquiry_messages_inquiry_id_idx ON event_inquiry_messages(inquiry_id);

ALTER TABLE event_inquiry_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_inquiry_messages_select" ON event_inquiry_messages;
CREATE POLICY "event_inquiry_messages_select" ON event_inquiry_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM event_inquiries ei
    WHERE ei.id = event_inquiry_messages.inquiry_id
      AND (ei.partner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
      ))
  )
);

DROP POLICY IF EXISTS "event_inquiry_messages_insert" ON event_inquiry_messages;
CREATE POLICY "event_inquiry_messages_insert" ON event_inquiry_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM event_inquiries ei
    WHERE ei.id = inquiry_id
      AND (ei.partner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
      ))
  )
);

-- ---------------------------------------------------------------------------
-- partner_invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,
  amount              numeric NOT NULL,
  description         text NOT NULL,
  stripe_invoice_id   text,
  stripe_invoice_url  text,
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','waived')),
  waived_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  waived_at           timestamptz,
  due_date            timestamptz,
  created_by          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_invoices_partner_id_idx ON partner_invoices(partner_id);

ALTER TABLE partner_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_invoices_select" ON partner_invoices;
CREATE POLICY "partner_invoices_select" ON partner_invoices FOR SELECT USING (
  partner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);

DROP POLICY IF EXISTS "partner_invoices_insert_admin" ON partner_invoices;
CREATE POLICY "partner_invoices_insert_admin" ON partner_invoices FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "partner_invoices_update_admin" ON partner_invoices;
CREATE POLICY "partner_invoices_update_admin" ON partner_invoices FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin','super_admin')
  )
);
