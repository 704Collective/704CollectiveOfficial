import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from './constants';

export interface SocialPostPayload {
  id: string;
  caption: string;
  media_urls: string[];
  link_url: string | null;
  hashtags: string[];
  first_comment: string | null;
  target_account_ids: string[];
}

export interface SocialAccountPayload {
  id: string;
  platform: string;
  access_token: string | null;
  account_id: string;
}

/** Format post body for a specific network (structure only — live APIs need app review). */
export function generatePostPayload(
  post: {
    caption: string;
    media_urls: string[];
    link_url: string | null;
    hashtags: string[];
  },
  platform: SocialPlatform
): Record<string, unknown> {
  const tags = (post.hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  switch (platform) {
    case 'instagram':
      return {
        caption: [post.caption, tags].filter(Boolean).join('\n\n'),
        media: post.media_urls?.length ? post.media_urls : [],
        note: 'Instagram requires at least one image or video via Graph API',
      };
    case 'facebook':
      return {
        message: [post.caption, tags].filter(Boolean).join('\n\n'),
        link: post.link_url ?? undefined,
      };
    case 'linkedin':
      return {
        text: [post.caption, tags].filter(Boolean).join('\n\n'),
        article: post.link_url ? { source: post.link_url } : undefined,
      };
    case 'tiktok':
      return {
        video_description: [post.caption, tags].filter(Boolean).join(' '),
        video: post.media_urls?.[0] ?? null,
        note: 'TikTok Content Posting API requires hosted video',
      };
    case 'youtube': {
      const lines = post.caption.split('\n');
      return {
        title: lines[0]?.slice(0, 100) ?? 'Untitled',
        description: post.caption,
        tags: (post.hashtags ?? []).map(h => h.replace(/^#/, '')),
      };
    }
    case 'pinterest':
      return {
        description: [post.caption, tags].filter(Boolean).join('\n'),
        link: post.link_url ?? undefined,
        image: post.media_urls?.[0] ?? null,
      };
    case 'snapchat':
      return {
        caption: post.caption,
        media: post.media_urls,
        note: 'Snap Kit / Marketing API setup required',
      };
    case 'twitter':
    default:
      return {
        text: [post.caption, tags].filter(Boolean).join(' ').slice(0, 280),
        media_ids: post.media_urls,
      };
  }
}

async function publishToInstagram(
  post: SocialPostPayload,
  account: SocialAccountPayload
): Promise<{ ok: boolean; platform_post_id: string; note: string }> {
  const payload = generatePostPayload(post, 'instagram');
  console.log('[social] Instagram publish (placeholder)', { account: account.account_id, payload });
  return {
    ok: true,
    platform_post_id: `ig_mock_${post.id}_${account.id}`,
    note: 'Instagram publishing requires Meta Graph API app review. Prepare post payload: caption, media_url, scheduled publishing.',
  };
}

async function publishToFacebook(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'facebook');
  console.log('[social] Facebook publish (placeholder)', { account: account.account_id, payload });
  return {
    ok: true,
    platform_post_id: `fb_mock_${post.id}_${account.id}`,
    note: 'Facebook publishing requires Meta Marketing API / pages setup.',
  };
}

async function publishToLinkedIn(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'linkedin');
  console.log('[social] LinkedIn publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `li_mock_${post.id}_${account.id}`,
    note: 'LinkedIn Community Management API / OAuth required for company pages.',
  };
}

async function publishToTikTok(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'tiktok');
  console.log('[social] TikTok publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `tt_mock_${post.id}_${account.id}`,
    note: 'TikTok Content Posting API and business account required.',
  };
}

async function publishToYouTube(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'youtube');
  console.log('[social] YouTube publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `yt_mock_${post.id}_${account.id}`,
    note: 'YouTube Data API v3 upload flow required.',
  };
}

async function publishToPinterest(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'pinterest');
  console.log('[social] Pinterest publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `pin_mock_${post.id}_${account.id}`,
    note: 'Pinterest API app approval required.',
  };
}

async function publishToSnapchat(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'snapchat');
  console.log('[social] Snapchat publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `snap_mock_${post.id}_${account.id}`,
    note: 'Snap Kit developer account and creative specs required.',
  };
}

async function publishToTwitter(post: SocialPostPayload, account: SocialAccountPayload) {
  const payload = generatePostPayload(post, 'twitter');
  console.log('[social] X/Twitter publish (placeholder)', payload);
  return {
    ok: true,
    platform_post_id: `x_mock_${post.id}_${account.id}`,
    note: 'X API v2 credentials and tier limits apply.',
  };
}

const PUBLISHERS: Record<
  string,
  (post: SocialPostPayload, account: SocialAccountPayload) => Promise<{ ok: boolean; platform_post_id: string; note?: string }>
> = {
  instagram: publishToInstagram,
  facebook: publishToFacebook,
  linkedin: publishToLinkedIn,
  tiktok: publishToTikTok,
  youtube: publishToYouTube,
  pinterest: publishToPinterest,
  snapchat: publishToSnapchat,
  twitter: publishToTwitter,
};

export async function postFirstComment(
  platformPostId: string,
  comment: string,
  account: SocialAccountPayload
): Promise<void> {
  console.log('[social] Instagram first comment (placeholder)', { platformPostId, account: account.account_id, comment });
}

export async function publishPost(supabase: SupabaseClient, postId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: post, error: pe } = await supabase.from('social_posts').select('*').eq('id', postId).single();
  if (pe || !post) return { ok: false, error: pe?.message ?? 'Post not found' };

  const ids = (post.target_account_ids as string[]) ?? [];
  if (!ids.length) return { ok: false, error: 'No target accounts' };

  const { data: accounts, error: ae } = await supabase.from('social_accounts').select('*').in('id', ids);
  if (ae || !accounts?.length) return { ok: false, error: ae?.message ?? 'Accounts not found' };

  const platformPostIds: Record<string, string> = { ...(post.platform_post_ids as Record<string, string>) };

  for (const acc of accounts) {
    const pub = PUBLISHERS[acc.platform];
    if (!pub) continue;
    const payload: SocialPostPayload = {
      id: post.id,
      caption: post.caption,
      media_urls: post.media_urls ?? [],
      link_url: post.link_url,
      hashtags: post.hashtags ?? [],
      first_comment: post.first_comment,
      target_account_ids: ids,
    };
    const accountPayload: SocialAccountPayload = {
      id: acc.id,
      platform: acc.platform,
      access_token: acc.access_token,
      account_id: acc.account_id,
    };
    const res = await pub(payload, accountPayload);
    if (res.ok) platformPostIds[acc.id] = res.platform_post_id;
    if (acc.platform === 'instagram' && post.first_comment?.trim() && res.platform_post_id) {
      await postFirstComment(res.platform_post_id, post.first_comment, accountPayload);
    }
  }

  const { error: ue } = await supabase
    .from('social_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      platform_post_ids: platformPostIds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  if (ue) return { ok: false, error: ue.message };
  console.log('[social] Activity: post published', postId);
  return { ok: true };
}

export async function processScheduledPosts(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('social_posts')
    .select('id')
    .eq('status', 'scheduled')
    .eq('approval_status', 'approved')
    .lte('scheduled_at', now);

  if (error) {
    console.error('[social] processScheduledPosts', error.message);
    return 0;
  }

  let n = 0;
  for (const row of due ?? []) {
    const r = await publishPost(supabase, row.id);
    if (r.ok) n += 1;
  }
  return n;
}
