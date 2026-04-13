-- =============================================================================
-- Fix infinite recursion in hub_members RLS policies.
--
-- Root causes:
--   1. hub_members_select queries hub_members itself (self-referential loop).
--   2. hubs_select queries hub_members; inserting a hub_member re-evaluates
--      the hubs policy which queries hub_members again (cross-table loop).
--
-- Fix: security-definer function that bypasses RLS for the membership check,
--      then use it in all policies that previously queried hub_members directly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Security-definer helper — runs as the function owner, skips RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_hub_member(p_hub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hub_members
    WHERE hub_id = p_hub_id
      AND user_id = auth.uid()
  );
$$;

-- Tighten permissions: only authenticated users / service_role may call it.
REVOKE EXECUTE ON FUNCTION public.is_hub_member(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_hub_member(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_hub_member(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. hubs policies — replace hub_members JOIN with is_hub_member()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hubs_select"          ON public.hubs;
DROP POLICY IF EXISTS "hubs_insert"          ON public.hubs;
DROP POLICY IF EXISTS "hubs_update"          ON public.hubs;
DROP POLICY IF EXISTS "hubs_delete"          ON public.hubs;
DROP POLICY IF EXISTS "Admins can manage hubs" ON public.hubs;
DROP POLICY IF EXISTS "Members can view hubs"  ON public.hubs;

-- Members can see hubs they belong to; admins can see all.
CREATE POLICY "hubs_select" ON public.hubs
FOR SELECT USING (
  public.is_hub_member(id)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hubs_insert" ON public.hubs
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hubs_update" ON public.hubs
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "hubs_delete" ON public.hubs
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- 3. hub_members policies — replace self-referential query with is_hub_member()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hub_members_select" ON public.hub_members;
DROP POLICY IF EXISTS "hub_members_insert" ON public.hub_members;
DROP POLICY IF EXISTS "hub_members_update" ON public.hub_members;
DROP POLICY IF EXISTS "hub_members_delete" ON public.hub_members;

-- SELECT: member of same hub (via definer fn) OR admin.
CREATE POLICY "hub_members_select" ON public.hub_members
FOR SELECT USING (
  public.is_hub_member(hub_id)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

-- INSERT: admins only.
CREATE POLICY "hub_members_insert" ON public.hub_members
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

-- UPDATE: own row (e.g. last_seen) OR admin.
CREATE POLICY "hub_members_update" ON public.hub_members
FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);

-- DELETE: admins only.
CREATE POLICY "hub_members_delete" ON public.hub_members
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.role IN ('admin', 'super_admin')
  )
);
