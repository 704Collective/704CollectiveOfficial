-- ============================================================================
-- WAVE H1 — Network schema (additive only)
-- ============================================================================
-- cursor_report_hubpages_recon.md. Four new tables for the public hub pages
-- (/reset /nest /foundry /experience /enterprise /hall /lab), the paid listing
-- product, lead capture and click tracking. Nothing existing is touched: no
-- table, policy, trigger, function or edge function is altered.
--
-- Conventions (born-private):
--   * RLS enabled on every table; explicit revoke-then-grant per role.
--   * updated_at via the shared public.update_updated_at_column() trigger.
--   * Admin check = the dominant non-profiles convention:
--       exists (select 1 from profiles where id = auth.uid()
--               and role in ('admin','super_admin') and deleted_at is null)
--   * Leads and clicks are written by server routes under service role only;
--     anon/authenticated get no INSERT grant at all.
-- ============================================================================

-- ── 1. network_categories ────────────────────────────────────────────────────
create table if not exists public.network_categories (
  id          uuid primary key default gen_random_uuid(),
  hub         text not null
              constraint network_categories_hub_check
              check (hub = any (array['reset','nest','foundry','experience','enterprise','hall','lab'])),
  slug        text not null,
  label       text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint network_categories_hub_slug_key unique (hub, slug)
);

comment on table public.network_categories is
  'Wave H1. Categories per public hub page. One paid "seat" listing per category (enforced on network_listings). Public read of active rows; admin writes.';

drop trigger if exists update_network_categories_updated_at on public.network_categories;
create trigger update_network_categories_updated_at
  before update on public.network_categories
  for each row execute function public.update_updated_at_column();

alter table public.network_categories enable row level security;

drop policy if exists network_categories_public_read on public.network_categories;
create policy network_categories_public_read on public.network_categories
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists network_categories_admin_all on public.network_categories;
create policy network_categories_admin_all on public.network_categories
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null));

revoke all on table public.network_categories from public, anon, authenticated;
grant select on table public.network_categories to anon;
grant select, insert, update, delete on table public.network_categories to authenticated;  -- RLS admin policy gates writes
grant all on table public.network_categories to service_role;

-- ── 2. network_listings ──────────────────────────────────────────────────────
create table if not exists public.network_listings (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null
                       constraint network_listings_kind_check check (kind = any (array['seat','spotlight'])),
  hub                  text not null
                       constraint network_listings_hub_check
                       check (hub = any (array['reset','nest','foundry','experience','enterprise','hall','lab'])),
  category_id          uuid not null references public.network_categories(id),
  owner_profile_id     uuid references public.profiles(id) on delete set null,
  company_name         text not null,
  slug                 text not null,
  hook                 text,
  description          text,
  neighborhood         text,
  website_url          text,
  instagram_url        text,
  phone                text,
  logo_url             text,
  photo_urls           text[],
  status               text not null default 'draft'
                       constraint network_listings_status_check
                       check (status = any (array['draft','pending_review','live','paused','removed'])),
  verified_at          timestamptz,
  next_review_at       timestamptz,
  review_score         integer,
  hard_fail            boolean not null default false,
  billing_status       text
                       constraint network_listings_billing_status_check
                       check (billing_status is null or billing_status = any (array['active','past_due','canceled'])),
  stripe_customer_id   text,
  stripe_subscription_id text,
  rate_cents           integer,
  rate_locked_until    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint network_listings_slug_key unique (slug)
);

comment on table public.network_listings is
  'Wave H1. A business listing on a public hub page. kind=seat is the paid exclusive-per-category placement; spotlight is non-exclusive. Public read where status=live; owner reads/updates own row; admin full. Billing columns are stamped by server code only.';

-- ONE live seat per category (removed seats free the slot).
create unique index if not exists network_listings_one_seat_per_category
  on public.network_listings (category_id)
  where kind = 'seat' and status <> 'removed';

create index if not exists network_listings_hub_status_idx on public.network_listings (hub, status);
create index if not exists network_listings_owner_idx      on public.network_listings (owner_profile_id);

drop trigger if exists update_network_listings_updated_at on public.network_listings;
create trigger update_network_listings_updated_at
  before update on public.network_listings
  for each row execute function public.update_updated_at_column();

alter table public.network_listings enable row level security;

drop policy if exists network_listings_public_read on public.network_listings;
create policy network_listings_public_read on public.network_listings
  for select to anon, authenticated
  using (status = 'live');

drop policy if exists network_listings_owner_read on public.network_listings;
create policy network_listings_owner_read on public.network_listings
  for select to authenticated
  using (owner_profile_id = auth.uid());

drop policy if exists network_listings_owner_update on public.network_listings;
create policy network_listings_owner_update on public.network_listings
  for update to authenticated
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

drop policy if exists network_listings_admin_all on public.network_listings;
create policy network_listings_admin_all on public.network_listings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null));

revoke all on table public.network_listings from public, anon, authenticated;
grant select on table public.network_listings to anon;
grant select, insert, update, delete on table public.network_listings to authenticated;  -- owner update + admin all via RLS
grant all on table public.network_listings to service_role;

-- ── 3. network_leads ─────────────────────────────────────────────────────────
create table if not exists public.network_leads (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null references public.network_listings(id) on delete cascade,
  lead_name          text,
  lead_email         text,
  lead_phone         text,
  message            text,
  need               text,
  from_profile_id    uuid references public.profiles(id) on delete set null,
  source             text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  utm_content        text,
  utm_term           text,
  landing_path       text,
  status             text not null default 'new'
                     constraint network_leads_status_check check (status = any (array['new','won','lost'])),
  first_replied_at   timestamptz,
  status_changed_at  timestamptz,
  created_at         timestamptz not null default now()
);

comment on table public.network_leads is
  'Wave H1. An intro/lead sent to a listed business from a hub page. Inserted ONLY by server routes under service role; the listing owner and admins may read and update status.';

create index if not exists network_leads_listing_created_idx on public.network_leads (listing_id, created_at);

alter table public.network_leads enable row level security;

drop policy if exists network_leads_owner_read on public.network_leads;
create policy network_leads_owner_read on public.network_leads
  for select to authenticated
  using (
    exists (select 1 from public.network_listings l where l.id = network_leads.listing_id and l.owner_profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null)
  );

drop policy if exists network_leads_owner_update on public.network_leads;
create policy network_leads_owner_update on public.network_leads
  for update to authenticated
  using (
    exists (select 1 from public.network_listings l where l.id = network_leads.listing_id and l.owner_profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null)
  )
  with check (
    exists (select 1 from public.network_listings l where l.id = network_leads.listing_id and l.owner_profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null)
  );

revoke all on table public.network_leads from public, anon, authenticated;
grant select, update on table public.network_leads to authenticated;  -- no INSERT: service role writes only
grant all on table public.network_leads to service_role;

-- ── 4. network_click_events ──────────────────────────────────────────────────
create table if not exists public.network_click_events (
  id            bigint generated always as identity primary key,
  listing_id    uuid not null references public.network_listings(id) on delete cascade,
  target        text not null
                constraint network_click_events_target_check
                check (target = any (array['website','instagram','phone','profile','other'])),
  source        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  referrer      text,
  created_at    timestamptz not null default now()
);

comment on table public.network_click_events is
  'Wave H1. Outbound click / profile-view events on listings. Written ONLY by server routes under service role; admin read for dashboards.';

create index if not exists network_click_events_listing_created_idx on public.network_click_events (listing_id, created_at);

alter table public.network_click_events enable row level security;

drop policy if exists network_click_events_admin_read on public.network_click_events;
create policy network_click_events_admin_read on public.network_click_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null));

revoke all on table public.network_click_events from public, anon, authenticated;
grant select on table public.network_click_events to authenticated;  -- RLS limits to admins; no INSERT
grant all on table public.network_click_events to service_role;
grant usage, select on sequence public.network_click_events_id_seq to service_role;
