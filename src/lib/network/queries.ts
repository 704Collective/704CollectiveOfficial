// Server-side reads for the public Network pages. Anon key only: the RLS from
// Wave H1 already restricts network_categories to is_active and
// network_listings to status='live', so nothing here can leak a draft.
import { createClient } from '@supabase/supabase-js';
import type { HubSlug } from './hubs';

export type NetworkCategory = { id: string; hub: HubSlug; slug: string; label: string; sort_order: number };
export type NetworkListing = {
  id: string;
  kind: 'seat' | 'spotlight';
  hub: HubSlug;
  category_id: string;
  owner_profile_id: string | null;
  company_name: string;
  slug: string;
  hook: string | null;
  description: string | null;
  neighborhood: string | null;
  website_url: string | null;
  instagram_url: string | null;
  phone: string | null;
  logo_url: string | null;
  photo_urls: string[] | null;
  status: string;
  verified_at: string | null;
  next_review_at: string | null;
  review_score: number | null;
  created_at: string;
};
export type HubBlogPost = { slug: string; hub: string | null; title: string; excerpt: string | null; cover_image_url: string | null; published_at: string | null; reading_time_minutes: number | null };
export type HubEvent = { id: string; title: string; start_time: string; location_name: string | null; image_url: string | null };

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}

export async function getHubCategories(hub: HubSlug): Promise<NetworkCategory[]> {
  const { data } = await anon().from('network_categories').select('id, hub, slug, label, sort_order').eq('hub', hub).eq('is_active', true).order('sort_order').order('label');
  return (data ?? []) as NetworkCategory[];
}

export async function getHubListings(hub: HubSlug): Promise<NetworkListing[]> {
  const { data } = await anon().from('network_listings').select('*').eq('hub', hub).eq('status', 'live').order('kind').order('created_at');
  return (data ?? []) as NetworkListing[];
}

export async function getListingBySlug(hub: HubSlug, slug: string): Promise<(NetworkListing & { category: NetworkCategory | null }) | null> {
  const { data } = await anon().from('network_listings').select('*, category:network_categories(id, hub, slug, label, sort_order)').eq('hub', hub).eq('slug', slug).eq('status', 'live').maybeSingle();
  if (!data) return null;
  const row = data as NetworkListing & { category: NetworkCategory | NetworkCategory[] | null };
  return { ...row, category: Array.isArray(row.category) ? row.category[0] ?? null : row.category };
}

export async function getLiveListingSlugs(hubs: readonly HubSlug[]): Promise<{ hub: HubSlug; slug: string; updated_at: string | null }[]> {
  const { data } = await anon().from('network_listings').select('hub, slug, updated_at').eq('status', 'live').in('hub', [...hubs]);
  return (data ?? []) as { hub: HubSlug; slug: string; updated_at: string | null }[];
}

/** Latest 3 published posts on this hub (Wave H7: by the `hub` column, not tags); [] hides the section. */
export async function getHubPosts(hub: HubSlug): Promise<HubBlogPost[]> {
  const { data, error } = await anon().from('blog_posts').select('slug, hub, title, excerpt, cover_image_url, published_at, reading_time_minutes').eq('status', 'published').not('published_at', 'is', null).eq('hub', hub).order('published_at', { ascending: false }).limit(3);
  if (error) return [];
  return (data ?? []) as HubBlogPost[];
}

/** Next published upcoming event for the "Meet the room in person" teaser. */
export async function getNextEvent(): Promise<HubEvent | null> {
  const { data } = await anon().from('events').select('id, title, start_time, location_name, image_url').eq('is_published', true).gte('start_time', new Date().toISOString()).order('start_time').limit(1).maybeSingle();
  return (data as HubEvent | null) ?? null;
}
