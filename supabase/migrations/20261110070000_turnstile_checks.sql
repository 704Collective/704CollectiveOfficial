-- Server-side Turnstile verification log. Written only by the service role.
-- Log mode records every check and still allows the request; block mode
-- uses the same rows but rejects when ok=false.

create table if not exists public.turnstile_checks (
  id uuid primary key default gen_random_uuid(),
  form text not null,
  ok boolean not null,
  error_codes text[] not null default '{}'::text[],
  reason text,
  ip_hash text,
  created_at timestamptz not null default now()
);

comment on table public.turnstile_checks is
  'Cloudflare Turnstile siteverify results. Service role only. No emails, no raw IPs.';

create index if not exists turnstile_checks_created_at_idx
  on public.turnstile_checks (created_at desc);

create index if not exists turnstile_checks_form_created_at_idx
  on public.turnstile_checks (form, created_at desc);

alter table public.turnstile_checks enable row level security;

revoke all on table public.turnstile_checks from public, anon, authenticated;
grant select, insert, update, delete on public.turnstile_checks to service_role;
