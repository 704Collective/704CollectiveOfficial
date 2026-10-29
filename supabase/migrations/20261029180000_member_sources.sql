-- Member source tracking. One row per profile, plus super-admin tracking links.
-- Winner is computed at read time. Checkout and stripe-webhook are not involved.
-- Reads go through security-definer functions that require profiles.role = super_admin.

create table if not exists public.member_source_settings (
  id integer primary key default 1,
  tracking_started_at timestamptz not null,
  constraint member_source_settings_singleton check (id = 1)
);

insert into public.member_source_settings (id, tracking_started_at)
values (1, clock_timestamp())
on conflict (id) do nothing;

alter table public.member_source_settings enable row level security;

revoke all on table public.member_source_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.member_source_settings to service_role;

create table if not exists public.member_sources (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  email_lower text not null,
  heard_about text,
  heard_about_other text,
  promo_code text,
  first_touch jsonb,
  latest_touch jsonb,
  backfilled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_sources_heard_check check (
    heard_about is null or heard_about in (
      'instagram', 'tiktok', 'facebook', 'friend', 'event', 'cltbucketlist', 'google', 'other'
    )
  ),
  constraint member_sources_other_len check (
    heard_about_other is null or char_length(heard_about_other) <= 80
  ),
  constraint member_sources_other_pair check (
    heard_about is distinct from 'other'
    or (heard_about_other is not null and char_length(btrim(heard_about_other)) > 0)
  ),
  constraint member_sources_promo_len check (
    promo_code is null or char_length(promo_code) <= 40
  )
);

alter table public.member_sources enable row level security;

revoke all on table public.member_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.member_sources to service_role;

create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  posted_on text not null,
  campaign_text text not null,
  spot text,
  destination text not null,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text,
  url text not null,
  created_at timestamptz not null default now(),
  constraint tracking_links_posted_on_check check (
    posted_on in ('instagram', 'tiktok', 'facebook', 'cltbucketlist', 'email', 'flyer', 'event', 'other')
  )
);

alter table public.tracking_links enable row level security;

revoke all on table public.tracking_links from public, anon, authenticated;
grant select, insert, update, delete on table public.tracking_links to service_role;

-- Once a profile has any succeeded paid subscription payment, keep the
-- answer, the promo code, and the first touch. A later visit may replace
-- latest_touch only.
create or replace function public.member_sources_lock_paid()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  paid boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1 from public.payments
      where user_id = old.profile_id
        and status = 'succeeded'
        and amount > 0
        and payment_type = 'subscription'
    ) into paid;
    if paid then
      new.heard_about := old.heard_about;
      new.heard_about_other := old.heard_about_other;
      new.promo_code := old.promo_code;
      new.first_touch := old.first_touch;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists member_sources_lock_paid on public.member_sources;
create trigger member_sources_lock_paid
  before update on public.member_sources
  for each row execute function public.member_sources_lock_paid();

create or replace function public.member_source_link_label(touch jsonb)
returns text
language sql
immutable
as $$
  select case
    when touch is null then null
    when coalesce(touch->>'utm_source', '') = ''
     and coalesce(touch->>'utm_medium', '') = ''
     and coalesce(touch->>'utm_campaign', '') = ''
     and coalesce(touch->>'utm_content', '') = ''
     and coalesce(touch->>'utm_term', '') = ''
     and coalesce(touch->>'fbclid', '') = ''
    then null
    else 'Link: ' || coalesce(
      nullif(concat_ws(' / ',
        nullif(touch->>'utm_source', ''),
        nullif(touch->>'utm_campaign', '')
      ), ''),
      'fbclid'
    )
  end;
$$;

create or replace function public.member_source_heard_label(p_heard text, p_other text)
returns text
language sql
immutable
as $$
  select case p_heard
    when 'instagram' then 'Instagram'
    when 'tiktok' then 'TikTok'
    when 'facebook' then 'Facebook'
    when 'friend' then 'Friend or member'
    when 'event' then 'A 704 event'
    when 'cltbucketlist' then 'CLTBucketlist'
    when 'google' then 'Google'
    when 'other' then nullif(btrim(p_other), '')
    else null
  end;
$$;

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
    when first_paid is not null and tracking_started_at is not null and first_paid < tracking_started_at then 'before_tracking'
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
    when first_paid is not null and tracking_started_at is not null and first_paid < tracking_started_at then 'Before tracking'
    else 'Unknown'
  end as winning_detail
from labeled;

revoke all on table public.member_source_winners from public, anon, authenticated;
grant select on table public.member_source_winners to service_role;

create or replace function public.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and deleted_at is null
  ) then
    raise exception 'forbidden: super_admin required';
  end if;
end;
$$;

create or replace function public.list_member_sources()
returns table (
  profile_id uuid,
  email_lower text,
  winning_type text,
  winning_detail text
)
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.assert_super_admin();
  return query
  select w.profile_id, w.email_lower, w.winning_type, w.winning_detail
  from public.member_source_winners w;
end;
$$;

create or replace function public.member_source_breakdown(p_from date, p_to date)
returns table (
  bucket text,
  winning_type text,
  winning_detail text,
  n bigint
)
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  perform public.assert_super_admin();
  return query
  select 'new'::text, w.winning_type, w.winning_detail, count(*)::bigint
  from public.member_source_winners w
  where w.pay_count = 1
    and w.first_paid >= v_from
    and w.first_paid < v_to
  group by w.winning_type, w.winning_detail
  union all
  select 'rejoined'::text, null::text, null::text, count(distinct pay.user_id)::bigint
  from public.payments pay
  join public.member_source_winners w on w.profile_id = pay.user_id
  where pay.status = 'succeeded'
    and pay.amount > 0
    and pay.payment_type = 'subscription'
    and pay.created_at >= v_from
    and pay.created_at < v_to
    and w.first_paid is not null
    and pay.created_at > w.first_paid;
end;
$$;

create or replace function public.tracking_link_parts(p_posted_on text)
returns table (utm_source text, utm_medium text)
language sql
immutable
as $$
  select case p_posted_on
    when 'instagram' then 'instagram'
    when 'tiktok' then 'tiktok'
    when 'facebook' then 'facebook'
    when 'cltbucketlist' then 'cltbucketlist'
    when 'email' then 'email'
    when 'flyer' then 'flyer'
    when 'event' then 'event'
    else 'other'
  end,
  case p_posted_on
    when 'instagram' then 'social'
    when 'tiktok' then 'social'
    when 'facebook' then 'social'
    when 'cltbucketlist' then 'partner'
    when 'email' then 'email'
    when 'flyer' then 'offline'
    when 'event' then 'offline'
    else 'other'
  end;
$$;

create or replace function public.slugify_utm(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    left(trim(both '-' from regexp_replace(lower(btrim(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g')), 80),
    ''
  );
$$;

create or replace function public.save_tracking_link(
  p_posted_on text,
  p_campaign text,
  p_spot text,
  p_destination text
)
returns table (
  id uuid,
  url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text
)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_source text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_dest text;
  v_url text;
  v_id uuid;
begin
  perform public.assert_super_admin();
  if p_posted_on not in ('instagram', 'tiktok', 'facebook', 'cltbucketlist', 'email', 'flyer', 'event', 'other') then
    raise exception 'invalid posted_on';
  end if;
  v_campaign := public.slugify_utm(p_campaign);
  if v_campaign is null then
    raise exception 'campaign is required';
  end if;
  v_content := public.slugify_utm(p_spot);
  v_dest := btrim(coalesce(p_destination, ''));
  if v_dest !~ '^https://(www\.)?704collective\.com(/|$)([^[:space:]]*)$' then
    raise exception 'destination must be an https URL on 704collective.com';
  end if;
  select parts.utm_source, parts.utm_medium into v_source, v_medium
  from public.tracking_link_parts(p_posted_on) parts;
  v_url := v_dest
    || case when position('?' in v_dest) > 0 then '&' else '?' end
    || 'utm_source=' || v_source
    || '&utm_medium=' || v_medium
    || '&utm_campaign=' || v_campaign
    || case when v_content is not null then '&utm_content=' || v_content else '' end;
  insert into public.tracking_links (
    created_by, posted_on, campaign_text, spot, destination,
    utm_source, utm_medium, utm_campaign, utm_content, url
  ) values (
    auth.uid(), p_posted_on, btrim(p_campaign), nullif(btrim(coalesce(p_spot, '')), ''), v_dest,
    v_source, v_medium, v_campaign, v_content, v_url
  )
  returning tracking_links.id into v_id;
  return query
  select v_id, v_url, v_source, v_medium, v_campaign, v_content;
end;
$$;

create or replace function public.list_tracking_links()
returns table (
  id uuid,
  posted_on text,
  campaign_text text,
  spot text,
  url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz,
  new_members bigint
)
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.assert_super_admin();
  return query
  select
    l.id,
    l.posted_on,
    l.campaign_text,
    l.spot,
    l.url,
    l.utm_source,
    l.utm_medium,
    l.utm_campaign,
    l.utm_content,
    l.created_at,
    (
      select count(*)::bigint
      from public.member_source_winners w
      where w.pay_count = 1
        and upper(coalesce(w.link_source, '')) = upper(l.utm_source)
        and upper(coalesce(w.link_medium, '')) = upper(l.utm_medium)
        and upper(coalesce(w.link_campaign, '')) = upper(l.utm_campaign)
        and upper(coalesce(w.link_content, '')) = upper(coalesce(l.utm_content, ''))
    ) as new_members
  from public.tracking_links l
  order by l.created_at desc;
end;
$$;

revoke all on function public.member_sources_lock_paid() from public, anon, authenticated;
revoke all on function public.member_source_link_label(jsonb) from public, anon, authenticated;
revoke all on function public.member_source_heard_label(text, text) from public, anon, authenticated;
revoke all on function public.assert_super_admin() from public, anon, authenticated;
revoke all on function public.tracking_link_parts(text) from public, anon, authenticated;
revoke all on function public.slugify_utm(text) from public, anon, authenticated;

revoke all on function public.list_member_sources() from public, anon;
revoke all on function public.member_source_breakdown(date, date) from public, anon;
revoke all on function public.save_tracking_link(text, text, text, text) from public, anon;
revoke all on function public.list_tracking_links() from public, anon;

grant execute on function public.list_member_sources() to authenticated, service_role;
grant execute on function public.member_source_breakdown(date, date) to authenticated, service_role;
grant execute on function public.save_tracking_link(text, text, text, text) to authenticated, service_role;
grant execute on function public.list_tracking_links() to authenticated, service_role;

grant execute on function public.member_sources_lock_paid() to service_role;
grant execute on function public.member_source_link_label(jsonb) to service_role;
grant execute on function public.member_source_heard_label(text, text) to service_role;
grant execute on function public.assert_super_admin() to service_role;
grant execute on function public.tracking_link_parts(text) to service_role;
grant execute on function public.slugify_utm(text) to service_role;

-- Drop the unused utm_tracking table only when it is empty and nothing in
-- the database still references it. A failed check leaves the table in place.
do $$
declare
  n bigint;
  hits integer;
begin
  if to_regclass('public.utm_tracking') is null then
    raise notice 'utm_tracking already absent';
    return;
  end if;
  select count(*) into n from public.utm_tracking;
  select count(*) into hits from (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname not in ('pg_catalog', 'information_schema')
      and p.prosrc ilike '%utm_tracking%'
      and p.proname not in ('member_sources_lock_paid')
    union all
    select 1
    from pg_views v
    where v.schemaname = 'public'
      and v.viewname <> 'member_source_winners'
      and v.definition ilike '%utm_tracking%'
  ) s;
  if n = 0 and hits = 0 then
    drop table public.utm_tracking;
    raise notice 'dropped public.utm_tracking';
  else
    raise notice 'skipped drop of public.utm_tracking (rows=%, references=%)', n, hits;
  end if;
end $$;
