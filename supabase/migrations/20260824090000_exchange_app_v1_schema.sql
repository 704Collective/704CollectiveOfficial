-- Capture-only. Exchange App v1 schema (UTM columns + mixer tables), hand-applied
-- to develop and prod Aug 24. Both environments already have it.
-- Idempotent by construction. Transcribed from the live prod catalog
-- (information_schema.columns, pg_constraint, pg_indexes, pg_policies) on Aug 24, 2026;
-- develop was diffed against prod the same day and the column sets are identical.


-- ============================================================
-- exchange_intake: the four UTM columns (prod ordinal positions 26-29)
-- All plain nullable text. No defaults, no indexes, no backfill:
-- every pre-ship row reads null, which the viewer renders as Direct/Organic.
-- ============================================================

alter table public.exchange_intake add column if not exists utm_source   text;
alter table public.exchange_intake add column if not exists utm_medium   text;
alter table public.exchange_intake add column if not exists utm_campaign text;
alter table public.exchange_intake add column if not exists utm_content  text;


-- ============================================================
-- exchange_mixer_config: one row per event, the knobs Adam turns from his phone.
-- Defaults are the house defaults: 12 tables x 6 seats, 7 rounds, 6 minutes, cap 72.
-- ============================================================

create table if not exists public.exchange_mixer_config (
  event_id               uuid        not null,
  format                 text        not null default 'speed_rounds'::text,
  tables_count           integer     not null default 12,
  seats_per_table        integer     not null default 6,
  planned_rounds         integer     not null default 7,
  round_duration_seconds integer     not null default 360,
  mixer_cap              integer     not null default 72,
  updated_at             timestamptz not null default now(),
  constraint exchange_mixer_config_pkey primary key (event_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_mixer_config'::regclass
      and conname = 'exchange_mixer_config_event_id_fkey'
  ) then
    alter table public.exchange_mixer_config
      add constraint exchange_mixer_config_event_id_fkey
      foreign key (event_id) references public.events(id) on delete cascade;
  end if;
end $$;


-- ============================================================
-- exchange_mixer_overrides: per-person in/out for the rounds.
-- Composite PK (event_id, credential_id) is what the UI upserts on;
-- there is deliberately no surrogate id column.
-- `included` carries no default: a row exists only because someone decided.
-- ============================================================

create table if not exists public.exchange_mixer_overrides (
  event_id      uuid        not null,
  credential_id uuid        not null,
  included      boolean     not null,
  note          text,
  updated_at    timestamptz not null default now(),
  constraint exchange_mixer_overrides_pkey primary key (event_id, credential_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_mixer_overrides'::regclass
      and conname = 'exchange_mixer_overrides_event_id_fkey'
  ) then
    alter table public.exchange_mixer_overrides
      add constraint exchange_mixer_overrides_event_id_fkey
      foreign key (event_id) references public.events(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_mixer_overrides'::regclass
      and conname = 'exchange_mixer_overrides_credential_id_fkey'
  ) then
    alter table public.exchange_mixer_overrides
      add constraint exchange_mixer_overrides_credential_id_fkey
      foreign key (credential_id) references public.attendance_credentials(id) on delete cascade;
  end if;
end $$;


-- ============================================================
-- exchange_rounds: one row per mix. status drives the whole night.
-- 'discarded' is how RESHUFFLE retires a proposal, and pair history counts
-- 'completed' rounds only, so a discarded mix never happened.
-- ============================================================

create table if not exists public.exchange_rounds (
  id               uuid        not null default gen_random_uuid(),
  event_id         uuid        not null,
  round_number     integer     not null,
  status           text        not null default 'pending'::text,
  tables_used      integer,
  seats_per_table  integer,
  duration_seconds integer,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  constraint exchange_rounds_pkey primary key (id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_rounds'::regclass
      and conname = 'exchange_rounds_status_check'
  ) then
    alter table public.exchange_rounds
      add constraint exchange_rounds_status_check
      check (status = any (array['pending'::text, 'active'::text, 'completed'::text, 'discarded'::text]));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_rounds'::regclass
      and conname = 'exchange_rounds_event_id_fkey'
  ) then
    alter table public.exchange_rounds
      add constraint exchange_rounds_event_id_fkey
      foreign key (event_id) references public.events(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_exchange_rounds_event
  on public.exchange_rounds using btree (event_id);


-- ============================================================
-- exchange_round_seats: who sat where. UNIQUE (round_id, credential_id)
-- makes double-seating one body in one round impossible at the storage layer.
-- The table is keyed to the round, not the event; the event is reached through it.
-- ============================================================

create table if not exists public.exchange_round_seats (
  id            uuid        not null default gen_random_uuid(),
  round_id      uuid        not null,
  table_number  integer     not null,
  credential_id uuid        not null,
  person_id     uuid,
  display_name  text        not null,
  created_at    timestamptz not null default now(),
  constraint exchange_round_seats_pkey primary key (id),
  constraint exchange_round_seats_round_id_credential_id_key unique (round_id, credential_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_round_seats'::regclass
      and conname = 'exchange_round_seats_round_id_fkey'
  ) then
    alter table public.exchange_round_seats
      add constraint exchange_round_seats_round_id_fkey
      foreign key (round_id) references public.exchange_rounds(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_round_seats'::regclass
      and conname = 'exchange_round_seats_credential_id_fkey'
  ) then
    alter table public.exchange_round_seats
      add constraint exchange_round_seats_credential_id_fkey
      foreign key (credential_id) references public.attendance_credentials(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exchange_round_seats'::regclass
      and conname = 'exchange_round_seats_person_id_fkey'
  ) then
    alter table public.exchange_round_seats
      add constraint exchange_round_seats_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
end $$;

create index if not exists idx_exchange_round_seats_round
  on public.exchange_round_seats using btree (round_id);


-- ============================================================
-- RLS. All four tables: admins do everything, anon does nothing.
-- The admin pages read and write these directly from the browser, so the
-- policy is the only gate at the data layer (middleware gates the route).
-- ============================================================

alter table public.exchange_mixer_config    enable row level security;
alter table public.exchange_mixer_overrides enable row level security;
alter table public.exchange_rounds          enable row level security;
alter table public.exchange_round_seats     enable row level security;

drop policy if exists exchange_mixer_config_admin_all on public.exchange_mixer_config;
create policy exchange_mixer_config_admin_all on public.exchange_mixer_config
  as permissive for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin'::text, 'super_admin'::text])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid()
                        and profiles.role = any (array['admin'::text, 'super_admin'::text])));

drop policy if exists exchange_mixer_config_anon_deny on public.exchange_mixer_config;
create policy exchange_mixer_config_anon_deny on public.exchange_mixer_config
  as permissive for all to anon using (false);

drop policy if exists exchange_mixer_overrides_admin_all on public.exchange_mixer_overrides;
create policy exchange_mixer_overrides_admin_all on public.exchange_mixer_overrides
  as permissive for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin'::text, 'super_admin'::text])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid()
                        and profiles.role = any (array['admin'::text, 'super_admin'::text])));

drop policy if exists exchange_mixer_overrides_anon_deny on public.exchange_mixer_overrides;
create policy exchange_mixer_overrides_anon_deny on public.exchange_mixer_overrides
  as permissive for all to anon using (false);

drop policy if exists exchange_rounds_admin_all on public.exchange_rounds;
create policy exchange_rounds_admin_all on public.exchange_rounds
  as permissive for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin'::text, 'super_admin'::text])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid()
                        and profiles.role = any (array['admin'::text, 'super_admin'::text])));

drop policy if exists exchange_rounds_anon_deny on public.exchange_rounds;
create policy exchange_rounds_anon_deny on public.exchange_rounds
  as permissive for all to anon using (false);

drop policy if exists exchange_round_seats_admin_all on public.exchange_round_seats;
create policy exchange_round_seats_admin_all on public.exchange_round_seats
  as permissive for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin'::text, 'super_admin'::text])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid()
                        and profiles.role = any (array['admin'::text, 'super_admin'::text])));

drop policy if exists exchange_round_seats_anon_deny on public.exchange_round_seats;
create policy exchange_round_seats_anon_deny on public.exchange_round_seats
  as permissive for all to anon using (false);


-- ============================================================
-- Grants. Supabase house default on all four tables, matching prod exactly:
-- anon, authenticated, and service_role hold full table privileges and RLS
-- above is what actually decides. Recorded for fidelity; nothing to change.
--
--   postgres=arwdDxtm/postgres | anon=arwdDxtm/postgres
--   authenticated=arwdDxtm/postgres | service_role=arwdDxtm/postgres
-- ============================================================

grant all on public.exchange_mixer_config    to anon, authenticated, service_role;
grant all on public.exchange_mixer_overrides to anon, authenticated, service_role;
grant all on public.exchange_rounds          to anon, authenticated, service_role;
grant all on public.exchange_round_seats     to anon, authenticated, service_role;


-- ============================================================
-- Receipt. Expect: 4 utm columns, 4 tables, 4 rls_enabled, 8 policies,
-- 2 extra indexes (idx_exchange_rounds_event, idx_exchange_round_seats_round).
-- ============================================================

-- select count(*) as utm_columns from information_schema.columns
--  where table_schema='public' and table_name='exchange_intake' and column_name like 'utm%';
--
-- select c.relname, c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public'
--    and c.relname in ('exchange_mixer_config','exchange_mixer_overrides',
--                      'exchange_rounds','exchange_round_seats')
--  order by c.relname;
