-- SQL39 Turnstile check log for production. Do not run until ready.
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
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'turnstile_checks'
  ) into v_table;
  if v_table then
    raise exception 'TRIPWIRE 1: public.turnstile_checks already exists. Abort.';
  end if;
end $$;

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

-- TRIPWIRE 2: RLS on, no anon grants, service_role can insert.
do $$
declare
  v_rls boolean;
  v_anon int;
  v_service int;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'turnstile_checks';
  if v_rls is not true then
    raise exception 'TRIPWIRE 2: turnstile_checks RLS is not enabled.';
  end if;

  select count(*) into v_anon
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'turnstile_checks' and grantee = 'anon';
  if v_anon > 0 then
    raise exception 'TRIPWIRE 2: anon has grants on turnstile_checks.';
  end if;

  select count(*) into v_service
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'turnstile_checks'
    and grantee = 'service_role'
    and privilege_type = 'INSERT';
  if v_service = 0 then
    raise exception 'TRIPWIRE 2: service_role cannot insert into turnstile_checks.';
  end if;
end $$;

commit;
