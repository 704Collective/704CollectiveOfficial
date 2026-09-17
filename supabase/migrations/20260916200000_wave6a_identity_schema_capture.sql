-- Identity Wave 6A — schema capture.
--
-- Wave 6A (the additive half of the contacts fold) was applied to production
-- and develop by hand in August 2026 and never recorded in migration history,
-- so the repo could not rebuild either database (cursor_report_identitystatus.md
-- §4 "Repo parity"). This file records exactly what is live, read back from the
-- production catalog on 2026-09-16:
--
--   people.marketing_unsubscribed   boolean not null default false
--   people.unsubscribed_at          timestamptz
--   contacts.person_id              uuid -> people(id) on delete set null, btree index
--   contact_activity.person_id      uuid -> people(id) on delete set null
--   event_public_rsvps.person_id    uuid -> people(id) on delete set null
--   guest_pass_events.person_id     uuid -> people(id) on delete set null
--   person_tags (person_id, tag, created_at), pk (person_id, tag), tag index,
--                RLS enabled, no policies
--
-- Every statement is guarded, so this is a no-op on a database that already
-- carries the objects and a faithful create on one that does not. The only
-- deliberate difference from the hand-applied state is the privilege block at
-- the end: person_tags was born with the pre-Sep-16 default grants (anon and
-- authenticated hold table privileges, masked only by RLS-with-no-policies).
-- The born-private convention revokes those; nothing reads person_tags from
-- the browser, so behaviour is unchanged.

-- ── people: one opt-out flag ────────────────────────────────────────────────

alter table public.people
  add column if not exists marketing_unsubscribed boolean not null default false;

alter table public.people
  add column if not exists unsubscribed_at timestamptz;

-- ── person_id on contacts and the three live child tables ───────────────────

alter table public.contacts          add column if not exists person_id uuid;
alter table public.contact_activity  add column if not exists person_id uuid;
alter table public.event_public_rsvps add column if not exists person_id uuid;
alter table public.guest_pass_events add column if not exists person_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_person_id_fkey') then
    alter table public.contacts
      add constraint contacts_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_activity_person_id_fkey') then
    alter table public.contact_activity
      add constraint contact_activity_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_public_rsvps_person_id_fkey') then
    alter table public.event_public_rsvps
      add constraint event_public_rsvps_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guest_pass_events_person_id_fkey') then
    alter table public.guest_pass_events
      add constraint guest_pass_events_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
end $$;

create index if not exists idx_contacts_person_id on public.contacts using btree (person_id);

-- ── person_tags: the destination for contact_tags in Wave 6B ────────────────

create table if not exists public.person_tags (
  person_id  uuid        not null references public.people(id) on delete cascade,
  tag        text        not null,
  created_at timestamptz not null default now(),
  constraint person_tags_pkey primary key (person_id, tag)
);

create index if not exists idx_person_tags_tag on public.person_tags using btree (tag);

alter table public.person_tags enable row level security;

-- Born-private: service-role only until a wave gives a browser role a reason
-- to read tags, at which point it gets an explicit policy and grant here.
revoke all on table public.person_tags from public, anon, authenticated;
grant  all on table public.person_tags to service_role;

comment on table public.person_tags is
  'Tags on the canonical person (Wave 6A destination for contact_tags; populated by Wave 6B). Service-role only.';
comment on column public.people.marketing_unsubscribed is
  'The one opt-out flag (Wave 6A). Folds contacts.unsubscribed and profiles.marketing_unsubscribed in Wave 6B.';
comment on column public.contacts.person_id is
  'Wave 6A bridge to people. Populated by the Wave 6B backfill; contacts retires as a destination in 6C.';
