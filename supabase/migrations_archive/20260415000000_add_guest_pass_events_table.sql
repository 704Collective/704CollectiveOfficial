CREATE TABLE IF NOT EXISTS guest_pass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_pass_code text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  inviter_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE guest_pass_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view guest pass events"
ON guest_pass_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Service role can insert guest pass events"
ON guest_pass_events FOR INSERT
WITH CHECK (true);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_detail text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE TABLE IF NOT EXISTS contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(contact_id, tag)
);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact tags"
ON contact_tags FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Service role can manage contact tags"
ON contact_tags FOR ALL
WITH CHECK (true);
