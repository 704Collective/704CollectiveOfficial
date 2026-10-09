// Wave H7 — blog ↔ hub glue. Anon-key reads only (RLS: published posts, live listings).
import { createClient } from '@supabase/supabase-js';
import type { BlogPostRow } from '@/lib/blog/types';
import { hubPagesLive } from './flags';
import { isVisibleHub, type HubSlug } from './hubs';
import type { NetworkCategory, NetworkListing } from './queries';

const SITE = 'https://704collective.com';

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}

/** Canonical for a post: manual canonical_url wins; hub-tagged + flag on → hub guide path; else /blog/[slug]. */
export function postCanonical(post: Pick<BlogPostRow, 'slug' | 'canonical_url' | 'hub'>): string {
  const c = post.canonical_url?.trim();
  if (c && (c.startsWith('http://') || c.startsWith('https://'))) return c;
  if (post.hub && isVisibleHub(post.hub) && hubPagesLive()) return `${SITE}/${post.hub}/guides/${post.slug}`;
  return `${SITE}/blog/${post.slug}`;
}

/** Site-relative path where a post should be linked from inside the Network (hub path when live, else /blog). */
export function postPath(post: Pick<BlogPostRow, 'slug' | 'hub'>): string {
  if (post.hub && isVisibleHub(post.hub) && hubPagesLive()) return `/${post.hub}/guides/${post.slug}`;
  return `/blog/${post.slug}`;
}

export async function getHubGuides(hub: HubSlug): Promise<BlogPostRow[]> {
  const { data, error } = await anon().from('blog_posts').select('*').eq('hub', hub).eq('status', 'published').not('published_at', 'is', null).order('published_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as BlogPostRow[];
}

export async function getHubGuide(hub: HubSlug, slug: string): Promise<BlogPostRow | null> {
  const { data, error } = await anon().from('blog_posts').select('*').eq('hub', hub).eq('slug', slug).eq('status', 'published').not('published_at', 'is', null).maybeSingle();
  if (error || !data) return null;
  return data as BlogPostRow;
}

/** Live listings referenced by a post, in the post's order. Paused/removed/draft listings simply drop out (RLS: status='live'). */
export async function getMentionedListings(ids: string[] | null | undefined): Promise<{ listings: NetworkListing[]; cats: NetworkCategory[] }> {
  if (!ids?.length) return { listings: [], cats: [] };
  const sb = anon();
  const { data } = await sb.from('network_listings').select('*').in('id', ids).eq('status', 'live');
  const rows = ((data ?? []) as NetworkListing[]).filter((l) => isVisibleHub(l.hub));
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const catIds = [...new Set(rows.map((l) => l.category_id))];
  const { data: cats } = catIds.length ? await sb.from('network_categories').select('id, hub, slug, label, sort_order').in('id', catIds) : { data: [] };
  return { listings: rows, cats: (cats ?? []) as NetworkCategory[] };
}

/** Hub-tagged published posts for the sitemap (flag on only). */
export async function getHubGuideSlugs(hubs: readonly HubSlug[]): Promise<{ hub: HubSlug; slug: string; updated_at: string | null }[]> {
  const { data } = await anon().from('blog_posts').select('hub, slug, updated_at').eq('status', 'published').not('published_at', 'is', null).in('hub', [...hubs]);
  return (data ?? []) as { hub: HubSlug; slug: string; updated_at: string | null }[];
}
