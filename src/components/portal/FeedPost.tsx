'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import {
  Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Download, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notifyAfterFeedCommentCreated } from '@/app/actions/portalFeedNotifications';
import { cn } from '@/lib/utils';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PostAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface FeedPostData {
  id: string;
  author_id: string;
  feed_type: 'social' | 'business';
  content: string | null;
  image_urls: string[] | null;
  file_urls: string[] | null;
  file_names: string[] | null;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  deleted_at: string | null;
  author: PostAuthor | null;
  like_count: number;
  comment_count: number;
  user_has_liked: boolean;
}

interface CommentData {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: PostAuthor | null;
}

interface MentionSuggestion {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function extractMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/@(\w*)$/);
  return match ? match[1] : null;
}

function insertMention(text: string, cursorPos: number, fullName: string): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const match = before.match(/@(\w*)$/);
  if (!match) return { newText: text, newCursor: cursorPos };
  const replaced = before.slice(0, before.length - match[0].length) + `@${fullName} `;
  return { newText: replaced + after, newCursor: replaced.length };
}

// ---------------------------------------------------------------------------
// MentionTextarea — textarea with @mention autocomplete
// ---------------------------------------------------------------------------
function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  onSubmit,
  minRows = 2,
  mentionAvatarBusiness = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  minRows?: number;
  mentionAvatarBusiness?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .ilike('full_name', `%${query}%`)
      .is('deleted_at', null)
      .eq('is_internal', false)
      .limit(6);
    setSuggestions((data as MentionSuggestion[]) ?? []);
    setShowSuggestions(true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const cursor = e.target.selectionStart ?? 0;
    const q = extractMentionQuery(e.target.value, cursor);
    if (q !== null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  const pickSuggestion = (name: string) => {
    const cursor = ref.current?.selectionStart ?? value.length;
    const { newText, newCursor } = insertMention(value, cursor, name);
    onChange(newText);
    setShowSuggestions(false);
    setTimeout(() => {
      ref.current?.setSelectionRange(newCursor, newCursor);
      ref.current?.focus();
    }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className={cn('resize-none', className)}
        rows={minRows}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => pickSuggestion(s.full_name ?? '')}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
            >
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={s.avatar_url ?? undefined} />
                <AvatarFallback
                  className="text-[10px] font-semibold"
                  style={getInitialsAvatarStyle(s.id, { businessPortal: mentionAvatarBusiness })}
                >
                  {initials(s.full_name)}
                </AvatarFallback>
              </Avatar>
              <span>{s.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedPost
// ---------------------------------------------------------------------------
interface FeedPostProps {
  post: FeedPostData;
  currentUser: User | null;
  onDelete: (postId: string) => void;
  onEdit: (post: FeedPostData) => void;
}

export function FeedPost({ post, currentUser, onDelete, onEdit }: FeedPostProps) {
  const [liked, setLiked] = useState(post.user_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentsLoadedRef = useRef(false);

  const isAuthor = currentUser?.id === post.author_id;

  const loadComments = useCallback(async () => {
    if (commentsLoadedRef.current) return;
    commentsLoadedRef.current = true;
    setLoadingComments(true);
    try {
      const { data } = await supabase
        .from('post_comments')
        .select('id, post_id, author_id, content, created_at, author:profiles(id, full_name, avatar_url)')
        .eq('post_id', post.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      setComments((data ?? []) as unknown as CommentData[]);
    } finally {
      setLoadingComments(false);
    }
  }, [post.id]);

  const toggleComments = () => {
    setShowComments(p => {
      if (!p) loadComments();
      return !p;
    });
  };

  const toggleLike = async () => {
    if (!currentUser) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    if (wasLiked) {
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', currentUser.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: post.id, user_id: currentUser.id });
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || !currentUser || submittingComment) return;
    setSubmittingComment(true);
    const text = newComment.trim();
    setNewComment('');
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: post.id, author_id: currentUser.id, content: text })
      .select('id, post_id, author_id, content, created_at, author:profiles(id, full_name, avatar_url)')
      .single();
    setSubmittingComment(false);
    if (error) { toast.error('Failed to post comment'); return; }
    setComments(c => [...c, data as unknown as CommentData]);
    setCommentCount(c => c + 1);
    void notifyAfterFeedCommentCreated((data as { id: string }).id);
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from('post_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
    setComments(c => c.filter(cm => cm.id !== commentId));
    setCommentCount(c => c - 1);
  };

  const handleDeletePost = async () => {
    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', post.id);
    if (error) { toast.error('Failed to delete post'); return; }
    onDelete(post.id);
  };

  const images = post.image_urls?.filter(Boolean) ?? [];
  const files = (post.file_urls ?? []).map((url, i) => ({
    url,
    name: post.file_names?.[i] ?? `file-${i + 1}`,
  }));

  return (
    <div className={cn("card-elevated p-4 space-y-2", post.feed_type === 'business' && "border-border")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarImage src={post.author?.avatar_url ?? undefined} />
            <AvatarFallback
              className="text-sm font-semibold"
              style={getInitialsAvatarStyle(post.author?.id ?? post.author_id, {
                businessPortal: post.feed_type === 'business',
              })}
            >
              {initials(post.author?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{post.author?.full_name ?? 'Member'}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              {post.is_edited && <span className="ml-1 opacity-60">(edited)</span>}
            </p>
          </div>
        </div>
        {isAuthor && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Open post options">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(post)}>
                <Pencil className="w-4 h-4 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={handleDeletePost}>
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <LinkifiedText text={post.content} className="text-sm leading-relaxed whitespace-pre-wrap break-words" />
      )}

      {/* Images */}
      {images.length > 0 && (
        <div className={cn(
          'grid gap-1.5 rounded-xl overflow-hidden',
          images.length === 1 ? 'grid-cols-1' :
          images.length === 2 ? 'grid-cols-2' :
          images.length === 3 ? 'grid-cols-2' : 'grid-cols-2'
        )}>
          {images.slice(0, 4).map((url, i) => (
            <div
              key={i}
              className={cn(
                'relative bg-muted overflow-hidden',
                images.length === 1 ? 'aspect-video' :
                images.length === 3 && i === 0 ? 'row-span-2' : 'aspect-square'
              )}
            >
              <Image
                src={url}
                alt={`Image ${i + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 560px"
                loading="lazy"
                unoptimized
              />
              {i === 3 && images.length > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">+{images.length - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* File attachments */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              download={f.name}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors",
                post.feed_type === 'business'
                  ? "text-sm text-amber-400 hover:text-amber-300"
                  : "text-sm"
              )}
            >
              <Download className={cn("w-4 h-4 shrink-0", post.feed_type === 'business' ? "text-amber-400" : "text-muted-foreground")} />
              <span className="truncate flex-1">{f.name}</span>
            </a>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-0.5 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-1.5 h-8 px-2', liked && 'text-rose-500')}
          onClick={toggleLike}
          aria-label={liked ? `Unlike post, ${likeCount} likes` : `Like post${likeCount > 0 ? `, ${likeCount} likes` : ''}`}
        >
          <Heart className={cn('w-4 h-4', liked && 'fill-current')} aria-hidden />
          <span className="text-xs">{likeCount > 0 ? likeCount : ''}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 px-2"
          onClick={toggleComments}
          aria-label={`Comment on post${commentCount > 0 ? `, ${commentCount} comments` : ''}`}
        >
          <MessageCircle className="w-4 h-4" aria-hidden />
          <span className="text-xs">{commentCount > 0 ? commentCount : ''}</span>
        </Button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="space-y-3 pt-1 border-t border-border/50">
          {loadingComments ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No comments yet</p>
          ) : (
            <div className="space-y-2.5">
              {comments.map(comment => (
                <div key={comment.id} className="flex gap-2 group">
                  <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                    <AvatarImage src={comment.author?.avatar_url ?? undefined} />
                    <AvatarFallback
                      className="text-[10px] font-semibold"
                      style={getInitialsAvatarStyle(comment.author?.id ?? comment.author_id, {
                        businessPortal: post.feed_type === 'business',
                      })}
                    >
                      {initials(comment.author?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="bg-muted/50 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold">{comment.author?.full_name ?? 'Member'}</p>
                      <LinkifiedText text={comment.content} className="text-sm leading-relaxed whitespace-pre-wrap break-words" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 px-1">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                      {currentUser?.id === comment.author_id && (
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="text-[11px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          {currentUser && (
            <div className="flex gap-2 items-end">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback
                  className="text-[10px] font-semibold"
                  style={getInitialsAvatarStyle(currentUser.id, {
                    businessPortal: post.feed_type === 'business',
                  })}
                >
                  {initials(currentUser.user_metadata?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 relative">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  placeholder="Write a comment… (⌘↵ to post)"
                  minRows={1}
                  onSubmit={submitComment}
                  className="pr-10 text-sm"
                  mentionAvatarBusiness={post.feed_type === 'business'}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 bottom-1 h-7 w-7"
                  aria-label="Send comment"
                  onClick={submitComment}
                  disabled={!newComment.trim() || submittingComment}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
