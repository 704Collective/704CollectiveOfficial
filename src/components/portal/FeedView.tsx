'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedPost, type FeedPostData } from './FeedPost';
import { CreatePost } from './CreatePost';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { PostAuthor } from './FeedPost';

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

async function fetchPostsPage(feedType: 'social' | 'business', userId: string, cursor?: string): Promise<FeedPostData[]> {
  let query = supabase
    .from('posts')
    .select(`
      id, author_id, feed_type, content, image_urls, file_urls, file_names,
      is_edited, edited_at, created_at, deleted_at,
      author:profiles!posts_author_id_fkey(id, full_name, avatar_url),
      like_count:post_likes(count),
      comment_count:post_comments(count),
      user_has_liked:post_likes!inner(user_id)
    `)
    .eq('feed_type', feedType)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Normalise Supabase aggregate shapes
  return ((data ?? []) as any[]).map(row => ({
    ...row,
    author: Array.isArray(row.author) ? row.author[0] ?? null : row.author,
    like_count: Array.isArray(row.like_count) ? (row.like_count[0] as any)?.count ?? 0 : 0,
    comment_count: Array.isArray(row.comment_count) ? (row.comment_count[0] as any)?.count ?? 0 : 0,
    user_has_liked: Array.isArray(row.user_has_liked)
      ? row.user_has_liked.some((l: any) => l.user_id === userId)
      : false,
  })) as FeedPostData[];
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------
function PostSkeleton() {
  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedView
// ---------------------------------------------------------------------------
interface FeedViewProps {
  feedType: 'social' | 'business';
  currentUser: User;
  currentProfile: PostAuthor | null;
}

export function FeedView({ feedType, currentUser, currentProfile }: FeedViewProps) {
  const queryClient = useQueryClient();
  const queryKey = ['feed', feedType, currentUser.id];
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPostsPage(feedType, currentUser.id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
    staleTime: 60_000,
  });

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handlePostCreated = useCallback((newPost: FeedPostData) => {
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: [[newPost, ...(old.pages[0] ?? [])], ...old.pages.slice(1)],
      };
    });
  }, [queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback((postId: string) => {
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: FeedPostData[]) => page.filter(p => p.id !== postId)),
      };
    });
  }, [queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = useCallback(async (post: FeedPostData) => {
    const newContent = window.prompt('Edit post:', post.content ?? '');
    if (newContent === null || newContent === post.content) return;
    const { error } = await supabase
      .from('posts')
      .update({ content: newContent, is_edited: true, edited_at: new Date().toISOString() })
      .eq('id', post.id);
    if (!error) {
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: FeedPostData[]) =>
            page.map(p => p.id === post.id ? { ...p, content: newContent, is_edited: true } : p)
          ),
        };
      });
    }
  }, [queryClient, queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const allPosts = data?.pages.flat() ?? [];

  return (
    <div className="space-y-4 w-full min-w-0">
      <CreatePost
        feedType={feedType}
        currentUser={currentUser}
        currentProfile={currentProfile}
        onPostCreated={handlePostCreated}
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load posts. Please try again.</p>
        </div>
      ) : allPosts.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {feedType === 'social'
              ? 'No posts yet. Be the first to share something!'
              : 'No business posts yet. Share an update or insight!'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {allPosts.map(post => (
              <FeedPost
                key={post.id}
                post={post}
                currentUser={currentUser}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {isFetchingNextPage && (
            <div className="space-y-4">
              <PostSkeleton />
              <PostSkeleton />
            </div>
          )}

          {!hasNextPage && allPosts.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">You're all caught up</p>
          )}
        </>
      )}
    </div>
  );
}
