-- Batch 4: Adam universal inbox flag + bump admin_conversations.updated_at on new messages
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS see_all_cross_conversations boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.bump_admin_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_messages_bump_conv_updated ON public.admin_messages;
CREATE TRIGGER admin_messages_bump_conv_updated
  AFTER INSERT ON public.admin_messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.bump_admin_conversation_timestamp();
