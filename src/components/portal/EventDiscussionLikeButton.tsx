'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// Toggle like for a discussion POST. RLS enforces eligibility (insert) and
// own-like-only (delete); this component just reflects + flips state.
export function EventDiscussionLikeButton({
  eventId,
  postId,
  userId,
  initialCount,
  initialLiked,
}: {
  eventId: string;
  postId: string;
  userId: string;
  initialCount: number;
  initialLiked: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    // optimistic
    setLiked(!wasLiked);
    setCount(c => (wasLiked ? Math.max(0, c - 1) : c + 1));
    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('event_discussion_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('event_discussion_likes')
          .insert({ event_id: eventId, post_id: postId, user_id: userId });
        if (error) throw error;
      }
    } catch {
      // revert on failure
      setLiked(wasLiked);
      setCount(c => (wasLiked ? c + 1 : Math.max(0, c - 1)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={liked ? `Unlike, ${count} likes` : `Like${count > 0 ? `, ${count} likes` : ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm transition-colors',
        liked ? 'text-rose-500' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Heart className={cn('w-4 h-4', liked && 'fill-rose-500')} />
      {count > 0 ? count : ''}
    </button>
  );
}
