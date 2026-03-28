-- Blog CMS: posts + public bucket for cover images
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text NOT NULL,
  cover_image_url text,
  author text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  tags text[],
  meta_title text,
  meta_description text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_published_at_idx ON blog_posts(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts(status);

CREATE OR REPLACE FUNCTION public.touch_blog_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_posts_touch_updated_at ON public.blog_posts;
CREATE TRIGGER blog_posts_touch_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_blog_posts_updated_at();

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blog_posts_select_published" ON blog_posts;
CREATE POLICY "blog_posts_select_published" ON blog_posts
FOR SELECT
USING (status = 'published');

DROP POLICY IF EXISTS "blog_posts_select_admin" ON blog_posts;
CREATE POLICY "blog_posts_select_admin" ON blog_posts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "blog_posts_insert_admin" ON blog_posts;
CREATE POLICY "blog_posts_insert_admin" ON blog_posts
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "blog_posts_update_admin" ON blog_posts;
CREATE POLICY "blog_posts_update_admin" ON blog_posts
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "blog_posts_delete_admin" ON blog_posts;
CREATE POLICY "blog_posts_delete_admin" ON blog_posts
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

-- Storage: blog-images (public read; admins upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('blog-images', 'blog-images', true, 512000)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 512000;

DROP POLICY IF EXISTS "blog_images_select_public" ON storage.objects;
CREATE POLICY "blog_images_select_public" ON storage.objects
FOR SELECT USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "blog_images_insert_admin" ON storage.objects;
CREATE POLICY "blog_images_insert_admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'blog-images'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "blog_images_update_admin" ON storage.objects;
CREATE POLICY "blog_images_update_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'blog-images'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "blog_images_delete_admin" ON storage.objects;
CREATE POLICY "blog_images_delete_admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'blog-images'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND p.deleted_at IS NULL
  )
);
