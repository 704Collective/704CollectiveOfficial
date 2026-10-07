-- ============================================================================
-- WAVE H2 — network_listings column guard (+ payments.payment_type 'listing')
-- ============================================================================
-- Same pattern as profiles_guard_columns (20260929200000): a BEFORE UPDATE
-- trigger that lets service role and admins through and, for everyone else,
-- diffs OLD vs NEW and raises 42501 naming any changed column outside the
-- owner-editable allowlist. Unchanged columns never trip it; columns added
-- later are blocked by default.
--
-- Owner-editable allowlist (content only — never status, billing, review or
-- rate columns):
--   company_name, hook, description, neighborhood, website_url, instagram_url,
--   phone, logo_url, photo_urls, updated_at
--
-- Admin check: BOTH the has_role(app_role) call used by profiles_guard_columns
-- AND the profiles.role convention that network_listings' own RLS policies use
-- (Wave H1). An admin who passes the table's RLS must also pass its guard; the
-- two role sources are known to disagree for some accounts
-- (cursor_report_profilewriters.md §6), so the guard accepts either.
--
-- payments.payment_type: the listing path in stripe-webhook records listing
-- invoices with payment_type = 'listing'. The existing CHECK only allowed
-- subscription | ticket | one_time, so it is widened here (additive: every
-- previously accepted value is kept). This is the one object outside
-- network_listings this wave touches; without it the spec'd listing payments
-- row could never be written.
-- ============================================================================

-- ── 1. guard ─────────────────────────────────────────────────────────────────
create or replace function public.network_listings_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allow text[] := array[
    'company_name', 'hook', 'description', 'neighborhood',
    'website_url', 'instagram_url', 'phone', 'logo_url', 'photo_urls',
    'updated_at'
  ];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_bad text[] := '{}';
begin
  -- Service role and non-API callers (SQL editor, cron, triggers) pass.
  if v_uid is null or auth.role() = 'service_role' then
    return new;
  end if;

  -- Admins pass (either role source).
  if has_role(v_uid, 'admin'::app_role) or has_role(v_uid, 'super_admin'::app_role)
     or exists (select 1 from public.profiles p
                 where p.id = v_uid and p.role = any (array['admin','super_admin']) and p.deleted_at is null) then
    return new;
  end if;

  -- Owner session: collect every key whose value actually changed.
  for v_key in select jsonb_object_keys(v_new) loop
    if (v_new -> v_key) is distinct from (v_old -> v_key)
       and not (v_key = any (v_allow)) then
      v_bad := v_bad || v_key;
    end if;
  end loop;

  if array_length(v_bad, 1) > 0 then
    raise exception 'network_listings_guard_columns: column(s) not editable by listing owners: %',
      array_to_string(v_bad, ', ')
      using errcode = '42501',
            hint = 'Owners may change listing content only; status, billing, review and rate fields are set by 704.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_network_listings_guard_columns on public.network_listings;
create trigger trg_network_listings_guard_columns
  before update on public.network_listings
  for each row execute function public.network_listings_guard_columns();

revoke all on function public.network_listings_guard_columns() from public, anon, authenticated;

-- ── 2. payments.payment_type widening (additive) ────────────────────────────
alter table public.payments drop constraint if exists payments_payment_type_check;
alter table public.payments add constraint payments_payment_type_check
  check (payment_type = any (array['subscription','ticket','one_time','listing']));
