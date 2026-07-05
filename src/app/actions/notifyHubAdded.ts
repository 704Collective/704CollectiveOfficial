'use server';

import { createClient } from '@supabase/supabase-js';

interface NotifyHubAddedParams {
  hubId: string;
  hubTitle: string;
  addedUserId: string;
  addedByName: string;
}

export async function notifyHubAdded(params: NotifyHubAddedParams) {
  const { hubId, hubTitle, addedUserId, addedByName } = params;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: recipient } = await adminClient
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', addedUserId)
    .single();

  if (!recipient) return;

  // Insert notification row
  await adminClient.from('notifications').insert({
    user_id: recipient.id,
    type: 'hub_added',
    title: 'Added to a hub',
    message: `You were added to the hub: ${hubTitle}`,
    notification_type: 'hub_added',
    action_url: `/dashboard/hubs/${hubId}`,
  });

  // Send email
  if (!recipient.email) return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: recipient.email,
        template: 'hub-added',
        data: {
          name: recipient.full_name || 'Member',
          hubTitle,
          addedByName,
          hubUrl: `https://704collective.com/dashboard/hubs/${hubId}`,
        },
      }),
    });
  } catch {
    // Non-fatal
  }
}
