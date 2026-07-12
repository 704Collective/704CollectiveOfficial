-- Fix infinite RLS recursion on admin_conversation_participants (and dependent policies).
-- Policies must not subquery admin_conversation_participants; use SECURITY DEFINER instead.

CREATE OR REPLACE FUNCTION public.is_admin_conversation_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_conversation_participants acp
    WHERE acp.conversation_id = p_conversation_id
      AND acp.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_conversation_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_conversation_participant(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- admin_conversation_participants: drop all known policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_conv_participants_select" ON public.admin_conversation_participants;
DROP POLICY IF EXISTS "admin_conv_participants_insert" ON public.admin_conversation_participants;
DROP POLICY IF EXISTS "admin_conv_participants_update" ON public.admin_conversation_participants;
DROP POLICY IF EXISTS "admin_conv_participants_delete" ON public.admin_conversation_participants;

CREATE POLICY "admin_conv_participants_select" ON public.admin_conversation_participants
  FOR SELECT
  USING (
    public.is_admin_conversation_participant(conversation_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "admin_conv_participants_insert" ON public.admin_conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "admin_conv_participants_update" ON public.admin_conversation_participants
  FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "admin_conv_participants_delete" ON public.admin_conversation_participants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- admin_conversations: remove subqueries that re-enter participants RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_conversations_select" ON public.admin_conversations;
DROP POLICY IF EXISTS "admin_conversations_insert" ON public.admin_conversations;
DROP POLICY IF EXISTS "admin_conversations_update" ON public.admin_conversations;
DROP POLICY IF EXISTS "admin_conversations_delete" ON public.admin_conversations;

CREATE POLICY "admin_conversations_select" ON public.admin_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
    OR created_by = (SELECT auth.uid())
    OR public.is_admin_conversation_participant(id)
  );

CREATE POLICY "admin_conversations_insert" ON public.admin_conversations
  FOR INSERT
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "admin_conversations_update" ON public.admin_conversations
  FOR UPDATE
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_admin_conversation_participant(id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    OR public.is_admin_conversation_participant(id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.deleted_at IS NULL
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- admin_messages: use helper instead of subquery on participants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_messages_select" ON public.admin_messages;
DROP POLICY IF EXISTS "admin_messages_insert" ON public.admin_messages;
DROP POLICY IF EXISTS "admin_messages_update" ON public.admin_messages;
DROP POLICY IF EXISTS "admin_messages_delete" ON public.admin_messages;

CREATE POLICY "admin_messages_select" ON public.admin_messages
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.deleted_at IS NULL
          AND p.role IN ('admin', 'super_admin')
      )
      OR public.is_admin_conversation_participant(conversation_id)
    )
  );

CREATE POLICY "admin_messages_insert" ON public.admin_messages
  FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.is_admin_conversation_participant(conversation_id)
  );
