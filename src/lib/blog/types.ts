import type { BlogSchemaType } from '@/lib/blog/schemaTypes';

export type BlogPostStatus = 'draft' | 'published';

export interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  canonical_url: string | null;
  focus_keyword: string | null;
  schema_type: BlogSchemaType | null;
  reading_time_minutes: number | null;
  show_table_of_contents: boolean | null;
  instagram_embed_url: string | null;
  tiktok_embed_url: string | null;
  related_post_ids: string[] | null;
  author: string | null;
  status: BlogPostStatus;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
