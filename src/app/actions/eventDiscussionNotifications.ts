'use server';

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Bell-only notifications for event discussions. NEVER sends email (locked rule:
// the only email this feature ever sends is the one-time "discussion opened" email).
// Pings: @mentions (post or comment) and replies (to the parent comment's author).

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

// Find @mentions in content, but ONLY among people eligible for THIS event's
// discussion (mirrors search_event_discussion_mentionables: active member/admin + RSVP'd).
async function findEventMentioned(
  admin: ReturnType<typeof serviceClient>,
  eventId: string,
  content: string
): Promise<{ id: string; full_name: string }[]> {
  const { data: eligible } = await admin.rpc('get_event_discussion_mentionable_ids', {
    p_event_id: eventId,
  });
  const rows = (eligible as { id: string; full_name: string | null }[] | null) ?? [];
  const sorted = rows
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
        if (!seen.has(p.id)) { seen.add(p.id); found.push({ id: p.id, full_name: name }); }
        break;
      }
      idx = content.indexOf(needle, idx + 1);
    }
  }
  return found;
}

async function insertBells(
  admin: ReturnType<typeof serviceClient>,
  rows: { user_id: string; type: string; title: string; notification_type: string; action_url: string; message: string }[]
) {
  for (const batch of chunk(rows, 100)) {
    await admin.from('notifications').insert(batch);
  }
}

// After a discussion POST is created: bell the @mentioned (bell only, no email).
export async function notifyAfterDiscussionPostCreated(postId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const admin = serviceClient();

  const { data: post } = await admin
    .from('event_discussion_posts')
    .select('event_id, author_id, content')
    .eq('id', postId)
    .maybeSingle();
  if (!post || post.author_id !== user.id) return;

  const content = post.content ?? '';
  if (!content.includes('@')) return;

  const { data: authorProf } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const authorName = authorProf?.full_name?.trim() || 'Someone';

  const mentioned = await findEventMentioned(admin, post.event_id, content);
  const targets = mentioned.filter(m => m.id !== user.id);
  if (!targets.length) return;

  await admin.from('event_discussion_mentions').insert(
    targets.map(m => ({ event_id: post.event_id, post_id: postId, comment_id: null, mentioned_user_id: m.id, mentioned_by_id: user.id }))
  );

  const actionUrl = `/events/${post.event_id}/discussion`;
  await insertBells(admin, targets.map(m => ({
    user_id: m.id,
    type: 'mention',
    title: 'Mentioned in event discussion',
    notification_type: 'mention',
    action_url: actionUrl,
    message: `${authorName} mentioned you in an event discussion`,
  })));
}

// After a discussion COMMENT/REPLY is created: bell the @mentioned + (if a reply)
// bell the parent comment's author. Bell only, no email.
export async function notifyAfterDiscussionCommentCreated(commentId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const admin = serviceClient();

  const { data: comment } = await admin
    .from('event_discussion_comments')
    .select('event_id, post_id, parent_comment_id, author_id, content')
    .eq('id', commentId)
    .maybeSingle();
  if (!comment || comment.author_id !== user.id) return;

  const content = comment.content ?? '';
  const { data: authorProf } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const authorName = authorProf?.full_name?.trim() || 'Someone';
  const actionUrl = `/events/${comment.event_id}/discussion`;

  const bellRows: { user_id: string; type: string; title: string; notification_type: string; action_url: string; message: string }[] = [];
  const belled = new Set<string>();

  // Mentions
  if (content.includes('@')) {
    const mentioned = await findEventMentioned(admin, comment.event_id, content);
    const targets = mentioned.filter(m => m.id !== user.id);
    if (targets.length) {
      await admin.from('event_discussion_mentions').insert(
        targets.map(m => ({ event_id: comment.event_id, post_id: comment.post_id, comment_id: commentId, mentioned_user_id: m.id, mentioned_by_id: user.id }))
      );
      for (const m of targets) {
        if (!belled.has(m.id)) {
          belled.add(m.id);
          bellRows.push({ user_id: m.id, type: 'mention', title: 'Mentioned in event discussion', notification_type: 'mention', action_url: actionUrl, message: `${authorName} mentioned you in an event discussion` });
        }
      }
    }
  }

  // Reply -> bell the parent comment's author (skip self, skip if already belled via mention)
  if (comment.parent_comment_id) {
    const { data: parent } = await admin
      .from('event_discussion_comments')
      .select('author_id')
      .eq('id', comment.parent_comment_id)
      .maybeSingle();
    const parentAuthor = parent?.author_id;
    if (parentAuthor && parentAuthor !== user.id && !belled.has(parentAuthor)) {
      belled.add(parentAuthor);
      bellRows.push({ user_id: parentAuthor, type: 'discussion_reply', title: 'New reply in event discussion', notification_type: 'discussion_reply', action_url: actionUrl, message: `${authorName} replied to your comment in an event discussion` });
    }
  }

  if (bellRows.length) await insertBells(admin, bellRows);
}
