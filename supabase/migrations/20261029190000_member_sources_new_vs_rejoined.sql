-- Fix new vs rejoined: a renewal is neither. New = first paid date in range.
-- Rejoined = a later checkout-shaped payment (metadata.session_id) after first paid.
-- Checkout vs invoice: checkout writes metadata.session_id; invoice.payment_succeeded
-- writes no metadata. Do not use pay_count for this.

create or replace function public.member_source_is_checkout(p_metadata jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(p_metadata ? 'session_id', false);
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
  where w.first_paid is not null
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
    and public.member_source_is_checkout(pay.metadata)
    and pay.created_at >= v_from
    and pay.created_at < v_to
    and w.first_paid is not null
    and pay.created_at > w.first_paid;
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
      where w.first_paid is not null
        and upper(coalesce(w.link_source, '')) = upper(l.utm_source)
        and upper(coalesce(w.link_medium, '')) = upper(l.utm_medium)
        and upper(coalesce(w.link_campaign, '')) = upper(l.utm_campaign)
        and upper(coalesce(w.link_content, '')) = upper(coalesce(l.utm_content, ''))
    ) as new_members
  from public.tracking_links l
  order by l.created_at desc;
end;
$$;

revoke all on function public.member_source_is_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.member_source_is_checkout(jsonb) to service_role;

revoke all on function public.member_source_breakdown(date, date) from public, anon;
revoke all on function public.list_tracking_links() from public, anon;
grant execute on function public.member_source_breakdown(date, date) to authenticated, service_role;
grant execute on function public.list_tracking_links() to authenticated, service_role;
