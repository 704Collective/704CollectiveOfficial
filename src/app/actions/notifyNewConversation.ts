'use server';

import { createClient } from '@supabase/supabase-js';

interface NotifyParams {
  conversationId: string;
  senderName: string;
  senderUserId: string;
  recipientUserIds: string[];
}

export async function notifyNewConversation(params: NotifyParams) {
  const { conversationId, senderName, senderUserId, recipientUserIds } = params;

  if (!recipientUserIds.length) return;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: recipients } = await adminClient
    .from('profiles')
    .select('id, email, full_name')
    .in('id', recipientUserIds)
    .neq('id', senderUserId);

  if (!recipients?.length) return;

  // Insert notification rows
  await adminClient.from('notifications').insert(
    recipients.map((r) => ({
      user_id: r.id,
      message: `${senderName} sent you a message`,
      notification_type: 'new_message',
      action_url: '/dashboard/messages',
    }))
  );

  // Send one email per recipient via the existing send-email edge function
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const messagesUrl = 'https://704collective.com/dashboard/messages';

  for (const recipient of recipients) {
    if (!recipient.email) continue;
    try {
      await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: recipient.email,
          template: 'new-message',
          data: {
            name: recipient.full_name || 'Member',
            senderName,
            messagesUrl,
            conversationId,
          },
        }),
      });
    } catch {
      // Non-fatal — notification row already inserted above
    }
  }
}
