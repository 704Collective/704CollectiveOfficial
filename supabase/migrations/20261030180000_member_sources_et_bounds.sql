-- Member-source date ranges use Charlotte (America/New_York) day boundaries,
-- not UTC midnight. Same new-vs-rejoined math as 20261029190000.

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
  v_from timestamptz := (p_from::timestamp at time zone 'America/New_York');
  v_to   timestamptz := ((p_to + 1)::timestamp at time zone 'America/New_York');
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

revoke all on function public.member_source_breakdown(date, date) from public, anon;
grant execute on function public.member_source_breakdown(date, date) to authenticated, service_role;
