-- Phase 1: the two application-status vocabularies have never agreed.
--
-- business_applications.status  : pending | reviewing | approved | denied | waitlisted
-- profiles.application_status   : pending | accepted  | denied   | waitlist
--
-- The AFTER trigger copied NEW.status onto the profile verbatim, so marking an
-- application approved always violated profiles_application_status_check.
-- Approve then threw after Stripe had already charged. Map the two words that
-- differ; leave the rest as-is.

create or replace function public.sync_profile_application_status()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.profile_id is not null then
    update public.profiles
    set application_status = case new.status
      when 'approved' then 'accepted'
      when 'waitlisted' then 'waitlist'
      when 'reviewing' then 'pending'
      else new.status
    end
    where id = new.profile_id;
  end if;
  return new;
end;
$$;
