-- Blog CMS: SEO, TOC, embeds, related posts
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS cover_image_alt text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS focus_keyword text,
  ADD COLUMN IF NOT EXISTS schema_type text NOT NULL DEFAULT 'BlogPosting',
  ADD COLUMN IF NOT EXISTS reading_time_minutes integer,
  ADD COLUMN IF NOT EXISTS show_table_of_contents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_embed_url text,
  ADD COLUMN IF NOT EXISTS tiktok_embed_url text,
  ADD COLUMN IF NOT EXISTS related_post_ids uuid[] DEFAULT '{}';

UPDATE public.blog_posts
SET schema_type = 'BlogPosting'
WHERE schema_type IS NULL OR schema_type NOT IN ('BlogPosting', 'Article', 'NewsArticle');

UPDATE public.blog_posts
SET related_post_ids = '{}'
WHERE related_post_ids IS NULL;

ALTER TABLE public.blog_posts
  DROP CONSTRAINT IF EXISTS blog_posts_schema_type_check;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_schema_type_check
  CHECK (schema_type IN ('BlogPosting', 'Article', 'NewsArticle'));
