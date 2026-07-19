-- =====================================================================
-- STAGE 5 WAVE 3: create people rows for profiles that have none
-- (no bridge by id, no email match). Mirrors the platform's own insert
-- shape (admin-manual-membership-override pattern: no roles for
-- non-actives). Additive + reversible via metadata.created_by.
-- Bot guard: skips gibberish-fingerprint names.
-- =====================================================================
begin;

-- RECEIPT (BEFORE)
select count(*) as reverse_orphans
from profiles pr
where not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email))
  and pr.deleted_at is null;

-- THE WAVE
insert into people (email, full_name, phone, member_tier, member_status,
  roles, joined_at, metadata)
select lower(pr.email), pr.full_name, pr.phone,
  case when pr.member_type in ('social','business') then pr.member_type else null end,
  case when pr.subscription_status='active' then 'active' else 'inactive' end,
  case when pr.subscription_status='active' then array['member'] else '{}'::text[] end,
  case when pr.subscription_status='active' then pr.member_since else null end,
  jsonb_build_object('profile_id', pr.id::text,
                     'source', 'stage5_wave3',
                     'created_by', 'stage5_wave3',
                     'created_at_wave', now()::text)
from profiles pr
where not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email))
  and pr.deleted_at is null
  and pr.full_name !~ '^[A-Za-z]{14,} [A-Za-z]{14,}$';

-- RECEIPT (AFTER): expect 0 (unless bot-guard skipped rows)
select count(*) as reverse_orphans_after
from profiles pr
where not exists (select 1 from people p where p.metadata->>'profile_id' = pr.id::text)
  and not exists (select 1 from people p where p.email_lower = lower(pr.email))
  and pr.deleted_at is null;

-- AUDIT
select email, full_name, member_tier, member_status, metadata->>'profile_id' as linked_profile
from people where metadata->>'created_by'='stage5_wave3' order by email;

-- INTEGRITY: every wave3 person's link resolves + email agrees
select count(*) as wave3_bad
from people p left join profiles pr on pr.id::text = p.metadata->>'profile_id'
where p.metadata->>'created_by'='stage5_wave3'
  and (pr.id is null or lower(pr.email) is distinct from p.email_lower);

commit;
