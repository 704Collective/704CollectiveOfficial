-- Wallet pass issuance log. Independent of attendance_credentials.
-- Written only by the service role from generate-apple-wallet-pass
-- and generate-wallet-pass (Google).

create table if not exists public.wallet_pass_issues (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  object_or_serial text not null,
  created_at timestamptz not null default now(),
  constraint wallet_pass_issues_platform_check
    check (platform in ('apple', 'google'))
);

comment on table public.wallet_pass_issues is
  'Apple/Google wallet pass issuance log. Service role only. Not attendance_credentials.';

create index if not exists wallet_pass_issues_created_at_idx
  on public.wallet_pass_issues (created_at desc);

create index if not exists wallet_pass_issues_profile_id_idx
  on public.wallet_pass_issues (profile_id, created_at desc);

alter table public.wallet_pass_issues enable row level security;

revoke all on table public.wallet_pass_issues from public, anon, authenticated;
grant select, insert, update, delete on public.wallet_pass_issues to service_role;
