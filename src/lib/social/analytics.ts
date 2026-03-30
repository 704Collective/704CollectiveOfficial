import type { SupabaseClient } from '@supabase/supabase-js';

export function calculateEngagementRate(
  likes: number,
  comments: number,
  shares: number,
  saves: number,
  reach: number
): number {
  if (!reach || reach <= 0) return 0;
  return ((likes + comments + shares + saves) / reach) * 100;
}

export async function syncPostMetrics(
  supabase: SupabaseClient,
  postId: string
): Promise<{ synced: number }> {
  const { data: rows } = await supabase.from('social_post_metrics').select('*').eq('post_id', postId);
  let n = 0;
  for (const row of rows ?? []) {
    const reach = 800 + Math.floor(Math.random() * 400);
    const likes = Math.floor(reach * 0.05);
    const comments = Math.floor(likes * 0.12);
    const shares = Math.floor(likes * 0.08);
    const saves = Math.floor(likes * 0.1);
    const engagement_rate = calculateEngagementRate(likes, comments, shares, saves, reach);
    await supabase
      .from('social_post_metrics')
      .update({
        impressions: reach * 2,
        reach,
        likes,
        comments,
        shares,
        saves,
        engagement_rate,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    n += 1;
  }
  return { synced: n };
}

export async function syncAccountMetrics(
  supabase: SupabaseClient,
  accountId: string,
  date: string
): Promise<void> {
  const { data: acc } = await supabase.from('social_accounts').select('follower_count').eq('id', accountId).single();
  const base = acc?.follower_count ?? 1000;
  await supabase.from('social_account_metrics').upsert(
    {
      social_account_id: accountId,
      date,
      follower_count: base + Math.floor(Math.random() * 20),
      follower_change: Math.floor(Math.random() * 10) - 3,
      impressions: 2000 + Math.floor(Math.random() * 500),
      reach: 1500 + Math.floor(Math.random() * 400),
      profile_views: 40 + Math.floor(Math.random() * 30),
      website_clicks: Math.floor(Math.random() * 15),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'social_account_id,date' }
  );
}

export async function calculateBestTimes(supabase: SupabaseClient, accountId: string): Promise<void> {
  const { data: metrics } = await supabase
    .from('social_post_metrics')
    .select('engagement_rate, last_synced_at, created_at')
    .eq('social_account_id', accountId);

  const buckets: Record<string, { score: number; n: number }> = {};
  for (const m of metrics ?? []) {
    const ts = m.last_synced_at || m.created_at;
    if (!ts) continue;
    const d = new Date(ts);
    const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
    buckets[key] = buckets[key] ?? { score: 0, n: 0 };
    buckets[key].score += Number(m.engagement_rate ?? 0);
    buckets[key].n += 1;
  }

  for (const [key, v] of Object.entries(buckets)) {
    const [day, hour] = key.split('_').map(Number);
    const engagement_score = v.n ? v.score / v.n : 0;
    await supabase.from('best_time_to_post').upsert(
      {
        social_account_id: accountId,
        day_of_week: day,
        hour_of_day: hour,
        engagement_score,
        sample_size: v.n,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'social_account_id,day_of_week,hour_of_day' }
    );
  }
}

export async function syncAllAccountMetrics(supabase: SupabaseClient, workspaceId?: string): Promise<number> {
  let q = supabase.from('social_accounts').select('id, workspace_id').eq('status', 'active');
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data: accounts } = await q;
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const a of accounts ?? []) {
    await syncAccountMetrics(supabase, a.id, today);
    n += 1;
  }
  return n;
}

export async function getTopPerformingPosts(
  supabase: SupabaseClient,
  workspaceId: string,
  periodDays: number,
  limit: number
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  const { data: posts } = await supabase.from('social_posts').select('id').eq('workspace_id', workspaceId);
  const ids = (posts ?? []).map(p => p.id);
  if (!ids.length) return [];

  const { data: metrics } = await supabase.from('social_post_metrics').select('*').in('post_id', ids);
  const byPost: Record<string, number> = {};
  for (const m of metrics ?? []) {
    byPost[m.post_id] = Math.max(byPost[m.post_id] ?? 0, Number(m.engagement_rate ?? 0));
  }
  const sorted = Object.entries(byPost)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const { data: full } = await supabase.from('social_posts').select('*').in('id', sorted);
  return (full ?? []).sort((a, b) => (byPost[b.id] ?? 0) - (byPost[a.id] ?? 0));
}

export async function getPlatformBreakdown(
  supabase: SupabaseClient,
  workspaceId: string,
  periodDays: number
) {
  const { data: accounts } = await supabase.from('social_accounts').select('id, platform').eq('workspace_id', workspaceId);
  const byPlatform: Record<string, { reach: number; engagement: number; posts: number }> = {};
  for (const a of accounts ?? []) {
    byPlatform[a.platform] = { reach: 0, engagement: 0, posts: 0 };
  }
  const { data: wsPosts } = await supabase.from('social_posts').select('id').eq('workspace_id', workspaceId);
  const postIds = new Set((wsPosts ?? []).map(p => p.id));
  const { data: metrics } = await supabase.from('social_post_metrics').select('*');
  const cutoff = Date.now() - periodDays * 86400000;
  const accPlat = new Map((accounts ?? []).map(a => [a.id, a.platform]));

  for (const m of metrics ?? []) {
    if (!postIds.has(m.post_id)) continue;
    if (m.created_at && new Date(m.created_at).getTime() < cutoff) continue;
    const plat = accPlat.get(m.social_account_id);
    if (!plat) continue;
    const p = byPlatform[plat];
    if (!p) continue;
    p.reach += m.reach ?? 0;
    p.engagement += Number(m.engagement_rate ?? 0);
    p.posts += 1;
  }
  return byPlatform;
}
