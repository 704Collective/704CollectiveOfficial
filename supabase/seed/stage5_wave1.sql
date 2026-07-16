-- =====================================================================
-- STAGE 5 WAVE 1: write metadata.profile_id where email matches exactly
-- one profile and no profile_id exists. Additive + reversible.
-- Reverse: strip wave1 links via metadata->>'linked_by' = 'stage5_wave1'
-- =====================================================================
begin;

-- RECEIPT (BEFORE)
select
 count(*) filter (where metadata->>'profile_id' is not null) as linked,
 count(*) filter (where metadata->>'profile_id' is null and exists
   (select 1 from profiles pr where lower(pr.email)=p.email_lower)) as stale_email_match,
 count(*) filter (where metadata->>'profile_id' is null and not exists
   (select 1 from profiles pr where lower(pr.email)=p.email_lower)) as orphan
from people p;

-- THE WAVE: only unambiguous 1:1 email matches
with candidates as (
  select p.id as person_id, pr.id as profile_id
  from people p
  join profiles pr on lower(pr.email) = p.email_lower
  where p.metadata->>'profile_id' is null
    and (select count(*) from profiles pr2 where lower(pr2.email)=p.email_lower) = 1
    and (select count(*) from people p2 where p2.email_lower=lower(pr.email)) = 1
)
update people p
set metadata = coalesce(p.metadata,'{}'::jsonb)
    || jsonb_build_object('profile_id', c.profile_id::text,
                          'linked_by', 'stage5_wave1',
                          'linked_at', now()::text),
    updated_at = now()
from candidates c
where p.id = c.person_id;

-- RECEIPT (AFTER)
select
 count(*) filter (where metadata->>'profile_id' is not null) as linked,
 count(*) filter (where metadata->>'profile_id' is null and exists
   (select 1 from profiles pr where lower(pr.email)=p.email_lower)) as stale_email_match,
 count(*) filter (where metadata->>'profile_id' is null and not exists
   (select 1 from profiles pr where lower(pr.email)=p.email_lower)) as orphan
from people p;

-- AUDIT: exactly which rows this wave touched
select id, email, metadata->>'profile_id' as new_link
from people where metadata->>'linked_by' = 'stage5_wave1' order by email;

-- INTEGRITY: every wave1 link points at a real profile with agreeing email
select count(*) as wave1_bad_links
from people p left join profiles pr on pr.id::text = p.metadata->>'profile_id'
where p.metadata->>'linked_by'='stage5_wave1'
  and (pr.id is null or lower(pr.email) is distinct from p.email_lower);

commit;
