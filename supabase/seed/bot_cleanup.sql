-- =====================================================================
-- BOT CLEANUP: delete spam signups matching the gibberish fingerprint.
-- Only touches rows with NO payments/tickets/people/attachments.
-- =====================================================================
begin;

-- RECEIPT (BEFORE)
select count(*) as bot_candidates from profiles
where full_name ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
  and subscription_status='inactive' and stripe_customer_id is null;

-- SAFETY: abort if any candidate has attachments
do $g$
declare v int;
begin
  select count(*) into v from profiles pr
  where pr.full_name ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
    and pr.subscription_status='inactive' and pr.stripe_customer_id is null
    and ( exists (select 1 from payments pay where pay.user_id=pr.id)
       or exists (select 1 from tickets t where t.user_id=pr.id)
       or exists (select 1 from people p where p.metadata->>'profile_id'=pr.id::text)
       or exists (select 1 from people p where p.email_lower=lower(pr.email)) );
  if v > 0 then raise exception 'SAFETY ABORT: % candidates have attachments', v; end if;
end $g$;

-- AUDIT: exactly what will be deleted
select id, email, full_name, created_at from profiles
where full_name ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
  and subscription_status='inactive' and stripe_customer_id is null
order by created_at;

-- DELETE (profiles, auth.identities, auth.users)
with bots as (
  select id from profiles
  where full_name ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
    and subscription_status='inactive' and stripe_customer_id is null
)
delete from profiles where id in (select id from bots);

delete from auth.identities where user_id in (
  select id from auth.users u
  where (u.raw_user_meta_data->>'full_name') ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
    and not exists (select 1 from profiles pr where pr.id=u.id));

delete from auth.users u
where (u.raw_user_meta_data->>'full_name') ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
  and not exists (select 1 from profiles pr where pr.id=u.id);

-- RECEIPT (AFTER): must be 0
select count(*) as bot_candidates_after from profiles
where full_name ~ '^[A-Za-z]{14,} [A-Za-z]{14,}$'
  and subscription_status='inactive' and stripe_customer_id is null;

commit;
