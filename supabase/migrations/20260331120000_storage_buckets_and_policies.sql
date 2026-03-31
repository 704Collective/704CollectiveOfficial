-- =============================================================================
-- Storage buckets + RLS policies (idempotent)
-- portal-media, portal-files, hub-files, admin-resources, partner-assets, blog-images
-- =============================================================================

-- ── Helpers (SECURITY DEFINER so storage policies can use profiles safely) ──

CREATE OR REPLACE FUNCTION public.storage_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_is_portal_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND (
        p.role IN ('admin', 'super_admin')
        OR p.subscription_status IN ('active', 'trialing')
        OR p.membership_override = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_is_hub_member_for_path(path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hub_members hm
    WHERE hm.user_id = auth.uid()
      AND hm.hub_id::text = split_part(path, '/', 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_hub_path_valid(path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

-- ── Buckets ─────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('portal-media', 'portal-media', true, 52428800),
  ('portal-files', 'portal-files', true, 104857600),
  ('hub-files', 'hub-files', true, 104857600),
  ('admin-resources', 'admin-resources', true, 104857600),
  ('blog-images', 'blog-images', true, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('partner-assets', 'partner-assets', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── Drop legacy policies on these buckets (by name prefix) ────────────────
-- portal-media / portal-files
DROP POLICY IF EXISTS "portal_media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "portal_media_insert_members" ON storage.objects;
DROP POLICY IF EXISTS "portal_media_update_members" ON storage.objects;
DROP POLICY IF EXISTS "portal_media_delete_members" ON storage.objects;
DROP POLICY IF EXISTS "portal_files_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "portal_files_insert_members" ON storage.objects;
DROP POLICY IF EXISTS "portal_files_update_members" ON storage.objects;
DROP POLICY IF EXISTS "portal_files_delete_members" ON storage.objects;

-- hub-files
DROP POLICY IF EXISTS "hub_files_select_hub_member" ON storage.objects;
DROP POLICY IF EXISTS "hub_files_insert_hub_member" ON storage.objects;
DROP POLICY IF EXISTS "hub_files_update_hub_member" ON storage.objects;
DROP POLICY IF EXISTS "hub_files_delete_hub_member" ON storage.objects;

-- admin-resources
DROP POLICY IF EXISTS "admin_resources_select_members" ON storage.objects;
DROP POLICY IF EXISTS "admin_resources_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "admin_resources_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "admin_resources_delete_admin" ON storage.objects;

-- blog-images
DROP POLICY IF EXISTS "blog_images_select_public" ON storage.objects;
DROP POLICY IF EXISTS "blog_images_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "blog_images_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "blog_images_delete_admin" ON storage.objects;

-- partner-assets (recreate below for consistency)
DROP POLICY IF EXISTS "partner_assets_select_public" ON storage.objects;
DROP POLICY IF EXISTS "partner_assets_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "partner_assets_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "partner_assets_delete_own_folder" ON storage.objects;

-- ── portal-media: public read; uploads for active members + admins ─────────
CREATE POLICY "portal_media_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'portal-media');

CREATE POLICY "portal_media_insert_members" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portal-media'
  AND public.storage_is_portal_member()
);

CREATE POLICY "portal_media_update_members" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'portal-media'
  AND public.storage_is_portal_member()
);

CREATE POLICY "portal_media_delete_members" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'portal-media'
  AND public.storage_is_portal_member()
);

-- ── portal-files: same pattern ─────────────────────────────────────────────
CREATE POLICY "portal_files_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'portal-files');

CREATE POLICY "portal_files_insert_members" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portal-files'
  AND public.storage_is_portal_member()
);

CREATE POLICY "portal_files_update_members" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'portal-files'
  AND public.storage_is_portal_member()
);

CREATE POLICY "portal_files_delete_members" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'portal-files'
  AND public.storage_is_portal_member()
);

-- ── hub-files: first path segment = hub id; hub members + admins ───────────
CREATE POLICY "hub_files_select_hub_member" ON storage.objects
FOR SELECT USING (
  bucket_id = 'hub-files'
  AND (
    public.storage_is_admin()
    OR (
      public.storage_hub_path_valid(name)
      AND public.storage_is_hub_member_for_path(name)
    )
  )
);

CREATE POLICY "hub_files_insert_hub_member" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hub-files'
  AND public.storage_hub_path_valid(name)
  AND (
    public.storage_is_admin()
    OR public.storage_is_hub_member_for_path(name)
  )
);

CREATE POLICY "hub_files_update_hub_member" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'hub-files'
  AND public.storage_hub_path_valid(name)
  AND (
    public.storage_is_admin()
    OR public.storage_is_hub_member_for_path(name)
  )
);

CREATE POLICY "hub_files_delete_hub_member" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'hub-files'
  AND public.storage_hub_path_valid(name)
  AND (
    public.storage_is_admin()
    OR public.storage_is_hub_member_for_path(name)
  )
);

-- ── admin-resources: admins write; active members read ────────────────────
CREATE POLICY "admin_resources_select_members" ON storage.objects
FOR SELECT USING (
  bucket_id = 'admin-resources'
  AND (
    public.storage_is_admin()
    OR public.storage_is_portal_member()
  )
);

CREATE POLICY "admin_resources_insert_admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'admin-resources'
  AND public.storage_is_admin()
);

CREATE POLICY "admin_resources_update_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'admin-resources'
  AND public.storage_is_admin()
);

CREATE POLICY "admin_resources_delete_admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'admin-resources'
  AND public.storage_is_admin()
);

-- ── blog-images: public read; admin write only ──────────────────────────────
CREATE POLICY "blog_images_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'blog-images');

CREATE POLICY "blog_images_insert_admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'blog-images'
  AND public.storage_is_admin()
);

CREATE POLICY "blog_images_update_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'blog-images'
  AND public.storage_is_admin()
);

CREATE POLICY "blog_images_delete_admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'blog-images'
  AND public.storage_is_admin()
);

-- ── partner-assets: public read; upload under own user id folder ────────────
CREATE POLICY "partner_assets_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'partner-assets');

CREATE POLICY "partner_assets_insert_own_folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "partner_assets_update_own_folder" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "partner_assets_delete_own_folder" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND split_part(name, '/', 1) = auth.uid()::text
);
