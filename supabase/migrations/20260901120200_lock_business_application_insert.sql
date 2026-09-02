-- Phase 1 locked business application flow: make the validated route the only door.
--
-- Before this migration the `Anyone can apply` policy had WITH CHECK (true) for
-- anon and authenticated, so the browser inserted its own application row. Every
-- rule the new route enforces -- the one-source rule, the self-referral blocks,
-- the auto-match -- would have been decoration, because any caller could post a
-- row straight past it.
--
-- After: no INSERT policy exists for anon or authenticated, so RLS denies by
-- default. /api/business-application does the insert with the service role,
-- which bypasses RLS, and is now the only way an application can be created.
--
-- SELECT and UPDATE are left exactly as they were. The card-save route at
-- /api/business-application-payment writes stripe_customer_id,
-- stripe_setup_intent_id and card_saved through the applicant's own session and
-- depends on `Users can update own applications`; removing it would break the
-- shipped card flow.

drop policy if exists "Anyone can apply" on public.business_applications;

revoke insert on public.business_applications from anon, authenticated;

-- Belt and braces on the columns that carry the referral decision.
--
-- The applicant's typed answer, the captured code and the server's auto-match
-- are server-owned facts. An applicant holding a valid session could otherwise
-- UPDATE their own row after submission and rewrite who referred them, which is
-- money. confirmed_referrer_profile_id is deliberately NOT guarded here: that is
-- the reviewer's control in the admin dialog and is covered by the existing
-- `Admins can update applications` policy.
--
-- SECURITY INVOKER on purpose. Under PostgREST the request runs with SET ROLE,
-- so current_user is the caller's effective role. A SECURITY DEFINER function
-- would report the definer instead and the guard would never fire.
create or replace function public.guard_business_application_referral_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.referrer_name is distinct from old.referrer_name
     or new.referral_code is distinct from old.referral_code
     or new.ambassador_id is distinct from old.ambassador_id
     or new.matched_referrer_profile_id is distinct from old.matched_referrer_profile_id then
    raise exception 'Referral fields on a business application are server-owned and cannot be changed by this caller'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_business_application_referral_columns_trigger
  on public.business_applications;
create trigger guard_business_application_referral_columns_trigger
  before update on public.business_applications
  for each row execute function public.guard_business_application_referral_columns();
