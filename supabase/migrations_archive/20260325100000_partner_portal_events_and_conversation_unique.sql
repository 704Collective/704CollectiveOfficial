-- Partner portal: event inquiry flags + one partner↔team thread per partner
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS open_for_venue_partner boolean,
  ADD COLUMN IF NOT EXISTS open_for_sponsor_inquiry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendor_booth_spots_available integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS admin_conversations_one_partner_inquiry_per_partner
  ON admin_conversations (partner_id)
  WHERE type = 'partner_inquiry' AND partner_id IS NOT NULL;
