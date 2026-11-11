-- SQL41 Wallet pass issuance log for production. Do not run until ready.
-- Schema only. No data changes.
-- Do not run on develop (develop uses the matching migration).

begin;

-- TRIPWIRE 1: table must not already exist.
do $$
declare
  v_table boolean;
begin
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'wallet_pass_issues'
  ) into v_table;
  if v_table then
    raise exception 'TRIPWIRE 1: public.wallet_pass_issues already exists. Abort.';
  end if;
end $$;

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

-- TRIPWIRE 2: RLS on, no anon/authenticated grants, service_role can insert.
do $$
declare
  v_rls boolean;
  v_anon int;
  v_auth int;
  v_service int;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'wallet_pass_issues';
  if v_rls is not true then
    raise exception 'TRIPWIRE 2: wallet_pass_issues RLS is not enabled.';
  end if;

  select count(*) into v_anon
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'wallet_pass_issues' and grantee = 'anon';
  if v_anon > 0 then
    raise exception 'TRIPWIRE 2: anon has grants on wallet_pass_issues.';
  end if;

  select count(*) into v_auth
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'wallet_pass_issues' and grantee = 'authenticated';
  if v_auth > 0 then
    raise exception 'TRIPWIRE 2: authenticated has grants on wallet_pass_issues.';
  end if;

  select count(*) into v_service
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'wallet_pass_issues'
    and grantee = 'service_role'
    and privilege_type = 'INSERT';
  if v_service = 0 then
    raise exception 'TRIPWIRE 2: service_role cannot insert into wallet_pass_issues.';
  end if;
end $$;

-- TRIPWIRE 3: platform check constraint is apple|google.
do $$
declare
  v_con boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conname = 'wallet_pass_issues_platform_check'
      and conrelid = 'public.wallet_pass_issues'::regclass
  ) into v_con;
  if v_con is not true then
    raise exception 'TRIPWIRE 3: wallet_pass_issues_platform_check is missing.';
  end if;
end $$;

commit;
