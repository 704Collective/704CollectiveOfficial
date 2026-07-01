'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EventMentionTextarea } from './EventMentionTextarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';

interface ComposerAuthor { id: string; full_name: string | null; avatar_url: string | null; }

export interface NewDiscussionPost {
  id: string;
  author_id: string;
  content: string | null;
  image_urls: string[] | null;
  created_at: string;
  author: ComposerAuthor | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function EventDiscussionComposer({
  eventId,
  author,
  onPosted,
}: {
  eventId: string;
  author: ComposerAuthor;
  onPosted: (post: NewDiscussionPost) => void;
}) {
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const text = content.trim();
    if (!text || posting) return;
    setPosting(true);
    const { data, error } = await supabase
      .from('event_discussion_posts')
      .insert({ event_id: eventId, author_id: author.id, content: text })
      .select('id, author_id, content, image_urls, created_at')
      .single();
    setPosting(false);
    if (error || !data) {
      toast.error(error?.message || 'Could not post. Please try again.');
      return;
    }
    onPosted({ ...(data as unknown as NewDiscussionPost), author });
    setContent('');
  };

  return (
    <div className="card-elevated rounded-2xl p-4 mb-4">
      <div className="flex gap-3 items-start">
        <Avatar className="w-9 h-9 shrink-0 mt-0.5">
          <AvatarImage src={author.avatar_url ?? undefined} />
          <AvatarFallback className="text-sm font-semibold" style={getInitialsAvatarStyle(author.id)}>
            {initials(author.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <EventMentionTextarea
            eventId={eventId}
            value={content}
            onChange={setContent}
            onSubmit={submit}
            placeholder="Share something with the group going…  Type @ to tag someone going. (⌘↵ to post)"
            className="min-h-[72px] text-sm w-full"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={submit} disabled={!content.trim() || posting} className="gap-1.5">
              {posting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</>) : (<><Send className="w-3.5 h-3.5" />Post</>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
