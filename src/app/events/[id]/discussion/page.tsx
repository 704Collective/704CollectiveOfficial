'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Lock, Calendar, Heart, MessageCircle, Camera } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { resolvePersonId } from '@/lib/resolvePersonId';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';
import { EventDiscussionComposer, type NewDiscussionPost } from '@/components/portal/EventDiscussionComposer';
import { EventDiscussionLikeButton } from '@/components/portal/EventDiscussionLikeButton';
import { EventDiscussionComments, type DiscComment } from '@/components/portal/EventDiscussionComments';

interface DiscussionEvent { id: string; title: string | null; image_url: string | null; start_time: string | null; category: string | null; }
interface Author { id: string; full_name: string | null; avatar_url: string | null; }
interface DPost { id: string; author_id: string; content: string | null; image_urls: string[] | null; created_at: string; author: Author | null; }
interface DComment { id: string; post_id: string; parent_comment_id: string | null; author_id: string; content: string; created_at: string; author: Author | null; }
interface DLike { post_id: string | null; comment_id: string | null; user_id: string; }
interface DPhoto { id: string; url: string; thumbnail_url: string | null; uploader_id: string; }

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
  const [photos, setPhotos] = useState<DPhoto[]>([]);
  const [loadingData, setLoadingData] = useState(false);

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
      const [postsRes, commentsRes, likesRes, photosRes] = await Promise.all([
        supabase.from('event_discussion_posts')
          .select('id, author_id, content, image_urls, created_at, author:profiles(id, full_name, avatar_url)')
          .eq('event_id', eventId).is('deleted_at', null).order('created_at', { ascending: true }),
        supabase.from('event_discussion_comments')
          .select('id, post_id, parent_comment_id, author_id, content, created_at, author:profiles(id, full_name, avatar_url)')
          .eq('event_id', eventId).is('deleted_at', null).order('created_at', { ascending: true }),
        supabase.from('event_discussion_likes').select('post_id, comment_id, user_id').eq('event_id', eventId),
        supabase.from('event_discussion_photos')
          .select('id, url, thumbnail_url, uploader_id')
          .eq('event_id', eventId).is('deleted_at', null).order('created_at', { ascending: false }).limit(6),
      ]);
      if (cancelled) return;
      setPosts(((postsRes.data ?? []) as any[]).map(normalizeAuthor) as DPost[]);
      const grouped: Record<string, DComment[]> = {};
      ((commentsRes.data ?? []) as any[]).map(normalizeAuthor).forEach((c: DComment) => { (grouped[c.post_id] ??= []).push(c); });
      setCommentsByPost(grouped);
      setLikes((likesRes.data ?? []) as DLike[]);
      setPhotos((photosRes.data ?? []) as DPhoto[]);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [access, eventId]);

  const postLikeCount = (postId: string) => likes.filter(l => l.post_id === postId).length;
  const postLikedByMe = (postId: string) => !!user && likes.some(l => l.post_id === postId && l.user_id === user.id);
  const commentLikeCount = (commentId: string) => likes.filter(l => l.comment_id === commentId).length;

  const handlePosted = (post: NewDiscussionPost) => setPosts(prev => [...prev, post as unknown as typeof prev[number]]);
  const handleCommentAdded = (c: DiscComment) => setCommentsByPost(prev => ({ ...prev, [c.post_id]: [ ...(prev[c.post_id] ?? []), c as unknown as DComment ] }));

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

              {photos.length > 0 && (
                <div className="card-elevated rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs tracking-wide uppercase text-muted-foreground font-bold inline-flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5" /> Gallery · {photos.length} photos
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    {photos.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex-1 aspect-square rounded-lg overflow-hidden border border-border relative">
                        <Image src={p.thumbnail_url || p.url} alt="" fill className="object-cover" unoptimized sizes="120px" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
                          </div>
                        </div>
                        {post.content && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-2 pl-[52px]">{post.content}</p>}
                        {imgs.length > 0 && (
                          <div className="mt-3 ml-[52px] rounded-xl overflow-hidden border border-border max-w-[420px] relative aspect-video">
                            <Image src={imgs[0]} alt="" fill className="object-cover" unoptimized sizes="420px" />
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
                          onCommentAdded={handleCommentAdded}
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
