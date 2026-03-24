'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ModerationPost {
  id: string;
  feed_type: 'social' | 'business';
  content: string | null;
  created_at: string;
  author: { full_name: string | null } | null;
}

interface AdminFeedModerationTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminFeedModerationTab({ onNavigateToDashboard }: AdminFeedModerationTabProps) {
  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('id, feed_type, content, created_at, author:profiles!posts_author_id_fkey(full_name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      toast.error('Failed to load posts');
      setPosts([]);
    } else {
      setPosts(
        (data ?? []).map((row) => ({
          ...row,
          author: Array.isArray(row.author) ? row.author[0] ?? null : row.author,
        })) as ModerationPost[]
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const softDelete = async (post: ModerationPost) => {
    setDeletingId(post.id);
    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', post.id);
    setDeletingId(null);
    if (error) {
      toast.error('Could not delete post');
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    toast.success('Post removed from feeds');
  };

  return (
    <div className="animate-in fade-in-0 duration-200 space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onNavigateToDashboard}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Feed moderation</h2>
          <p className="text-sm text-muted-foreground">
            Recent social and business posts. Delete removes a post from member feeds (soft delete).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No active posts to show.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-xl border border-border bg-card"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={post.feed_type === 'business' ? 'default' : 'secondary'} className="text-xs">
                    {post.feed_type === 'business' ? 'Business' : 'Social'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {post.author?.full_name ?? 'Member'} ·{' '}
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap break-words">
                  {post.content?.trim() || '—'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={deletingId === post.id}
                onClick={() => void softDelete(post)}
              >
                {deletingId === post.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
