import { supabase } from '@/integrations/supabase/client';
import type {
  ApprovalStatus,
  GetInboxOptions,
  GetSocialPostsOptions,
  SocialPostRow,
  SocialPostStatus,
} from './types';

function buildPostQuery(workspaceId: string, options: GetSocialPostsOptions = {}) {
  let q = supabase.from('social_posts').select('*').eq('workspace_id', workspaceId);
  if (options.status && options.status !== 'all') q = q.eq('status', options.status);
  if (options.campaignId && options.campaignId !== 'all') q = q.eq('campaign_id', options.campaignId);
  if (options.search?.trim()) q = q.ilike('caption', `%${options.search.trim()}%`);
  return q;
}

export async function getSocialAccounts(workspaceId: string) {
  const { data: accounts, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('platform');
  if (error) throw error;

  const ids = (accounts ?? []).map(a => a.id);
  let latestMetrics: Record<string, { follower_count: number; date: string }> = {};
  if (ids.length) {
    const { data: metrics } = await supabase
      .from('social_account_metrics')
      .select('social_account_id, follower_count, date')
      .in('social_account_id', ids)
      .order('date', { ascending: false });
    for (const row of metrics ?? []) {
      if (!latestMetrics[row.social_account_id]) {
        latestMetrics[row.social_account_id] = {
          follower_count: row.follower_count,
          date: row.date,
        };
      }
    }
  }

  return (accounts ?? []).map(a => ({
    ...a,
    latest_metrics: latestMetrics[a.id] ?? null,
  }));
}

export async function getSocialAccount(id: string) {
  const { data: account, error } = await supabase.from('social_accounts').select('*').eq('id', id).single();
  if (error) throw error;

  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select('id, caption, status, published_at, scheduled_at')
    .contains('target_account_ids', [id])
    .order('created_at', { ascending: false })
    .limit(10);

  return { account, recent_posts: recentPosts ?? [] };
}

export async function connectSocialAccount(
  workspaceId: string,
  platform: string,
  accountData: {
    account_id: string;
    account_name: string;
    account_handle?: string | null;
    avatar_url?: string | null;
  },
  tokens: { access_token?: string | null; refresh_token?: string | null; token_expires_at?: string | null }
) {
  const row = {
    workspace_id: workspaceId,
    platform,
    account_id: accountData.account_id,
    account_name: accountData.account_name,
    account_handle: accountData.account_handle ?? null,
    avatar_url: accountData.avatar_url ?? null,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    token_expires_at: tokens.token_expires_at ?? null,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(row, { onConflict: 'workspace_id,platform,account_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function disconnectSocialAccount(id: string) {
  const { error } = await supabase
    .from('social_accounts')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getSocialPosts(workspaceId: string, options: GetSocialPostsOptions = {}) {
  let q = buildPostQuery(workspaceId, options).order('created_at', { ascending: false }).limit(500);
  const { data: posts, error } = await q;
  if (error) throw error;

  let filtered = (posts ?? []) as SocialPostRow[];
  if (options.dateFrom) {
    const t = new Date(options.dateFrom).getTime();
    filtered = filtered.filter(p => {
      const ts = p.scheduled_at || p.published_at || p.created_at;
      return ts && new Date(ts).getTime() >= t;
    });
  }
  if (options.dateTo) {
    const t = new Date(options.dateTo).getTime();
    filtered = filtered.filter(p => {
      const ts = p.scheduled_at || p.published_at || p.created_at;
      return ts && new Date(ts).getTime() <= t;
    });
  }

  if (options.platform && options.platform !== 'all') {
    const { data: accs } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('platform', options.platform);
    const ids = new Set((accs ?? []).map(a => a.id));
    filtered = filtered.filter(p => (p.target_account_ids as string[])?.some(tid => ids.has(tid)));
  }
  if (options.accountId && options.accountId !== 'all') {
    filtered = filtered.filter(p => (p.target_account_ids as string[])?.includes(options.accountId!));
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  filtered = filtered.slice(offset, offset + limit);

  const postIds = filtered.map(p => p.id);
  const metricsByPost: Record<string, unknown[]> = {};
  if (postIds.length) {
    const { data: m } = await supabase.from('social_post_metrics').select('*').in('post_id', postIds);
    for (const row of m ?? []) {
      metricsByPost[row.post_id] = [...(metricsByPost[row.post_id] ?? []), row];
    }
  }

  return filtered.map(p => ({ ...p, metrics: metricsByPost[p.id] ?? [] }));
}

export async function getSocialPost(id: string) {
  const { data: post, error } = await supabase.from('social_posts').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: metrics } = await supabase.from('social_post_metrics').select('*').eq('post_id', id);
  return { post: post as SocialPostRow, metrics: metrics ?? [] };
}

export async function createSocialPost(data: Partial<SocialPostRow> & { workspace_id: string; caption: string }) {
  const { data: row, error } = await supabase
    .from('social_posts')
    .insert({
      workspace_id: data.workspace_id,
      caption: data.caption,
      media_urls: data.media_urls ?? [],
      media_types: data.media_types ?? [],
      status: (data.status as SocialPostStatus) ?? 'draft',
      scheduled_at: data.scheduled_at ?? null,
      published_at: data.published_at ?? null,
      platform_post_ids: data.platform_post_ids ?? {},
      target_account_ids: data.target_account_ids ?? [],
      campaign_id: data.campaign_id ?? null,
      link_url: data.link_url ?? null,
      hashtags: data.hashtags ?? [],
      mentions: data.mentions ?? [],
      first_comment: data.first_comment ?? null,
      approval_status: (data.approval_status as ApprovalStatus) ?? 'draft',
      created_by: data.created_by ?? null,
      is_recurring: data.is_recurring ?? false,
      recurrence_rule: data.recurrence_rule ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function updateSocialPost(id: string, data: Partial<SocialPostRow>) {
  const { error } = await supabase.from('social_posts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteSocialPost(id: string) {
  const { error } = await supabase.from('social_posts').delete().eq('id', id);
  if (error) throw error;
}

export async function scheduleSocialPost(id: string, scheduledAt: string) {
  const { error } = await supabase
    .from('social_posts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function approveSocialPost(id: string, userId: string) {
  const { error } = await supabase
    .from('social_posts')
    .update({
      approval_status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function rejectSocialPost(id: string, userId: string, reason: string) {
  const { error } = await supabase
    .from('social_posts')
    .update({
      approval_status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getContentCalendar(workspaceId: string, startDate: string, endDate: string) {
  const { data: posts, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['scheduled', 'published', 'draft']);
  if (error) throw error;

  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  const byDay: Record<string, SocialPostRow[]> = {};
  for (const p of posts ?? []) {
    const d = (p.scheduled_at || p.published_at || p.created_at) as string;
    const day = d.slice(0, 10);
    if (day < start || day > end) continue;
    byDay[day] = [...(byDay[day] ?? []), p as SocialPostRow];
  }
  return byDay;
}

export async function getInboxMessages(workspaceId: string, options: GetInboxOptions = {}) {
  let q = supabase.from('social_inbox_messages').select('*').eq('workspace_id', workspaceId);
  if (options.status && options.status !== 'all') q = q.eq('status', options.status);
  if (options.type && options.type !== 'all') q = q.eq('type', options.type);
  if (options.accountId && options.accountId !== 'all') q = q.eq('social_account_id', options.accountId);
  if (options.search?.trim()) q = q.or(`content.ilike.%${options.search}%,author_name.ilike.%${options.search}%`);
  if (options.assignedTo === 'me') {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) q = q.eq('assigned_to', u.user.id);
  } else if (options.assignedTo && options.assignedTo !== 'all') {
    q = q.eq('assigned_to', options.assignedTo);
  }
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  q = q.order('received_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;

  let rows = data ?? [];
  if (options.platform && options.platform !== 'all') {
    const { data: accs } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('platform', options.platform);
    const ids = new Set((accs ?? []).map(a => a.id));
    rows = rows.filter(r => ids.has(r.social_account_id));
  }
  return rows;
}

export async function getInboxMessage(id: string) {
  const { data: message, error } = await supabase.from('social_inbox_messages').select('*').eq('id', id).single();
  if (error) throw error;
  const thread: unknown[] = [];
  let cur = message;
  while (cur.parent_message_id) {
    const { data: parent } = await supabase.from('social_inbox_messages').select('*').eq('id', cur.parent_message_id).single();
    if (!parent) break;
    thread.unshift(parent);
    cur = parent;
  }
  const { data: replies } = await supabase.from('social_inbox_replies').select('*').eq('message_id', id).order('sent_at');
  return { message, thread, replies: replies ?? [] };
}

export async function updateMessageStatus(id: string, status: string) {
  const { error } = await supabase
    .from('social_inbox_messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function assignMessage(id: string, userId: string | null) {
  const { error } = await supabase
    .from('social_inbox_messages')
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function replyToMessage(id: string, content: string, userId: string) {
  const { error: e1 } = await supabase.from('social_inbox_replies').insert({
    message_id: id,
    content,
    sent_by: userId,
  });
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('social_inbox_messages')
    .update({
      status: 'replied',
      replied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (e2) throw e2;
}

export async function archiveMessage(id: string) {
  await updateMessageStatus(id, 'archived');
}

export async function getSavedReplies(workspaceId: string) {
  const { data, error } = await supabase
    .from('saved_reply_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createSavedReply(data: {
  workspace_id: string;
  name: string;
  content: string;
  category?: string | null;
  created_by?: string | null;
}) {
  const { data: row, error } = await supabase
    .from('saved_reply_templates')
    .insert({
      workspace_id: data.workspace_id,
      name: data.name,
      content: data.content,
      category: data.category ?? null,
      created_by: data.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function updateSavedReply(id: string, data: { name?: string; content?: string; category?: string | null }) {
  const { error } = await supabase.from('saved_reply_templates').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteSavedReply(id: string) {
  const { error } = await supabase.from('saved_reply_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function getHashtagMonitors(workspaceId: string) {
  const { data: monitors, error } = await supabase.from('hashtag_monitors').select('*').eq('workspace_id', workspaceId);
  if (error) throw error;
  return monitors ?? [];
}

export async function createHashtagMonitor(workspaceId: string, hashtag: string, platforms: string[]) {
  const { data, error } = await supabase
    .from('hashtag_monitors')
    .insert({
      workspace_id: workspaceId,
      hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
      platforms,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHashtagMonitor(id: string) {
  const { error } = await supabase.from('hashtag_monitors').delete().eq('id', id);
  if (error) throw error;
}

export async function getHashtagMentions(monitorId: string, options: { limit?: number; offset?: number } = {}) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const { data, error } = await supabase
    .from('hashtag_mentions')
    .select('*')
    .eq('monitor_id', monitorId)
    .order('posted_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function getBestTimeToPost(accountId: string) {
  const { data, error } = await supabase
    .from('best_time_to_post')
    .select('*')
    .eq('social_account_id', accountId)
    .order('engagement_score', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPostAnalytics(
  workspaceId: string,
  options: { platform?: string; dateFrom?: string; dateTo?: string; accountId?: string } = {}
) {
  const { data: wsPosts, error: e1 } = await supabase.from('social_posts').select('id').eq('workspace_id', workspaceId);
  if (e1) throw e1;
  const postIds = (wsPosts ?? []).map(p => p.id);
  if (!postIds.length) return [];

  let q = supabase.from('social_post_metrics').select('*').in('post_id', postIds);
  if (options.accountId) q = q.eq('social_account_id', options.accountId);
  const { data: metrics, error: e2 } = await q;
  if (e2) throw e2;

  const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('workspace_id', workspaceId);
  const plat = new Map((accounts ?? []).map(a => [a.id, a.platform]));

  let rows = (metrics ?? []).map(m => ({ ...m, platform: plat.get(m.social_account_id) }));
  if (options.platform) rows = rows.filter(r => r.platform === options.platform);
  return rows;
}

export async function getAudienceGrowth(accountId: string, periodDays: number) {
  const from = new Date();
  from.setDate(from.getDate() - periodDays);
  const { data, error } = await supabase
    .from('social_account_metrics')
    .select('*')
    .eq('social_account_id', accountId)
    .gte('date', from.toISOString().slice(0, 10))
    .order('date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEngagementReport(workspaceId: string, periodDays: number) {
  const posts = await getSocialPosts(workspaceId, { limit: 200 });
  const cutoff = Date.now() - periodDays * 86400000;
  return posts.filter(p => new Date(p.created_at).getTime() >= cutoff);
}

export async function countUnreadSocialInbox(workspaceId: string) {
  const { count, error } = await supabase
    .from('social_inbox_messages')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'unread');
  if (error) return 0;
  return count ?? 0;
}
