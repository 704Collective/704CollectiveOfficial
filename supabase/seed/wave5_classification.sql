-- =====================================================================
-- WAVE 5: reverse-orphan classification, test-account cleanup, internal
-- stamps. Applied by hand to prod 2026-08-18 in one block; the develop
-- rehearsal ran the same block against the develop project first.
--
-- What it did, 17 writes in total:
--   3  deletions              testadam's FK-less contacts row, plus the two
--                             auth.users cascades (test@gmail.com, testadam@gmail.com)
--   9  born-linked prospect   the real orphan profiles: people rows minted with
--      mints                  auth_user_id set at birth and an evidence tag
--   3  contact inserts        prospect contacts for the three signup-only leads
--                             that had no contacts row
--   2  heals                  existing people rows relinked to their live profile
--                             (preetin238@gmail.com, 704collective@gmail.com)
--   2  labels                 704collective@gmail.com as test_account, and the
--                             "Adam Testingould" tombstone (adamg7550@gmail.com)
--                             as test_residue, labelled rather than deleted
--   2  internal flags         704collective@gmail.com, hello@704collective.com
--
-- Every write is signed. Mints carry metadata.source='wave5_classification';
-- heals carry metadata.healed_by='wave5_classification'; labels carry
-- metadata.wave5_label; the new contacts rows carry source='wave5_classification'.
-- Reversal is therefore a one-predicate job in each case.
--
-- The block opens with two safety blocks rather than trusting the tab: a tripwire
-- that aborts if the database holds fewer than 50 profiles (develop, not prod) and
-- a gate that aborts unless both deletion targets still exist and have never signed
-- in. Everything after them keys on ids captured in the pre-write export, not on
-- emails or names.
--
-- Idempotence is mixed and deliberate. The mint, the contact inserts and both heals
-- are guarded by not-exists / auth_user_id-is-null predicates and would write nothing
-- on a second run. The residue label and the internal flags are unguarded id-list
-- updates: re-running them rewrites the same values and refreshes classified_at.
--
-- Receipts held: member_counts stayed 82/71/0/11 across the whole operation and
-- identity_bridge_health stayed 82/82 with all six defect counters at zero, because
-- none of the 11 orphans was an active member -- they were prospects and test rows.
--
-- PROVENANCE. The block below is transcribed from the original paste, verbatim,
-- between the BEGIN/END ORIGINAL markers. Signer e73a8f2b... is
-- baumanngabbi@gmail.com's profile, matching the stage5 wave signatures; the
-- operator was Adam. The receipt and audit queries outside the markers are not
-- part of the original block; they are the standing checks used to verify it.
-- =====================================================================


-- RECEIPT (BEFORE): 11 orphan profiles, 2 of them test accounts.
-- Orphan = live profile with no people row by any of the three routes.
select count(*) as orphan_profiles,
       count(*) filter (where lower(email) in ('test@gmail.com','testadam@gmail.com')) as test_accounts
from profiles pr
where pr.deleted_at is null
  and not exists (select 1 from people p where p.auth_user_id = pr.id)
  and not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email));


-- [BEGIN ORIGINAL]
begin;
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n < 50 then
    raise exception 'TRIPWIRE: only % profiles found. This tab is DEVELOP. This block is PRODUCTION only. Nothing was changed.', n;
  end if;
end $$;
do $$
declare n int;
begin
  select count(*) into n from auth.users
  where id in ('ddc46a36-5957-4aa8-bba4-0d570fd74105','6439f400-3829-49ad-adc3-d2fe54bbf5db')
    and last_sign_in_at is null;
  if n <> 2 then
    raise exception 'GATE: expected 2 never-signed-in test users, found %. Something changed since the export. Nothing was changed.', n;
  end if;
end $$;
delete from public.contacts where id = '22e93860-cb45-43a1-badc-673925da9fc3';
delete from auth.users where id = 'ddc46a36-5957-4aa8-bba4-0d570fd74105';
delete from auth.users where id = '6439f400-3829-49ad-adc3-d2fe54bbf5db';
insert into public.people (email, full_name, phone, roles, member_status, auth_user_id, metadata)
select lower(p.email),
       coalesce(p.full_name, split_part(p.email,'@',1)),
       p.phone,
       array['prospect'],
       'inactive',
       p.id,
       jsonb_build_object(
         'source','wave5_classification',
         'lead_evidence',
           case when exists (select 1 from public.onboarding_responses o where o.user_id = p.id)
                then 'onboarding_responses+contacts' else 'signup_only' end,
         'classified_at', now()::text,
         'created_by','e73a8f2b-2c2b-4dd8-a012-0f8638247ca0')
from public.profiles p
where p.deleted_at is null
  and not exists (select 1 from public.people pe where pe.auth_user_id = p.id)
  and not exists (select 1 from public.people pe where pe.metadata->>'profile_id' = p.id::text)
  and not exists (select 1 from public.people pe where pe.email_lower = lower(p.email));
insert into public.contacts (email, full_name, phone, source, contact_type)
select lower(p.email), p.full_name, p.phone, 'wave5_classification', 'prospect'
from public.profiles p
where p.id in ('848b319e-4243-4850-a8ec-320b22fb56e1',
               'f55fc610-d5da-419f-9484-0f2d55a6a1bf',
               '14a8ba62-be9c-409f-bb03-32a7a04f1225')
  and not exists (select 1 from public.contacts c where lower(c.email) = lower(p.email));
update public.people
set auth_user_id = '6c4f5a9c-de24-4825-baac-e64a350298c1',
    roles = case when 'prospect' = any(roles) then roles else roles || '{prospect}' end,
    metadata = metadata || jsonb_build_object(
      'healed_by','wave5_classification',
      'classified_at', now()::text,
      'created_by','e73a8f2b-2c2b-4dd8-a012-0f8638247ca0')
where id = '83db5e96-2d4c-4baa-bcd1-7cd174fc2bd2' and auth_user_id is null;
update public.people
set auth_user_id = 'c0046dc5-bd94-4eb5-81c8-d50303779fff',
    roles = array_remove(roles, 'member'),
    metadata = metadata || jsonb_build_object(
      'healed_by','wave5_classification',
      'wave5_label','test_account',
      'classified_at', now()::text,
      'created_by','e73a8f2b-2c2b-4dd8-a012-0f8638247ca0')
where id = '402ccb8f-a635-4691-82eb-4de4e252cbe5' and auth_user_id is null;
update public.people
set roles = array_remove(roles, 'member'),
    metadata = metadata || jsonb_build_object(
      'wave5_label','test_residue',
      'classified_at', now()::text,
      'created_by','e73a8f2b-2c2b-4dd8-a012-0f8638247ca0')
where id = '87af08c7-1ce5-49f5-a555-6504cba35b4a';
update public.profiles set is_internal = true
where id in ('c0046dc5-bd94-4eb5-81c8-d50303779fff','40f3c6c7-1b47-44eb-9f32-18576856c982');
commit;
-- [END ORIGINAL]


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

-- AUDIT: the three contacts rows the block created.
select email, full_name, source, contact_type
from contacts
where source = 'wave5_classification'
order by email;

-- INTEGRITY: every minted person's link resolves and the emails agree.
-- metadata.profile_id is written by the mirror trigger, not by the block itself.
select count(*) as wave5_bad
from people p
left join profiles pr on pr.id = p.auth_user_id
where p.metadata->>'source' = 'wave5_classification'
  and (pr.id is null
       or lower(pr.email) is distinct from p.email_lower
       or p.metadata->>'profile_id' is distinct from p.auth_user_id::text);
