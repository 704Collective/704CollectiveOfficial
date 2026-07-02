'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { EventMentionTextarea } from './EventMentionTextarea';

export interface DiscComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
  author: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Top-level comments for a single post: renders existing comments + an always-on
// comment box with the event-scoped @ picker. (Replies to comments = later slice.)
export function EventDiscussionComments({
  eventId,
  postId,
  comments,
  currentUser,
  onCommentAdded,
}: {
  eventId: string;
  postId: string;
  comments: DiscComment[];
  currentUser: { id: string; full_name: string | null; avatar_url: string | null };
  onCommentAdded: (c: DiscComment) => void;
}) {
  const [value, setValue] = useState('');
  const [posting, setPosting] = useState(false);

  // Only top-level comments here (no parent). Replies handled in a later slice.
  const topLevel = comments.filter(c => !c.parent_comment_id);

  const submit = async () => {
    const text = value.trim();
    if (!text || posting) return;
    setPosting(true);
    const { data, error } = await supabase
      .from('event_discussion_comments')
      .insert({ event_id: eventId, post_id: postId, parent_comment_id: null, author_id: currentUser.id, content: text })
      .select('id, post_id, parent_comment_id, author_id, content, created_at')
      .single();
    setPosting(false);
    if (error || !data) {
      toast.error(error?.message || 'Could not comment. Please try again.');
      return;
    }
    onCommentAdded({ ...(data as unknown as DiscComment), author: currentUser });
    setValue('');
  };

  return (
    <div className="mt-3 ml-[52px] pl-4 border-l-2 border-border space-y-2.5">
      {topLevel.map(c => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar className="w-7 h-7 shrink-0 mt-0.5">
            <AvatarImage src={c.author?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px] font-semibold" style={getInitialsAvatarStyle(c.author?.id ?? c.author_id)}>
              {initials(c.author?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div>
              <span className="text-[13px] font-bold">{c.author?.full_name ?? 'Member'}</span>
              <span className="text-[11px] text-muted-foreground ml-2">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
            </div>
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words mt-0.5">{c.content}</p>
          </div>
        </div>
      ))}

      {/* Comment input */}
      <div className="flex gap-2.5 items-start pt-1">
        <Avatar className="w-7 h-7 shrink-0 mt-0.5">
          <AvatarImage src={currentUser.avatar_url ?? undefined} />
          <AvatarFallback className="text-[10px] font-semibold" style={getInitialsAvatarStyle(currentUser.id)}>
            {initials(currentUser.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <EventMentionTextarea
            eventId={eventId}
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="Write a comment…  @ to tag someone going"
            className="min-h-[38px] text-sm w-full"
            rows={1}
          />
          <div className="flex justify-end mt-1.5">
            <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={submit} disabled={!value.trim() || posting}>
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
