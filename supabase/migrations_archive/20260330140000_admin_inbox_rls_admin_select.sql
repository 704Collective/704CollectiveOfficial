-- Team inbox: admins/super_admins can read all admin_conversations, participants, and messages.
-- Avoids brittle participant-only visibility and empty/edge-case query failures.

DROP POLICY IF EXISTS "admin_conversations_select" ON public.admin_conversations;
CREATE POLICY "admin_conversations_select" ON public.admin_conversations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversations.id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admin_conv_participants_select" ON public.admin_conversation_participants;
CREATE POLICY "admin_conv_participants_select" ON public.admin_conversation_participants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
  )
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_conversations c
    WHERE c.id = admin_conversation_participants.conversation_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_conversation_participants cp
    WHERE cp.conversation_id = admin_conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admin_messages_select" ON public.admin_messages;
CREATE POLICY "admin_messages_select" ON public.admin_messages FOR SELECT USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.deleted_at IS NULL AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_conversation_participants cp
      WHERE cp.conversation_id = admin_messages.conversation_id AND cp.user_id = auth.uid()
    )
  )
);
