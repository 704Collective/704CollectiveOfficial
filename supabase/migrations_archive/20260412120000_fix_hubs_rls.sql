-- Enable RLS if not already enabled
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can manage hubs" ON hubs;
DROP POLICY IF EXISTS "Members can view hubs" ON hubs;
DROP POLICY IF EXISTS "Anyone can view hubs" ON hubs;

-- Admins can do everything
CREATE POLICY "Admins can manage hubs"
ON hubs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- All authenticated users can view hubs
CREATE POLICY "Members can view hubs"
ON hubs
FOR SELECT
USING (auth.uid() IS NOT NULL);
