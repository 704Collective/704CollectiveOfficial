-- ============================================================================
-- WAVE H7 — Blog extension (additive only; two nullable columns on blog_posts)
-- ============================================================================
-- hub: when set, the post also renders under /[hub]/guides/[slug] (behind
--      HUB_PAGES_LIVE) and becomes that hub's "From the hub" content.
-- network_listing_ids: live listings "Mentioned in this guide".
-- Both NULL by default — every existing post behaves exactly as today.
-- No backfill. No other column, policy, index or trigger on blog_posts changes.
-- ============================================================================

alter table public.blog_posts
  add column if not exists hub text null
    constraint blog_posts_hub_check
    check (hub is null or hub = any (array['reset','nest','foundry','experience','enterprise','hall','lab'])),
  add column if not exists network_listing_ids uuid[] null;

comment on column public.blog_posts.hub is
  'Wave H7. Network hub this post belongs to; null = plain blog post (legacy behavior).';
comment on column public.blog_posts.network_listing_ids is
  'Wave H7. network_listings.id values mentioned in the post; only live ones render.';

create index if not exists blog_posts_hub_published_idx
  on public.blog_posts (hub, published_at desc) where hub is not null and status = 'published';
