-- ============================================================================
-- IDENTITY WAVE 3D — the three people<->profiles holdout functions
-- ============================================================================
-- cursor_report_wave6d.md §4 / cursor_report_identitystatus.md 3D. Three
-- attendance/mention functions still joined people to profiles through the
-- pre-bridge glue: two via people.metadata->>'profile_id' (the sticky note),
-- one via lower(profiles.email) = people.email_lower. None excluded internal
-- test accounts. This migration rewrites each onto the canonical bridge
-- (people.auth_user_id = profiles.id), adds `profiles.is_internal = false`,
-- and keeps every other predicate byte-for-byte: membership rule, caller
-- gates, ordering, limits, return shapes.
--
-- Metadata fallback: deliberately DROPPED, not retained. Read-only prod census
-- (2026-09-19): 267 people carry metadata.profile_id; 0 of them lack
-- auth_user_id; 0 disagree with auth_user_id; 0 holders of member credentials
-- lack auth_user_id. The sticky note is a strict duplicate of the bridge, so
-- a fallback would only ever re-derive the same row. Wave A's signup trigger
-- links every new account by auth_user_id, so the class cannot grow.
--
-- Grants: born-private convention. Each function keeps EXACTLY the roles its
-- real callers use today (see receipts in cursor_report_wave3d_build.md):
--   search_event_discussion_mentionables  authenticated (browser textarea) + service_role
--   get_event_discussion_mentionable_ids  service_role only (edge fn + server action)
--   get_event_attendees                   authenticated (WhosGoing, discussion page) + service_role
-- PUBLIC and anon are revoked everywhere. The first function's anon revoke was
-- hand-applied on prod already (§3 drift capture); the third still carried a
-- PUBLIC execute from the baseline dump, which no caller uses (the function
-- raises 'Not authenticated' before touching data when auth.uid() is null).
-- ============================================================================

-- ── 1. search_event_discussion_mentionables(p_event_id, p_query) ────────────
create or replace function public.search_event_discussion_mentionables(p_event_id uuid, p_query text)
 returns table(id uuid, full_name text, avatar_url text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT pr.id, pr.full_name, pr.avatar_url
  FROM profiles pr
  WHERE public.can_view_event_discussion(p_event_id)      -- gate the CALLER
    AND pr.deleted_at IS NULL
    AND pr.is_internal = false                            -- 3D: internal test accounts never listed
    AND pr.full_name IS NOT NULL
    AND pr.full_name ILIKE '%' || COALESCE(p_query, '') || '%'
    -- LISTED person must be an active member (or admin) ...
    AND (
      pr.role IN ('admin','super_admin')
      OR (
        pr.member_type IN ('social','business')
        AND (
          pr.subscription_status IN ('active','paused')
          OR (pr.subscription_status = 'canceled' AND pr.subscription_ends_at > now())
          OR pr.membership_override = true
        )
      )
    )
    -- ... AND actually RSVP'd to THIS event (people<->profiles via the bridge):
    AND EXISTS (
      SELECT 1
      FROM attendance_credentials ac
      JOIN people pe ON pe.id = ac.person_id
      WHERE ac.event_id = p_event_id
        AND ac.status IN ('active','used')
        AND ac.credential_type IN ('member','member_rsvp')
        AND pe.auth_user_id = pr.id
    )
  ORDER BY pr.full_name
  LIMIT 6;
$function$;

revoke all on function public.search_event_discussion_mentionables(uuid, text) from public, anon;
grant execute on function public.search_event_discussion_mentionables(uuid, text) to authenticated, service_role;

-- ── 2. get_event_discussion_mentionable_ids(p_event_id) ─────────────────────
create or replace function public.get_event_discussion_mentionable_ids(p_event_id uuid)
 returns table(id uuid, full_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT pr.id, pr.full_name
  FROM profiles pr
  WHERE pr.deleted_at IS NULL
    AND pr.is_internal = false                            -- 3D
    AND pr.full_name IS NOT NULL
    AND (
      pr.role IN ('admin','super_admin')
      OR (pr.member_type IN ('social','business')
          AND (pr.subscription_status IN ('active','paused')
               OR (pr.subscription_status = 'canceled' AND pr.subscription_ends_at > now())
               OR pr.membership_override = true))
    )
    AND EXISTS (
      SELECT 1 FROM attendance_credentials ac
      JOIN people pe ON pe.id = ac.person_id
      WHERE ac.event_id = p_event_id
        AND ac.status IN ('active','used')
        AND ac.credential_type IN ('member','member_rsvp')
        AND pe.auth_user_id = pr.id
    );
$function$;

revoke all on function public.get_event_discussion_mentionable_ids(uuid) from public, anon, authenticated;
grant execute on function public.get_event_discussion_mentionable_ids(uuid) to service_role;

-- ── 3. get_event_attendees(p_event_id) ──────────────────────────────────────
create or replace function public.get_event_attendees(p_event_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_caller_id uuid; v_caller_active boolean;
  v_member_count bigint; v_public_count bigint; v_guest_count bigint; v_attendees jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND deleted_at IS NULL
      AND (role IN ('admin','super_admin')
        OR (member_type IN ('social','business')
            AND (subscription_status IN ('active','paused')
              OR (subscription_status = 'canceled' AND subscription_ends_at > NOW())
              OR membership_override = true)))
  ) INTO v_caller_active;
  IF NOT v_caller_active THEN RAISE EXCEPTION 'Not authorized to view attendees'; END IF;

  -- Counts: internal accounts' credentials are not counted either, so the
  -- number on the widget matches the faces beneath it.
  SELECT COUNT(*) INTO v_member_count FROM attendance_credentials ac
  JOIN people pe ON pe.id = ac.person_id
  LEFT JOIN profiles pr ON pr.id = pe.auth_user_id
  WHERE ac.event_id = p_event_id AND ac.status IN ('active','used') AND ac.credential_type IN ('member','member_rsvp')
    AND COALESCE(pr.is_internal, false) = false;
  SELECT COUNT(*) INTO v_public_count FROM attendance_credentials
  WHERE event_id = p_event_id AND status IN ('active','used') AND credential_type = 'public_rsvp';
  SELECT COUNT(*) INTO v_guest_count FROM attendance_credentials
  WHERE event_id = p_event_id AND status IN ('active','used') AND credential_type = 'guest_pass';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', COALESCE(pr.id, pe.id), 'full_name', COALESCE(pe.full_name, pr.full_name), 'avatar_url', pr.avatar_url)), '[]'::jsonb)
  INTO v_attendees
  FROM (
    SELECT ac.person_id, ac.created_at FROM attendance_credentials ac
    JOIN people pe0 ON pe0.id = ac.person_id
    LEFT JOIN profiles pr0 ON pr0.id = pe0.auth_user_id
    WHERE ac.event_id = p_event_id AND ac.status IN ('active','used')
      AND ac.credential_type IN ('member','member_rsvp')
      AND COALESCE(pr0.is_internal, false) = false
    ORDER BY ac.created_at ASC LIMIT 8
  ) x
  JOIN people pe ON pe.id = x.person_id
  LEFT JOIN profiles pr ON pr.id = pe.auth_user_id AND pr.deleted_at IS NULL;   -- 3D: bridge, not email glue

  RETURN jsonb_build_object('member_count', v_member_count, 'public_count', v_public_count,
    'guest_count', v_guest_count, 'total_count', v_member_count + v_public_count, 'attendees', v_attendees);
END; $function$;

revoke all on function public.get_event_attendees(uuid) from public, anon;
grant execute on function public.get_event_attendees(uuid) to authenticated, service_role;
