-- Capture-only migration. These objects were created directly on prod (Aug 12: Exchange
-- intake) and out-of-band (identity_bridge_health view). Both prod and develop already have
-- all of them. This file exists so the repo is a truthful record. Idempotent by construction.


-- ============================================================
-- exchange_intake table
-- ============================================================

create table if not exists public.exchange_intake (
    id uuid not null default gen_random_uuid(),
    event_id uuid not null,
    first_name text not null,
    last_name text not null,
    email text not null,
    phone text not null,
    profile_id uuid,
    person_id uuid,
    contact_id uuid,
    credential_id uuid,
    form_variant text not null,
    pool text not null,
    participation text not null,
    member_status_at_submit text,
    status text not null default 'submitted'::text,
    invite_token text,
    q_role_title text,
    q_company text,
    q_years_charlotte text,
    q_seeking text,
    ip_address text,
    user_agent text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint exchange_intake_pkey PRIMARY KEY (id),
    constraint exchange_intake_invite_token_key UNIQUE (invite_token),
    constraint exchange_intake_answers_required CHECK (((status <> 'submitted'::text) OR (participation <> 'business_and_social'::text) OR (member_status_at_submit = 'business_member'::text) OR ((q_role_title IS NOT NULL) AND (length(btrim(q_role_title)) > 0) AND (q_company IS NOT NULL) AND (length(btrim(q_company)) > 0) AND (q_years_charlotte IS NOT NULL) AND (length(btrim(q_years_charlotte)) > 0) AND (q_seeking IS NOT NULL) AND (length(btrim(q_seeking)) > 0)))),
    constraint exchange_intake_form_variant_check CHECK ((form_variant = ANY (ARRAY['commonwealth'::text, 'public'::text, 'invited'::text]))),
    constraint exchange_intake_member_status_at_submit_check CHECK ((member_status_at_submit = ANY (ARRAY['business_member'::text, 'social_member'::text, 'non_member'::text]))),
    constraint exchange_intake_participation_check CHECK ((participation = ANY (ARRAY['business_and_social'::text, 'social_only'::text]))),
    constraint exchange_intake_pool_check CHECK ((pool = ANY (ARRAY['house'::text, 'commonwealth'::text]))),
    constraint exchange_intake_social_only_scope CHECK (((participation <> 'social_only'::text) OR (form_variant = 'commonwealth'::text))),
    constraint exchange_intake_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'submitted'::text, 'canceled'::text]))),
    constraint exchange_intake_status_shape CHECK ((((status <> 'invited'::text) OR (invite_token IS NOT NULL)) AND ((status <> 'submitted'::text) OR (submitted_at IS NOT NULL)))),
    constraint exchange_intake_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    constraint exchange_intake_credential_id_fkey FOREIGN KEY (credential_id) REFERENCES attendance_credentials(id) ON DELETE SET NULL,
    constraint exchange_intake_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    constraint exchange_intake_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL,
    constraint exchange_intake_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);


-- ============================================================
-- events.intake_form_slug column
-- ============================================================

alter table public.events add column if not exists intake_form_slug text;


-- ============================================================
-- exchange_intake row level security
-- ============================================================

alter table public.exchange_intake enable row level security;

drop policy if exists exchange_intake_admin_all on public.exchange_intake;
create policy exchange_intake_admin_all on public.exchange_intake
    as permissive for all to public
    using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (profiles.deleted_at IS NULL)))))
    with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (profiles.deleted_at IS NULL)))));

drop policy if exists exchange_intake_anon_deny on public.exchange_intake;
create policy exchange_intake_anon_deny on public.exchange_intake
    as permissive for all to anon
    using (false);


-- ============================================================
-- exchange_intake indexes
-- exchange_intake_pkey and exchange_intake_invite_token_key are created by the
-- PRIMARY KEY and UNIQUE constraints in the table definition above.
-- ============================================================

create unique index if not exists exchange_intake_event_email_key on public.exchange_intake using btree (event_id, lower(email));
create index if not exists idx_exchange_intake_created on public.exchange_intake using btree (created_at desc);
create index if not exists idx_exchange_intake_email on public.exchange_intake using btree (lower(email));
create index if not exists idx_exchange_intake_event on public.exchange_intake using btree (event_id);
create index if not exists idx_exchange_intake_pool on public.exchange_intake using btree (event_id, pool, status);
create index if not exists idx_exchange_intake_token on public.exchange_intake using btree (invite_token);


-- ============================================================
-- exchange_intake trigger
-- ============================================================

drop trigger if exists trg_exchange_intake_updated_at on public.exchange_intake;
CREATE TRIGGER trg_exchange_intake_updated_at BEFORE UPDATE ON public.exchange_intake FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- identity_bridge_health view
-- ============================================================

create or replace view public.identity_bridge_health as
 WITH member_profiles AS (
         SELECT p.id,
            p.email,
            p.full_name,
            p.subscription_status,
            p.membership_override
           FROM profiles p
          WHERE p.deleted_at IS NULL AND ((p.subscription_status = ANY (ARRAY['active'::text, 'trialing'::text])) OR p.membership_override = true) AND p.email !~~ '%@704collective.com'::text
        )
 SELECT ( SELECT count(*) AS count
           FROM member_profiles) AS member_profiles_total,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text))) AS bridged_ok,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text))) AS members_missing_people_row,
    ( SELECT count(*) AS count
           FROM people pe
          WHERE (pe.metadata ->> 'profile_id'::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM profiles p
                  WHERE p.id::text = (pe.metadata ->> 'profile_id'::text)))) AS people_pointing_at_dead_profile,
    ( SELECT count(*) AS count
           FROM member_profiles mp
          WHERE NOT (EXISTS ( SELECT 1
                   FROM people pe
                  WHERE (pe.metadata ->> 'profile_id'::text) = mp.id::text)) AND (EXISTS ( SELECT 1
                   FROM people pe2
                  WHERE pe2.email_lower = lower(mp.email)))) AS members_with_unbridged_people_row_by_email;
