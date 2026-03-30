import type { SupabaseClient } from '@supabase/supabase-js';

export interface IncomingMessageData {
  workspace_id: string;
  social_account_id: string;
  platform_message_id: string;
  platform_post_id?: string | null;
  type: 'comment' | 'dm' | 'mention' | 'reply';
  direction?: 'inbound' | 'outbound';
  author_name: string;
  author_handle?: string | null;
  author_avatar_url?: string | null;
  author_platform_id?: string | null;
  content: string;
  media_url?: string | null;
  received_at: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
}

export async function processIncomingMessage(
  supabase: SupabaseClient,
  platformMessageId: string,
  _platform: string,
  _accountId: string,
  messageData: IncomingMessageData,
  options: { aiSentimentEnabled?: boolean; workspaceAdminIds?: string[] } = {}
): Promise<{ created: boolean; id?: string }> {
  const { data: existing } = await supabase
    .from('social_inbox_messages')
    .select('id')
    .eq('platform_message_id', platformMessageId)
    .maybeSingle();
  if (existing) return { created: false, id: existing.id };

  let sentiment = messageData.sentiment ?? null;
  if (options.aiSentimentEnabled && !sentiment) {
    sentiment = messageData.content.toLowerCase().includes('love') || messageData.content.includes('❤')
      ? 'positive'
      : messageData.content.toLowerCase().includes('bad') || messageData.content.toLowerCase().includes('hate')
        ? 'negative'
        : 'neutral';
  }

  const contactId: string | null = null;

  const { data: inserted, error } = await supabase
    .from('social_inbox_messages')
    .insert({
      ...messageData,
      sentiment,
      contact_id: contactId,
    })
    .select('id')
    .single();

  if (error) throw error;

  const adminIds = options.workspaceAdminIds ?? [];
  for (const uid of adminIds) {
    try {
      await supabase.from('notifications').insert({
        user_id: uid,
        type: 'social_inbox',
        title: 'Social inbox',
        message: `${messageData.author_name}: ${messageData.content.slice(0, 120)}`,
        is_read: false,
      });
    } catch {
      /* notifications schema may omit extended fields */
    }
  }

  return { created: true, id: inserted.id };
}

export async function checkHashtagMentions(supabase: SupabaseClient, workspaceId: string): Promise<number> {
  const { data: monitors } = await supabase.from('hashtag_monitors').select('*').eq('workspace_id', workspaceId).eq('is_active', true);
  let added = 0;
  for (const mon of monitors ?? []) {
    const mock = {
      monitor_id: mon.id,
      platform: (mon.platforms?.[0] as string) ?? 'instagram',
      platform_post_id: `mock_${mon.id}_${Date.now()}`,
      author_name: 'Sample User',
      author_handle: '@sample',
      content: `Great post ${mon.hashtag} — loving the vibe!`,
      likes: 12,
      comments: 2,
      url: 'https://example.com/post',
      posted_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('hashtag_mentions').upsert(mock, { onConflict: 'monitor_id,platform_post_id' });
    if (!error) added += 1;
    await supabase
      .from('hashtag_monitors')
      .update({
        total_mentions: (mon.total_mentions ?? 0) + 1,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', mon.id);
  }
  return added;
}

export async function syncInboxForAccount(supabase: SupabaseClient, accountId: string): Promise<number> {
  await supabase
    .from('social_accounts')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', accountId);
  console.log('[social] syncInboxForAccount placeholder — wire platform inbox APIs here', accountId);
  return 0;
}
