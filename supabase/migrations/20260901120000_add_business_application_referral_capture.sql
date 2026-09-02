-- Phase 1 locked business application flow: referral capture on the application.
--
-- The apply form gains one mandatory question, "Did someone refer you? If so,
-- please type their full first and last name. If not, type N/A". That answer is
-- recorded verbatim in referrer_name and never rewritten afterwards.
--
-- Two separate referrer columns on purpose:
--   matched_referrer_profile_id   the server's case-insensitive auto-match
--                                 candidate, advisory only
--   confirmed_referrer_profile_id what the reviewer confirmed in the admin
--                                 dialog. This is the one approve pays on.
-- Keeping them apart means a wrong auto-match can never quietly become a payout,
-- and the reviewer's choice is always distinguishable from the machine's guess.

alter table public.business_applications
  add column if not exists referrer_name text,
  add column if not exists matched_referrer_profile_id uuid,
  add column if not exists confirmed_referrer_profile_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_applications'::regclass
      and conname = 'business_applications_matched_referrer_fkey'
  ) then
    alter table public.business_applications
      add constraint business_applications_matched_referrer_fkey
      foreign key (matched_referrer_profile_id)
      references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_applications'::regclass
      and conname = 'business_applications_confirmed_referrer_fkey'
  ) then
    alter table public.business_applications
      add constraint business_applications_confirmed_referrer_fkey
      foreign key (confirmed_referrer_profile_id)
      references public.profiles(id) on delete set null;
  end if;
end $$;

-- One-source rule, database backstop.
-- An ambassador code and a typed referrer name are mutually exclusive: if a code
-- was captured, the name answer must be the N/A form. The route enforces this
-- first with a readable message; this constraint exists so the rule survives any
-- caller that goes around the route.
-- Drop-then-add so a later alignment of the N/A list is applied, not skipped.
alter table public.business_applications
  drop constraint if exists business_applications_referral_one_source;
alter table public.business_applications
  add constraint business_applications_referral_one_source
  check (
    referral_code is null
    or referrer_name is null
    or lower(btrim(referrer_name)) in ('', 'n/a', 'na', 'n.a.', 'n.a', 'n a', 'none', 'no', 'nobody', 'no one')
  );

create index if not exists business_applications_confirmed_referrer_idx
  on public.business_applications (confirmed_referrer_profile_id)
  where confirmed_referrer_profile_id is not null;

comment on column public.business_applications.referrer_name is
  'Verbatim answer to the mandatory referral question. "N/A" means no member referrer.';
comment on column public.business_applications.matched_referrer_profile_id is
  'Server auto-match candidate: unique case-insensitive full_name hit among active business members. Advisory only.';
comment on column public.business_applications.confirmed_referrer_profile_id is
  'Reviewer-confirmed referrer. Definitive; approve writes the referrals ledger row from this column alone.';
