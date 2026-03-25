-- Public read of featured partner listings (marketing page logos)
DROP POLICY IF EXISTS "partner_listings_select_public_featured" ON partner_listings;
CREATE POLICY "partner_listings_select_public_featured" ON partner_listings
FOR SELECT
USING (is_featured = true);

-- Storage: partner-assets (public read; authenticated users upload under their user id folder)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('partner-assets', 'partner-assets', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "partner_assets_select_public" ON storage.objects;
CREATE POLICY "partner_assets_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'partner-assets');

DROP POLICY IF EXISTS "partner_assets_insert_own_folder" ON storage.objects;
CREATE POLICY "partner_assets_insert_own_folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "partner_assets_update_own_folder" ON storage.objects;
CREATE POLICY "partner_assets_update_own_folder" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "partner_assets_delete_own_folder" ON storage.objects;
CREATE POLICY "partner_assets_delete_own_folder" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);
