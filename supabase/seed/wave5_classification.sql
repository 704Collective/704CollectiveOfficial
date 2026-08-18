-- =====================================================================
-- WAVE 5: reverse-orphan classification, test-account cleanup, internal
-- stamps. Applied by hand to prod 2026-08-18 in one block; the develop
-- rehearsal ran the same block against the develop project first.
--
-- What it did, 16 writes in total:
--   2  test-account deletions   test@gmail.com, testadam@gmail.com, cascaded
--                               from auth.users, plus testadam's FK-less contacts row
--   9  born-linked prospect     the real orphan profiles: people rows minted with
--      mints                    auth_user_id set at birth and an evidence tag
--   2  heals                    existing people rows relinked to their live profile
--                               (704collective@gmail.com, preetin238@gmail.com)
--   1  residue label            the "Adam Testingould" tombstone, labelled rather
--                               than deleted (adamg7550@gmail.com)
--   2  internal flags           hello@704collective.com, 704collective@gmail.com
--
-- Every write is signed. Mints carry metadata.source='wave5_classification';
-- heals carry metadata.healed_by='wave5_classification'; labels carry
-- metadata.wave5_label. Reversal is therefore a one-predicate job in each case.
--
-- Idempotent throughout: the mint skips any profile that already has a people row
-- by column, sticky note, or email; the heals only touch rows whose profile_id is
-- still null; the label and the flags only touch rows that are not already stamped.
-- Re-running this file writes nothing.
--
-- Receipts held: member_counts stayed 82/71/0/11 across the whole operation and
-- identity_bridge_health stayed 82/82 with all six defect counters at zero, because
-- none of the 11 orphans was an active member -- they were prospects and test rows.
--
-- PROVENANCE. This file is reconstructed from the signed rows in prod, not
-- transcribed from the original paste, which is not in any chat transcript or in
-- any file on disk. It reproduces the observed end state exactly and was checked
-- statement by statement against it (9 mints, 2 heals, 2 labels, 2 flags, 0 test
-- rows left in profiles/auth.users/contacts/people). Two details are inferred
-- rather than witnessed: the exact wording of the delete statements, since the
-- rows are gone, and whether the heals wrote metadata.created_by or merely
-- inherited it. Neither changes the end state. If the original paste turns up,
-- overwrite this file with it.
-- =====================================================================
begin;

-- RECEIPT (BEFORE): 11 orphan profiles, 2 of them test accounts.
-- Orphan = live profile with no people row by any of the three routes.
select count(*) as orphan_profiles,
       count(*) filter (where lower(email) in ('test@gmail.com','testadam@gmail.com')) as test_accounts
from profiles pr
where pr.deleted_at is null
  and not exists (select 1 from people p where p.auth_user_id = pr.id)
  and not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email));


-- ---------------------------------------------------------------------
-- 1. DELETIONS. Two accounts Adam made while testing signup in July.
-- profiles, onboarding_responses and the rest cascade from auth.users;
-- contacts has no FK to either, so testadam's contacts row is removed by hand.
-- ---------------------------------------------------------------------

delete from contacts
where lower(email) in ('test@gmail.com','testadam@gmail.com');

delete from auth.users
where lower(email) in ('test@gmail.com','testadam@gmail.com');


-- ---------------------------------------------------------------------
-- 2. MINTS. The nine real people behind the remaining orphans: everyone who
-- signed up and never paid. They become prospects, not members -- member_tier
-- stays null and member_status is 'inactive', so no count anywhere moves.
--
-- Born-linked: auth_user_id is set in the insert itself, which is what the
-- resolver has been minting since Wave 2. The mirror trigger fills
-- metadata.profile_id from it, and it is written here too so the row is
-- self-describing even if the trigger is ever dropped.
--
-- email_lower is a generated column and is deliberately not in the column list.
--
-- lead_evidence records why we believe the person is real, so a future campaign
-- can segment on effort: six answered onboarding questions, three only ever
-- completed a signup. All nine also have a contacts row, which is why the tag
-- keys off onboarding only.
--
-- created_by is the super_admin profile the waves have signed with since stage 5
-- (e73a8f2b... = baumanngabbi@gmail.com), matching the older stage5 rows.
-- ---------------------------------------------------------------------

insert into people (auth_user_id, email, full_name, phone,
  member_tier, member_status, roles, metadata)
select pr.id,
       lower(pr.email),
       pr.full_name,
       pr.phone,
       null,
       'inactive',
       array['prospect'],
       jsonb_build_object(
         'source',        'wave5_classification',
         'created_by',    'e73a8f2b-2c2b-4dd8-a012-0f8638247ca0',
         'profile_id',    pr.id::text,
         'classified_at', now()::text,
         'lead_evidence',
           case when exists (select 1 from onboarding_responses o where o.user_id = pr.id)
                then 'onboarding_responses+contacts'
                else 'signup_only'
           end)
from profiles pr
where pr.deleted_at is null
  and not exists (select 1 from people p where p.auth_user_id = pr.id)
  and not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email));


-- ---------------------------------------------------------------------
-- 3. HEALS. Two people rows that already existed and matched a live profile by
-- email but carried no link: 704collective@gmail.com (unlinked by stage5_wave2
-- when its old profile was hard-deleted, and since re-signed-up) and
-- preetin238@gmail.com (born from a guest pass, before the profile existed).
--
-- Merge, never overwrite: the stage5_wave2 forensics (prior_profile_id,
-- unlinked_by, unlinked_reason, unlinked_at) and the guest-pass provenance stay
-- on the row. The mirror trigger sets auth_user_id from the new profile_id.
-- ---------------------------------------------------------------------

update people p
set metadata = p.metadata || jsonb_build_object(
      'profile_id',    pr.id::text,
      'healed_by',     'wave5_classification',
      'classified_at', now()::text)
from profiles pr
where pr.deleted_at is null
  and lower(pr.email) = p.email_lower
  and p.metadata->>'profile_id' is null
  and p.auth_user_id is null;


-- ---------------------------------------------------------------------
-- 4. LABELS. 704collective@gmail.com is a real, live account that Adam uses for
-- testing, so it is healed above AND labelled here; adamg7550@gmail.com
-- ("Adam Testingould") is the tombstone of a hard-deleted test profile with no
-- auth user to relink to, so it is labelled and left alone. Labelling rather
-- than deleting keeps the attendance history these rows are attached to.
-- ---------------------------------------------------------------------

update people
set metadata = metadata || jsonb_build_object(
      'wave5_label',   'test_account',
      'classified_at', now()::text)
where email_lower = '704collective@gmail.com'
  and metadata->>'wave5_label' is null;

update people
set metadata = metadata || jsonb_build_object(
      'wave5_label',   'test_residue',
      'classified_at', now()::text)
where email_lower = 'adamg7550@gmail.com'
  and metadata->>'wave5_label' is null;


-- ---------------------------------------------------------------------
-- 5. INTERNAL FLAGS. The four *test@704collective.com accounts were already
-- flagged; these two were not. hello@704collective.com is the live ops account
-- and 704collective@gmail.com is Adam's test signup -- both are staff, neither
-- is a member. This is what makes them vanish from the member directory,
-- @-mention suggestions and messaging search once the Wave 5 code pass ships.
-- ---------------------------------------------------------------------

update profiles
set is_internal = true
where lower(email) in ('hello@704collective.com','704collective@gmail.com')
  and is_internal = false;


-- RECEIPT (AFTER): no orphans left.
select count(*) as orphan_profiles_after
from profiles pr
where pr.deleted_at is null
  and not exists (select 1 from people p where p.auth_user_id = pr.id)
  and not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email));

-- RECEIPT (AFTER): counts must not have moved.
select * from member_counts;

-- RECEIPT (AFTER): the bridge must still be clean.
select * from identity_bridge_health;

-- AUDIT: the nine mints and their evidence.
select email, full_name, member_status, roles,
       metadata->>'lead_evidence' as evidence,
       auth_user_id is not null as born_linked
from people
where metadata->>'source' = 'wave5_classification'
order by email;

-- AUDIT: heals, labels and flags.
select email, metadata->>'healed_by' as healed_by, metadata->>'wave5_label' as label
from people
where metadata->>'healed_by' = 'wave5_classification'
   or metadata->>'wave5_label' is not null
order by email;

select email, is_internal from profiles where is_internal order by email;

-- INTEGRITY: every minted person's link resolves and the emails agree.
select count(*) as wave5_bad
from people p
left join profiles pr on pr.id = p.auth_user_id
where p.metadata->>'source' = 'wave5_classification'
  and (pr.id is null
       or lower(pr.email) is distinct from p.email_lower
       or p.metadata->>'profile_id' is distinct from p.auth_user_id::text);

commit;
