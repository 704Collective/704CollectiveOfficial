-- =====================================================================
-- STAGE 5 WAVE 2: clear dangling profile_id links (target profile hard-
-- deleted, no live profile shares the email). Old id preserved as
-- prior_profile_id; stamped unlinked_by='stage5_wave2'. Reversible.
-- =====================================================================
begin;

-- RECEIPT (BEFORE): dangling links
select count(*) as broken_links
from people p
left join profiles pr on pr.id::text = p.metadata->>'profile_id'
where p.metadata->>'profile_id' is not null and pr.id is null;

-- THE WAVE
update people p
set metadata = (p.metadata - 'profile_id')
    || jsonb_build_object('prior_profile_id', p.metadata->>'profile_id',
                          'unlinked_by', 'stage5_wave2',
                          'unlinked_reason', 'profile_hard_deleted',
                          'unlinked_at', now()::text),
    updated_at = now()
where p.metadata->>'profile_id' is not null
  and not exists (select 1 from profiles pr where pr.id::text = p.metadata->>'profile_id')
  and not exists (select 1 from profiles pr2 where lower(pr2.email) = p.email_lower);

-- RECEIPT (AFTER): dangling links must be 0
select count(*) as broken_links
from people p
left join profiles pr on pr.id::text = p.metadata->>'profile_id'
where p.metadata->>'profile_id' is not null and pr.id is null;

-- AUDIT
select id, email, metadata->>'prior_profile_id' as prior_link
from people where metadata->>'unlinked_by'='stage5_wave2' order by email;

commit;
