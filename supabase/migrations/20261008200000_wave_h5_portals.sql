-- ============================================================================
-- WAVE H5 — Portals (additive only)
-- ============================================================================
-- network_listings gains a staging area for owner edits. The listing-only
-- portal writes ONLY these two columns (via a service-role server action);
-- the live content columns change only when an admin applies the pending
-- edit from /admin/network. No policies, triggers or existing columns altered.
-- ============================================================================

alter table public.network_listings
  add column if not exists pending_content      jsonb,
  add column if not exists pending_submitted_at timestamptz;

comment on column public.network_listings.pending_content is
  'Wave H5. Owner-submitted edits awaiting 704 review: subset of {company_name, hook, description, neighborhood, website_url, instagram_url, phone, logo_url, photo_urls}. Applied or discarded by an admin.';
comment on column public.network_listings.pending_submitted_at is
  'Wave H5. When pending_content was last submitted; null once applied/discarded.';

create index if not exists network_listings_pending_idx
  on public.network_listings (pending_submitted_at) where pending_content is not null;
