'use server';

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
const DASHBOARD_URL = `${SITE_ORIGIN}/dashboard`;

async function sendFeedMentionEmail(to: string, data: { name: string; mentionerName: string }) {
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to,
        template: 'feed-mention',
        data: {
          name: data.name,
          mentionerName: data.mentionerName,
          dashboardUrl: DASHBOARD_URL,
        },
      }),
    });
  } catch {
    // non-fatal
  }
}

async function findMentionedProfiles(
  admin: ReturnType<typeof serviceClient>,
  content: string
): Promise<{ id: string; full_name: string }[]> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .not('full_name', 'is', null)
    .is('deleted_at', null);

  if (!profiles?.length) return [];

  const sorted = [...profiles]
    .filter((p): p is { id: string; full_name: string } => Boolean(p.full_name?.trim()))
    .sort((a, b) => b.full_name.length - a.full_name.length);

  const found: { id: string; full_name: string }[] = [];
  const seen = new Set<string>();

  for (const p of sorted) {
    const name = p.full_name.trim();
    const needle = `@${name}`;
    let idx = content.indexOf(needle);
    while (idx !== -1) {
      const after = content[idx + needle.length];
      if (after === undefined || /\s/.test(after) || /[.,;:!?)]/.test(after)) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          found.push({ id: p.id, full_name: name });
        }
        break;
      }
      idx = content.indexOf(needle, idx + 1);
    }
  }

  return found;
}

function feedPath(feedType: string): string {
  return feedType === 'business' ? '/dashboard/business-feed' : '/dashboard/social-feed';
}

export async function notifyAfterFeedPostCreated(postId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = serviceClient();
  const { data: post } = await admin
    .from('posts')
    .select('author_id, feed_type, content')
    .eq('id', postId)
    .maybeSingle();

  if (!post || post.author_id !== user.id) return;

  const content = post.content ?? '';
  const feedType = post.feed_type as 'social' | 'business';

  const { data: authorProf } = await admin.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
  const authorName = authorProf?.full_name?.trim() || 'Someone';
  const isAdminPost =
    authorProf?.role === 'admin' || authorProf?.role === 'super_admin';

  // Mentions
  const mentioned = await findMentionedProfiles(admin, content);
  const mentionTargets = mentioned.filter((m) => m.id !== user.id);

  if (mentionTargets.length) {
    const rows = mentionTargets.map((m) => ({
      post_id: postId,
      mentioned_user_id: m.id,
      comment_id: null as string | null,
    }));
    await admin.from('post_mentions').insert(rows);

    const actionUrl = `${feedPath(feedType)}?post=${postId}`;
    const notifRows = mentionTargets.map((m) => ({
      user_id: m.id,
      notification_type: 'mention',
      action_url: actionUrl,
      message: `${authorName} mentioned you in a post`,
    }));

    for (const batch of chunk(notifRows, 100)) {
      await admin.from('notifications').insert(batch);
    }

    const emails = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in(
        'id',
        mentionTargets.map((m) => m.id)
      );

    for (const r of emails.data ?? []) {
      if (!r.email) continue;
      await sendFeedMentionEmail(r.email, {
        name: r.full_name?.trim() || 'Member',
        mentionerName: authorName,
      });
    }
  }

  // Admin / super_admin new post → feed-wide notifications (no email)
  if (!isAdminPost) return;

  const baseRecipients = admin
    .from('profiles')
    .select('id')
    .is('deleted_at', null)
    .neq('id', user.id)
    .or('subscription_status.eq.active,subscription_status.eq.trialing,membership_override.eq.true');

  const { data: recipients } =
    feedType === 'social'
      ? await baseRecipients.in('member_type', ['social', 'business'])
      : await baseRecipients.eq('member_type', 'business');
  const ids = (recipients ?? []).map((r) => r.id).filter(Boolean);
  if (!ids.length) return;

  const actionUrl = feedType === 'social' ? '/dashboard/social-feed' : '/dashboard/business-feed';
  const message =
    feedType === 'social'
      ? 'New announcement on the Social Feed'
      : 'New post on the Business Feed';

  const notifRows = ids.map((uid) => ({
    user_id: uid,
    notification_type: 'new_post',
    action_url: actionUrl,
    message,
  }));

  for (const batch of chunk(notifRows, 100)) {
    await admin.from('notifications').insert(batch);
  }
}

export async function notifyAfterFeedCommentCreated(commentId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = serviceClient();
  const { data: comment } = await admin
    .from('post_comments')
    .select('post_id, author_id, content')
    .eq('id', commentId)
    .maybeSingle();

  if (!comment || comment.author_id !== user.id) return;

  const { data: post } = await admin
    .from('posts')
    .select('feed_type')
    .eq('id', comment.post_id)
    .maybeSingle();

  if (!post) return;

  const content = comment.content ?? '';
  const feedType = post.feed_type as string;

  const { data: authorProf } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const authorName = authorProf?.full_name?.trim() || 'Someone';

  const mentioned = await findMentionedProfiles(admin, content);
  const mentionTargets = mentioned.filter((m) => m.id !== user.id);

  if (!mentionTargets.length) return;

  const rows = mentionTargets.map((m) => ({
    post_id: comment.post_id,
    mentioned_user_id: m.id,
    comment_id: commentId,
  }));
  await admin.from('post_mentions').insert(rows);

  const actionUrl = `${feedPath(feedType)}?post=${comment.post_id}`;
  const notifRows = mentionTargets.map((m) => ({
    user_id: m.id,
    notification_type: 'mention',
    action_url: actionUrl,
    message: `${authorName} mentioned you in a comment`,
  }));

  for (const batch of chunk(notifRows, 100)) {
    await admin.from('notifications').insert(batch);
  }

  const emails = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in(
      'id',
      mentionTargets.map((m) => m.id)
    );

  for (const r of emails.data ?? []) {
    if (!r.email) continue;
    await sendFeedMentionEmail(r.email, {
      name: r.full_name?.trim() || 'Member',
      mentionerName: authorName,
    });
  }
}

export async function notifyAfterHubPostCreated(hubPostId: string, hubId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = serviceClient();
  const { data: hp } = await admin
    .from('hub_posts')
    .select('author_id, hub_id')
    .eq('id', hubPostId)
    .maybeSingle();

  if (!hp || hp.author_id !== user.id || hp.hub_id !== hubId) return;

  const { data: hub } = await admin.from('hubs').select('title').eq('id', hubId).maybeSingle();

  const { data: members } = await admin.from('hub_members').select('user_id').eq('hub_id', hubId);

  const targets = (members ?? []).map((m) => m.user_id).filter((id) => id && id !== user.id);
  if (!targets.length) return;

  const title = hub?.title?.trim();
  const message = title ? `New activity in ${title}` : 'New post in a hub you belong to';

  const notifRows = targets.map((uid) => ({
    user_id: uid,
    notification_type: 'hub_post',
    action_url: `/dashboard/hubs/${hubId}`,
    message,
  }));

  for (const batch of chunk(notifRows, 100)) {
    await admin.from('notifications').insert(batch);
  }
}
