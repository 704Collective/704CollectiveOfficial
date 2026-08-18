-- Capture-only. Count logic now excludes is_internal accounts in addition to the
-- @704collective.com domain pattern. Applied by hand to develop and prod 2026-08-18.
-- Receipted unchanged at 82/71/0/11.
--
-- Both bodies below are the prod definitions, captured 2026-08-18 from
-- pg_get_functiondef('public.get_member_counts'::regproc)
--   (prod md5 a7d4421be88308f8ebdec4ced35e3192, 1300 bytes as printed) and
-- pg_get_viewdef('public.member_counts'::regclass, true)
--   (prod md5 0a1b922a29b22faf90c69a187133911b, 804 bytes).
-- Prod stores the function body with CRLF line endings; this file is LF, so the
-- function body matches byte for byte only after newline normalization -- same
-- caveat as the Wave 1 capture. The view body is LF on both sides, no caveat.
-- Idempotent by construction: both statements are create or replace.
--
-- The two predicates are deliberately kept together rather than swapped. The flag
-- alone would have raised active_members to 83 at capture time, because the domain
-- pattern was catching an account the flag did not; the domain pattern alone leaves
-- any future internal account on a non-704collective.com address counted. Belt and
-- braces keeps the receipt at 82/71/0/11 through the switch.


-- ============================================================
-- get_member_counts()
-- Admin-gated: the caller must be an admin or super_admin by auth.uid(), so
-- service-role sessions (MCP, edge functions) correctly get
-- 'forbidden: admin required' rather than numbers. That gate is unchanged.
-- ============================================================

create or replace function public.get_member_counts()
returns table(active_members bigint, paying_members bigint, coupon_comped bigint, override_comped bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  ) then
    raise exception 'forbidden: admin required';
  end if;
  return query
  with am as (
    select p.id
    from public.profiles p
    where p.deleted_at is null
      and p.subscription_status = 'active'
      and p.is_internal = false
      and p.email not like '%@704collective.com'
  ),
  classified as (
    select
      am.id,
      (select lc.amount
         from public.payments lc
        where lc.user_id = am.id and lc.status = 'succeeded'
        order by lc.created_at desc
        limit 1) as latest_amount
    from am
  )
  select
    count(*)::bigint                                        as active_members,
    (count(*) filter (where latest_amount > 0))::bigint     as paying_members,
    (count(*) filter (where latest_amount = 0))::bigint     as coupon_comped,
    (count(*) filter (where latest_amount is null))::bigint as override_comped
  from classified;
end;
$function$;


-- ============================================================
-- member_counts view: the same predicate with no admin gate, so it is readable
-- by anything that can select from it. Body below is pg_get_viewdef output
-- verbatim, which is why it carries Postgres' own formatting and the
-- !~~ / ::text rewrites of `not like` and the literals.
-- ============================================================

create or replace view public.member_counts as
 WITH active_members AS (
         SELECT p.id
           FROM profiles p
          WHERE p.deleted_at IS NULL AND p.subscription_status = 'active'::text AND p.is_internal = false AND p.email !~~ '%@704collective.com'::text
        ), classified AS (
         SELECT am.id,
            ( SELECT lc.amount
                   FROM payments lc
                  WHERE lc.user_id = am.id AND lc.status = 'succeeded'::text
                  ORDER BY lc.created_at DESC
                 LIMIT 1) AS latest_amount
           FROM active_members am
        )
 SELECT count(*) AS active_members,
    count(*) FILTER (WHERE latest_amount > 0) AS paying_members,
    count(*) FILTER (WHERE latest_amount = 0) AS coupon_comped,
    count(*) FILTER (WHERE latest_amount IS NULL) AS override_comped
   FROM classified;
