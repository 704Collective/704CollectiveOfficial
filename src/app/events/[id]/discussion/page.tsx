'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Lock, Calendar, Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePersonId } from '@/lib/resolvePersonId';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';
import { EventDiscussionComposer, type NewDiscussionPost } from '@/components/portal/EventDiscussionComposer';
import { EventDiscussionLikeButton } from '@/components/portal/EventDiscussionLikeButton';
import { EventDiscussionComments, type DiscComment } from '@/components/portal/EventDiscussionComments';
import { EventDiscussionGallery } from '@/components/portal/EventDiscussionGallery';
import { EventMentionTextarea } from '@/components/portal/EventMentionTextarea';
import { LinkifiedText } from '@/components/ui/LinkifiedText';

const isVideoUrl = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);

interface DiscussionEvent { id: string; title: string | null; image_url: string | null; start_time: string | null; category: string | null; }
interface Author { id: string; full_name: string | null; avatar_url: string | null; }
interface DPost { id: string; author_id: string; content: string | null; image_urls: string[] | null; created_at: string; updated_at?: string | null; author: Author | null; }

// Same threshold as comments: inserts stamp both timestamps together, so only a
// meaningful gap counts as an edit.
function isPostEdited(p: DPost): boolean {
  if (!p.updated_at) return false;
  return new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 2000;
}
interface DComment { id: string; post_id: string; parent_comment_id: string | null; author_id: string; content: string; created_at: string; updated_at: string | null; author: Author | null; }
interface DLike { post_id: string | null; comment_id: string | null; user_id: string; }

type AccessState = 'loading' | 'full' | 'teaser' | 'denied';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function normalizeAuthor(row: any) {
  return { ...row, author: Array.isArray(row.author) ? (row.author[0] ?? null) : row.author };
}

export default function EventDiscussionPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.id as string) ?? '';
  const { user, profile, loading: authLoading, isAdmin } = useAuth();

  const [access, setAccess] = useState<AccessState>('loading');
  const [ev, setEv] = useState<DiscussionEvent | null>(null);
  const [going, setGoing] = useState<number>(0);
  const [posts, setPosts] = useState<DPost[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, DComment[]>>({});
  const [likes, setLikes] = useState<DLike[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostValue, setEditPostValue] = useState('');
  const [editPostSaving, setEditPostSaving] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Determine access — mirrors can_view_event_discussion exactly (active-member rule + resolvePersonId RSVP bridge).
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (!user || !profile) { if (!cancelled) setAccess('denied'); return; }
      const admin = profile.role === 'admin' || profile.role === 'super_admin';
      const mt = profile.member_type;
      const st = profile.subscription_status;
      const activeMember =
        admin ||
        ((mt === 'social' || mt === 'business') && (
          st === 'active' || st === 'paused' ||
          (st === 'canceled' && !!profile.subscription_ends_at && new Date(profile.subscription_ends_at) > new Date()) ||
          profile.membership_override === true
        ));
      if (!activeMember) { if (!cancelled) setAccess('denied'); return; }
      if (admin) { if (!cancelled) setAccess('full'); return; }
      const personId = await resolvePersonId(user.id);
      if (!personId) { if (!cancelled) setAccess('teaser'); return; }
      const { data } = await supabase
        .from('attendance_credentials')
        .select('id')
        .eq('person_id', personId)
        .eq('event_id', eventId)
        .in('credential_type', ['member', 'member_rsvp'])
        .in('status', ['active', 'used'])
        .limit(1);
      if (!cancelled) setAccess(data && data.length > 0 ? 'full' : 'teaser');
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, profile, eventId]);

  // Bounce denied users to the event page (they never learn a discussion exists).
  useEffect(() => {
    if (access === 'denied') router.replace(`/events/${eventId}`);
  }, [access, eventId, router]);

  // Header data (full + teaser).
  useEffect(() => {
    if (access !== 'full' && access !== 'teaser') return;
    let cancelled = false;
    (async () => {
      const { data: evData } = await supabase
        .from('events').select('id, title, image_url, start_time, category').eq('id', eventId).single();
      if (!cancelled && evData) setEv(evData as DiscussionEvent);
      const { data: att } = await supabase.rpc('get_event_attendees', { p_event_id: eventId });
      if (!cancelled && att) setGoing((att as any).member_count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [access, eventId]);

  // Discussion content (full only).
  useEffect(() => {
    if (access !== 'full') return;
    let cancelled = false;
    setLoadingData(true);
    (async () => {
      const [postsRes, commentsRes, likesRes] = await Promise.all([
        supabase.from('event_discussion_posts')
          .select('id, author_id, content, image_urls, created_at, updated_at, author:profiles(id, full_name, avatar_url)')
          .eq('event_id', eventId).is('deleted_at', null).order('created_at', { ascending: true }),
        supabase.from('event_discussion_comments')
          .select('id, post_id, parent_comment_id, author_id, content, created_at, updated_at, author:profiles(id, full_name, avatar_url)')
          .eq('event_id', eventId).is('deleted_at', null).order('created_at', { ascending: true }),
        supabase.from('event_discussion_likes').select('post_id, comment_id, user_id').eq('event_id', eventId),
      ]);
      if (cancelled) return;
      setPosts(((postsRes.data ?? []) as any[]).map(normalizeAuthor) as DPost[]);
      const grouped: Record<string, DComment[]> = {};
      ((commentsRes.data ?? []) as any[]).map(normalizeAuthor).forEach((c: DComment) => { (grouped[c.post_id] ??= []).push(c); });
      setCommentsByPost(grouped);
      setLikes((likesRes.data ?? []) as DLike[]);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [access, eventId]);

  const postLikeCount = (postId: string) => likes.filter(l => l.post_id === postId).length;
  const postLikedByMe = (postId: string) => !!user && likes.some(l => l.post_id === postId && l.user_id === user.id);
  const commentLikeCount = (commentId: string) => likes.filter(l => l.comment_id === commentId).length;

  const handlePosted = (post: NewDiscussionPost) => setPosts(prev => [...prev, post as unknown as typeof prev[number]]);
  const handleCommentAdded = (c: DiscComment) => setCommentsByPost(prev => ({ ...prev, [c.post_id]: [ ...(prev[c.post_id] ?? []), c as unknown as DComment ] }));
  const handleCommentUpdated = (postId: string) => (commentId: string, content: string, updatedAt: string) =>
    setCommentsByPost(prev => ({ ...prev, [postId]: (prev[postId] ?? []).map(c => c.id === commentId ? { ...c, content, updated_at: updatedAt } : c) }));
  // Soft-deleted parents take their (now orphaned) replies out of view too, matching the reload state.
  const handleCommentDeleted = (postId: string) => (commentId: string) =>
    setCommentsByPost(prev => ({ ...prev, [postId]: (prev[postId] ?? []).filter(c => c.id !== commentId && c.parent_comment_id !== commentId) }));

  const startPostEdit = (p: DPost) => { setEditingPostId(p.id); setEditPostValue(p.content ?? ''); };

  const savePostEdit = async (postId: string) => {
    const text = editPostValue.trim();
    if (!text || editPostSaving) return;
    setEditPostSaving(true);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from('event_discussion_posts')
      .update({ content: text, updated_at: updatedAt })
      .eq('id', postId);
    setEditPostSaving(false);
    if (error) { toast.error('Could not save edit: ' + error.message); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: text, updated_at: updatedAt } : p));
    setEditingPostId(null);
    setEditPostValue('');
  };

  const deletePost = async (postId: string) => {
    if (deletingPostId) return;
    if (!window.confirm('Delete this post?')) return;
    setDeletingPostId(postId);
    const { error } = await supabase
      .from('event_discussion_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', postId);
    setDeletingPostId(null);
    if (error) { toast.error('Could not delete: ' + error.message); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    // Children go with the post visually; on reload RLS hides the post anyway.
    setCommentsByPost(prev => { const next = { ...prev }; delete next[postId]; return next; });
  };

  if (access === 'loading' || authLoading) {
    return (
      <>
        <Header />
        <DashboardNav />
        <div className={cn(DASHBOARD_MAIN)}>
          <div className="max-w-[720px] mx-auto py-10 text-center text-sm text-muted-foreground">Loading…</div>
        </div>
      </>
    );
  }
  if (access === 'denied') return null;

  const dateLabel = ev?.start_time ? format(new Date(ev.start_time), 'EEEE, MMMM d') : '';

  return (
    <>
      <Header />
      <DashboardNav />
      <div className={cn(DASHBOARD_MAIN)}>
        <div className="max-w-[720px] mx-auto w-full">
          <button
            onClick={() => router.push(`/events/${eventId}`)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to event
          </button>

          {access === 'teaser' ? (
            <div className="max-w-[520px] mx-auto text-center card-elevated rounded-2xl p-11 my-10">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-amber-500">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-extrabold mb-2">This discussion is for members going to {ev?.title ?? 'this event'}</h2>
              <p className="text-sm text-muted-foreground max-w-[380px] mx-auto mb-6">
                <span className="text-amber-500 font-semibold">{going} members</span> are talking about this event. RSVP to unlock the conversation, share photos, and get updates.
              </p>
              <Button onClick={() => router.push(`/events/${eventId}`)}>RSVP — I'm going</Button>
            </div>
          ) : (
            <>
              <div className="card-elevated rounded-2xl p-4 flex items-center gap-4 mb-4">
                {ev?.image_url && (
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 relative">
                    <Image src={ev.image_url} alt="" fill className="object-cover" unoptimized sizes="64px" />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-lg font-extrabold truncate">{ev?.title} — Discussion</h1>
                  <div className="text-sm text-muted-foreground flex items-center gap-2.5 flex-wrap mt-0.5">
                    {dateLabel && <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {dateLabel}</span>}
                    <span>·</span>
                    <span>{going} going</span>
                    {isAdmin && <span className="text-[10.5px] tracking-wide uppercase text-rose-500 font-bold inline-flex items-center gap-1.5"><Lock className="w-3 h-3" /> Admin view</span>}
                  </div>
                </div>
              </div>

              <EventDiscussionComposer
                eventId={eventId}
                author={{ id: user!.id, full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null }}
                onPosted={handlePosted}
              />

              <EventDiscussionGallery eventId={eventId} userId={user!.id} isAdmin={isAdmin} />

              {loadingData ? (
                <div className="card-elevated rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading discussion…</div>
              ) : posts.length === 0 ? (
                <div className="card-elevated rounded-2xl p-12 text-center">
                  <p className="text-sm text-muted-foreground">No messages yet. This is where everyone going will talk about {ev?.title ?? 'the event'}.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {posts.map(post => {
                    const comments = commentsByPost[post.id] ?? [];
                    const imgs = (post.image_urls ?? []).filter(Boolean);
                    return (
                      <div key={post.id} className="card-elevated rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10 shrink-0">
                            <AvatarImage src={post.author?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-sm font-semibold" style={getInitialsAvatarStyle(post.author?.id ?? post.author_id, { businessPortal: false })}>
                              {initials(post.author?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">{post.author?.full_name ?? 'Member'}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                              {isPostEdited(post) && <span className="ml-1.5">(edited)</span>}
                            </p>
                          </div>
                          {(post.author_id === user!.id || isAdmin) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" aria-label="Post actions" className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[120px]">
                                <DropdownMenuItem onClick={() => startPostEdit(post)} className="gap-2 text-[13px]">
                                  <Pencil className="w-3.5 h-3.5" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void deletePost(post.id)} className="gap-2 text-[13px] text-red-500 focus:text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        {editingPostId === post.id ? (
                          <div className="mt-2 pl-[52px]">
                            <EventMentionTextarea
                              eventId={eventId}
                              value={editPostValue}
                              onChange={setEditPostValue}
                              onSubmit={() => savePostEdit(post.id)}
                              placeholder="Edit your post…"
                              className="min-h-[60px] text-sm w-full"
                              rows={2}
                            />
                            <div className="flex justify-end gap-1 mt-1.5">
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingPostId(null); setEditPostValue(''); }}>Cancel</Button>
                              <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => void savePostEdit(post.id)} disabled={!editPostValue.trim() || editPostSaving}>
                                {editPostSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          post.content && <LinkifiedText text={post.content} className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-2 pl-[52px]" />
                        )}
                        {imgs.length > 0 && (
                          <div className={`mt-3 ml-[52px] grid gap-2 max-w-[460px] ${imgs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {imgs.slice(0, 4).map((u, i) => (
                              <div key={u + i} className="rounded-xl overflow-hidden border border-border relative">
                                {isVideoUrl(u) ? (
                                  <video src={u} controls preload="metadata" playsInline className="w-full aspect-video object-cover bg-black" />
                                ) : (
                                  <div className="relative aspect-video">
                                    <Image src={u} alt="" fill className="object-cover" unoptimized sizes="230px" />
                                    {imgs.length > 4 && i === 3 && (
                                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-lg font-bold">+{imgs.length - 3}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-3 ml-[52px] text-muted-foreground">
                          <EventDiscussionLikeButton
                            eventId={eventId}
                            postId={post.id}
                            userId={user!.id}
                            initialCount={postLikeCount(post.id)}
                            initialLiked={postLikedByMe(post.id)}
                          />
                          <span className="inline-flex items-center gap-1.5 text-sm"><MessageCircle className="w-4 h-4" /> {comments.length || ''}</span>
                        </div>
                        <EventDiscussionComments
                          eventId={eventId}
                          postId={post.id}
                          comments={comments as unknown as DiscComment[]}
                          currentUser={{ id: user!.id, full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null }}
                          isAdmin={isAdmin}
                          onCommentAdded={handleCommentAdded}
                          onCommentUpdated={handleCommentUpdated(post.id)}
                          onCommentDeleted={handleCommentDeleted(post.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
