-- ============================================================================
-- WAVE H3 — network_listing_applications (additive only)
-- ============================================================================
-- The /get-listed application form. Written ONLY by the server route
-- (POST /api/network/apply) under service role; admins read and update status.
-- Same born-private conventions as Wave H1: RLS on, explicit revoke-then-grant,
-- updated_at via the shared trigger, admin check = profiles.role convention.
-- Nothing existing is altered.
-- ============================================================================

create table if not exists public.network_listing_applications (
  id                  uuid primary key default gen_random_uuid(),
  business_name       text not null,
  hub                 text not null
                      constraint network_listing_applications_hub_check
                      check (hub = any (array['reset','nest','foundry','experience','enterprise','hall','lab'])),
  category_text       text not null,
  website_url         text,
  instagram           text,
  google_profile_url  text,
  years_in_business   text,
  why_704             text,
  heard_about         text,
  contact_name        text,
  contact_email       text not null,
  contact_phone       text,
  status              text not null default 'pending'
                      constraint network_listing_applications_status_check
                      check (status = any (array['pending','reviewing','waitlisted','approved','declined'])),
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.profiles(id) on delete set null,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  utm_term            text,
  landing_path        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.network_listing_applications is
  'Wave H3. Get Listed applications from the public hub pages. Inserted by the server route under service role; admins review. No anon/authenticated writes.';

create index if not exists network_listing_applications_status_created_idx
  on public.network_listing_applications (status, created_at desc);

drop trigger if exists update_network_listing_applications_updated_at on public.network_listing_applications;
create trigger update_network_listing_applications_updated_at
  before update on public.network_listing_applications
  for each row execute function public.update_updated_at_column();

alter table public.network_listing_applications enable row level security;

drop policy if exists network_listing_applications_admin_read on public.network_listing_applications;
create policy network_listing_applications_admin_read on public.network_listing_applications
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null));

drop policy if exists network_listing_applications_admin_update on public.network_listing_applications;
create policy network_listing_applications_admin_update on public.network_listing_applications
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['admin','super_admin']) and p.deleted_at is null));

revoke all on table public.network_listing_applications from public, anon, authenticated;
grant select, update on table public.network_listing_applications to authenticated;  -- RLS limits to admins; no INSERT
grant all on table public.network_listing_applications to service_role;
