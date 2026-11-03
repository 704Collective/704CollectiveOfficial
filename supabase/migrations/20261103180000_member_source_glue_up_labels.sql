-- Split the leftover member-source bucket:
--   glue_up          = first paid before 2026-04-01 America/New_York
--   before_tracking  = first paid on/after that date and before tracking_started_at
--   no_payment_yet   = never paid (was 'unknown')
--   unknown          = paid on/after tracking start with nothing recorded
-- CREATE OR REPLACE keeps existing grants; re-grant anyway so a later
-- DROP + recreate cannot leave the view unreadable.

create or replace view public.member_source_winners as
with pays as (
  select user_id,
         min(created_at) as first_paid,
         count(*)::integer as pay_count
  from public.payments
  where status = 'succeeded'
    and amount > 0
    and payment_type = 'subscription'
  group by user_id
),
base as (
  select
    p.id as profile_id,
    lower(p.email) as email_lower,
    p.member_type,
    p.role,
    p.membership_override,
    ms.heard_about,
    ms.heard_about_other,
    nullif(upper(btrim(ms.promo_code)), '') as promo_code,
    ms.first_touch,
    ms.latest_touch,
    pays.first_paid,
    coalesce(pays.pay_count, 0) as pay_count,
    amb.referral_code as ambassador_code,
    exists (select 1 from public.ambassadors a where a.profile_id = p.id) as is_ambassador_account,
    (select s.tracking_started_at from public.member_source_settings s where s.id = 1) as tracking_started_at
  from public.profiles p
  left join public.member_sources ms on ms.profile_id = p.id
  left join public.ambassadors amb on amb.id = p.referred_by_ambassador_id
  left join pays on pays.user_id = p.id
  where p.deleted_at is null
),
labeled as (
  select
    b.*,
    public.member_source_link_label(
      case
        when public.member_source_link_label(b.latest_touch) is not null then b.latest_touch
        else b.first_touch
      end
    ) as link_label,
    case
      when public.member_source_link_label(b.latest_touch) is not null then b.latest_touch
      else b.first_touch
    end as chosen_touch
  from base b
)
select
  profile_id,
  email_lower,
  first_paid,
  pay_count,
  chosen_touch->>'utm_source' as link_source,
  chosen_touch->>'utm_medium' as link_medium,
  chosen_touch->>'utm_campaign' as link_campaign,
  chosen_touch->>'utm_content' as link_content,
  case
    when ambassador_code is not null then 'ambassador'
    when promo_code is not null then 'promo'
    when link_label is not null then 'link'
    when heard_about is not null then 'said'
    when membership_override is true then 'comp'
    when member_type = 'listing' then 'listing'
    when is_ambassador_account then 'ambassador_account'
    when role in ('admin', 'super_admin') and pay_count = 0 then 'admin_invite'
    when first_paid is not null
      and first_paid < (timestamp '2026-04-01' at time zone 'America/New_York')
      then 'glue_up'
    when first_paid is not null
      and tracking_started_at is not null
      and first_paid < tracking_started_at
      then 'before_tracking'
    when first_paid is null then 'no_payment_yet'
    else 'unknown'
  end as winning_type,
  case
    when ambassador_code is not null then 'Ambassador: ' || ambassador_code
    when promo_code is not null then 'Promo: ' || promo_code
    when link_label is not null then link_label
    when heard_about is not null then 'Said: ' || coalesce(public.member_source_heard_label(heard_about, heard_about_other), heard_about)
    when membership_override is true then 'Comp'
    when member_type = 'listing' then 'Listing'
    when is_ambassador_account then 'Ambassador account'
    when role in ('admin', 'super_admin') and pay_count = 0 then 'Admin invite'
    when first_paid is not null
      and first_paid < (timestamp '2026-04-01' at time zone 'America/New_York')
      then 'Glue Up'
    when first_paid is not null
      and tracking_started_at is not null
      and first_paid < tracking_started_at
      then 'Before tracking'
    when first_paid is null then 'No payment yet'
    else 'Unknown'
  end as winning_detail
from labeled;

revoke all on table public.member_source_winners from public, anon, authenticated;
grant select on table public.member_source_winners to service_role;
