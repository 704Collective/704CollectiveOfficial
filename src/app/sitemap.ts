import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { hubPagesLive } from "@/lib/network/flags";
import { VISIBLE_HUBS } from "@/lib/network/hubs";
import { getLiveListingSlugs } from "@/lib/network/queries";

const BASE_URL = "https://704collective.com";

async function getPublishedBlogSlugs(): Promise<{ slug: string; updated_at: string | null }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false });
    return (data ?? []) as { slug: string; updated_at: string | null }[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/social`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/business`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/events`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/partners`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const blogPosts = await getPublishedBlogSlugs();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at ? new Date(post.updated_at) : now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Wave H3 — Network pages appear ONLY when the launch flag is on. /out and
  // /intro are deliberately never listed.
  let networkEntries: MetadataRoute.Sitemap = [];
  if (hubPagesLive()) {
    const hubEntries: MetadataRoute.Sitemap = VISIBLE_HUBS.map((h) => ({
      url: `${BASE_URL}/${h}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9,
    }));
    const staticNetwork: MetadataRoute.Sitemap = [
      { url: `${BASE_URL}/get-listed`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
      { url: `${BASE_URL}/how-we-vet`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    ];
    let profiles: MetadataRoute.Sitemap = [];
    try {
      profiles = (await getLiveListingSlugs(VISIBLE_HUBS)).map((l) => ({
        url: `${BASE_URL}/${l.hub}/${l.slug}`,
        lastModified: l.updated_at ? new Date(l.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    } catch { profiles = []; }
    networkEntries = [...hubEntries, ...staticNetwork, ...profiles];
  }

  return [...staticPages, ...blogEntries, ...networkEntries];
}
