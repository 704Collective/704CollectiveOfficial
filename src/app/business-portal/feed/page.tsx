'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import {
  Heart, MessageSquare, Share2, MoreHorizontal, Send,
  Upload, X, Loader2, EyeOff, Trash2, VolumeX,
  ChevronDown, Globe, Briefcase,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface FeedPost {
  id: string;
  user_id: string;
  body: string;
  images: string[] | null;
  video_url: string | null;
  feed_type: 'business' | 'social';
  is_shadow_hidden: boolean;
  created_at: string;
  // Joined
  author_name: string;
  author_avatar: string | null;
  author_title: string | null;
  author_company: string | null;
  author_role: string;
  // Counts
  like_count: number;
  comment_count: number;
  share_count: number;
  // Current user state
  is_liked: boolean;
  is_muted: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
}

const POSTS_PER_PAGE = 10;

export default function BusinessFeedPage() {
  const { user, profile } = useAuth();
  const p = profile as any;
  const isSuperAdmin = p?.role === 'super_admin';
  const isAdmin = p?.role === 'admin' || isSuperAdmin;
  const isBusinessMember = p?.member_type === 'business' || isAdmin;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Composer
  const [composerBody, setComposerBody] = useState('');
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [composerFeedType, setComposerFeedType] = useState<'business' | 'social'>('business');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Per-post state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const [shareOpen, setShareOpen] = useState<string | null>(null);
  const [shareBody, setShareBody] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch posts ────────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async (reset = false) => {
    if (!user) return;
    const currentOffset = reset ? 0 : offset;
    if (reset) setLoading(true); else setLoadingMore(true);

    try {
      // Get muted user IDs
      const { data: mutes } = await supabase
        .from('feed_mutes')
        .select('muted_user_id')
        .eq('user_id', user.id);
      const mutedIds = new Set((mutes || []).map((m: any) => m.muted_user_id));

      // Get user likes
      const { data: likes } = await supabase
        .from('feed_likes')
        .select('post_id')
        .eq('user_id', user.id);
      const likedIds = new Set((likes || []).map((l: any) => l.post_id));

      // Fetch posts
      let query = supabase
        .from('feed_posts')
        .select(`
          id, user_id, body, images, video_url, feed_type,
          is_shadow_hidden, shadow_hidden_by, created_at,
          profiles!inner (
            full_name, avatar_url, role,
            business_profiles (title, company_name)
          )
        `)
        .eq('feed_type', 'business')
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + POSTS_PER_PAGE - 1);

      // Non-admins don't see shadow-hidden posts (except their own)
      if (!isAdmin) {
        query = query.or(`is_shadow_hidden.eq.false,user_id.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get like/comment/share counts
      const postIds = (data || []).map((p: any) => p.id);
      const [likesRes, commentsRes, sharesRes] = await Promise.all([
        postIds.length > 0 ? supabase.from('feed_likes').select('post_id').in('post_id', postIds) : { data: [] },
        postIds.length > 0 ? supabase.from('feed_comments').select('post_id').in('post_id', postIds) : { data: [] },
        postIds.length > 0 ? supabase.from('feed_shares').select('post_id').in('post_id', postIds) : { data: [] },
      ]);

      const likeCounts: Record<string, number> = {};
      const commentCounts: Record<string, number> = {};
      const shareCounts: Record<string, number> = {};
      (likesRes.data || []).forEach((l: any) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
      (commentsRes.data || []).forEach((c: any) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
      (sharesRes.data || []).forEach((s: any) => { shareCounts[s.post_id] = (shareCounts[s.post_id] || 0) + 1; });

      const formatted: FeedPost[] = (data || [])
        .filter((post: any) => !mutedIds.has(post.user_id) || post.user_id === user.id)
        .map((post: any) => {
          const bp = post.profiles?.business_profiles?.[0];
          return {
            id: post.id,
            user_id: post.user_id,
            body: post.body,
            images: post.images,
            video_url: post.video_url,
            feed_type: post.feed_type,
            is_shadow_hidden: post.is_shadow_hidden,
            created_at: post.created_at,
            author_name: post.profiles?.full_name || 'Member',
            author_avatar: post.profiles?.avatar_url || null,
            author_title: bp?.title || null,
            author_company: bp?.company_name || null,
            author_role: post.profiles?.role || 'lead',
            like_count: likeCounts[post.id] || 0,
            comment_count: commentCounts[post.id] || 0,
            share_count: shareCounts[post.id] || 0,
            is_liked: likedIds.has(post.id),
            is_muted: mutedIds.has(post.user_id),
          };
        });

      if (reset) {
        setPosts(formatted);
        setOffset(POSTS_PER_PAGE);
      } else {
        setPosts(prev => [...prev, ...formatted]);
        setOffset(prev => prev + POSTS_PER_PAGE);
      }
      setHasMore(formatted.length === POSTS_PER_PAGE);
    } catch (err: any) {
      toast.error('Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, isAdmin, offset]);

  useEffect(() => {
    fetchPosts(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Composer ───────────────────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (composerImages.length >= 4) { toast.error('Maximum 4 images per post'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploadingImage(true);
    const filename = `feed/${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('public-assets').upload(filename, file, { contentType: file.type });
    if (error) { toast.error('Upload failed'); setUploadingImage(false); return; }
    const { data } = supabase.storage.from('public-assets').getPublicUrl(filename);
    setComposerImages(prev => [...prev, data.publicUrl]);
    setUploadingImage(false);
    e.target.value = '';
  };

  const handlePost = async () => {
    if (!composerBody.trim() && composerImages.length === 0) {
      toast.error('Write something to post');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('feed_posts').insert({
        user_id: user!.id,
        body: composerBody.trim(),
        images: composerImages.length > 0 ? composerImages : null,
        feed_type: composerFeedType,
      });
      if (error) throw error;
      setComposerBody('');
      setComposerImages([]);
      toast.success('Post shared');
      fetchPosts(true);
    } catch {
      toast.error('Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Like ───────────────────────────────────────────────────────────────────
  const handleLike = async (post: FeedPost) => {
    if (!user) return;
    const optimistic = !post.is_liked;
    setPosts(prev => prev.map(p => p.id === post.id ? {
      ...p,
      is_liked: optimistic,
      like_count: optimistic ? p.like_count + 1 : p.like_count - 1,
    } : p));

    if (optimistic) {
      await supabase.from('feed_likes').insert({ post_id: post.id, user_id: user.id });
    } else {
      await supabase.from('feed_likes').delete().eq('post_id', post.id).eq('user_id', user.id);
    }
  };

  // ── Comments ───────────────────────────────────────────────────────────────
  const loadComments = async (postId: string) => {
    if (comments[postId]) return;
    const { data } = await supabase
      .from('feed_comments')
      .select(`
        id, user_id, body, created_at,
        profiles (full_name, avatar_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    setComments(prev => ({
      ...prev,
      [postId]: (data || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        body: c.body,
        created_at: c.created_at,
        author_name: c.profiles?.full_name || 'Member',
        author_avatar: c.profiles?.avatar_url || null,
      })),
    }));
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) { next.delete(postId); }
      else { next.add(postId); loadComments(postId); }
      return next;
    });
  };

  const submitComment = async (postId: string) => {
    const body = commentInputs[postId]?.trim();
    if (!body || !user) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const { data, error } = await supabase
        .from('feed_comments')
        .insert({ post_id: postId, user_id: user.id, body })
        .select(`id, user_id, body, created_at, profiles (full_name, avatar_url)`)
        .single();
      if (error) throw error;
      const newComment: Comment = {
        id: data.id,
        user_id: data.user_id,
        body: data.body,
        created_at: data.created_at,
        author_name: (data as any).profiles?.full_name || 'Member',
        author_avatar: (data as any).profiles?.avatar_url || null,
      };
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), newComment] }));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
    } catch {
      toast.error('Failed to comment');
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async (post: FeedPost, targetFeed: 'business' | 'social') => {
    if (!user) return;
    try {
      await supabase.from('feed_shares').insert({
        post_id: post.id,
        user_id: user.id,
        feed_type: targetFeed,
        body: shareBody.trim() || null,
      });
      // Create a new post as a share
      await supabase.from('feed_posts').insert({
        user_id: user.id,
        body: shareBody.trim() || `Shared a post`,
        feed_type: targetFeed,
        images: null,
      });
      toast.success(`Shared to ${targetFeed === 'business' ? 'Business' : 'Social'} feed`);
      setShareOpen(null);
      setShareBody('');
      if (targetFeed === 'business') fetchPosts(true);
    } catch {
      toast.error('Failed to share');
    }
  };

  // ── Mute ───────────────────────────────────────────────────────────────────
  const handleMute = async (post: FeedPost) => {
    if (!user) return;
    // Can't mute admins/super admins
    if (post.author_role === 'admin' || post.author_role === 'super_admin') {
      toast.error("You can't mute an admin");
      return;
    }
    await supabase.from('feed_mutes').insert({ user_id: user.id, muted_user_id: post.user_id });
    setPosts(prev => prev.filter(p => p.user_id !== post.user_id));
    toast.success(`${post.author_name} muted - you won't see their posts`);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (postId: string) => {
    await supabase.from('feed_posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast.success('Post deleted');
  };

  // ── Shadow hide (admin only) ───────────────────────────────────────────────
  const handleShadowHide = async (post: FeedPost) => {
    const newValue = !post.is_shadow_hidden;
    await supabase.from('feed_posts').update({
      is_shadow_hidden: newValue,
      shadow_hidden_by: newValue ? user!.id : null,
      shadow_hidden_at: newValue ? new Date().toISOString() : null,
    }).eq('id', post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_shadow_hidden: newValue } : p));
    toast.success(newValue ? 'Post shadow hidden' : 'Post restored');
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const currentUserAvatar = p?.avatar_url;
  const currentUserName = p?.full_name || 'You';

  if (loading) return (
    <>
      <BusinessPortalNav />
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C6A664' }} />
      </div>
    </>
  );

  return (
    <>
      <BusinessPortalNav />
      <main id="main-content" className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {/* Header */}
        <div className="mb-6">
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C6A664', marginBottom: '6px' }}>
            Business Portal
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF' }}>Business Feed</h1>
        </div>

        {/* Composer */}
        {isBusinessMember && (
          <div style={{
            backgroundColor: '#111111',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px',
            padding: '16px',
          }}>
            <div className="flex gap-3">
              {/* Avatar */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                overflow: 'hidden', position: 'relative',
                backgroundColor: 'rgba(198,166,100,0.1)',
                border: '1px solid rgba(198,166,100,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {currentUserAvatar ? (
                  <Image src={currentUserAvatar} alt={currentUserName} fill style={{ objectFit: 'cover' }} unoptimized />
                ) : (
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#C6A664' }}>
                    {getInitials(currentUserName)}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-3">
                <Textarea
                  value={composerBody}
                  onChange={e => setComposerBody(e.target.value)}
                  placeholder="Share an update with the 704 Business community..."
                  rows={3}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#FFFFFF',
                    resize: 'none',
                    fontSize: '0.9375rem',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
                  }}
                />

                {/* Image previews */}
                {composerImages.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {composerImages.map((url, i) => (
                      <div key={i} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden' }}>
                        <Image src={url} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
                        <button
                          onClick={() => setComposerImages(prev => prev.filter((_, j) => j !== i))}
                          style={{
                            position: 'absolute', top: '3px', right: '3px',
                            width: '18px', height: '18px', borderRadius: '50%',
                            backgroundColor: 'rgba(0,0,0,0.7)', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X style={{ width: '10px', height: '10px', color: '#FFFFFF' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Image upload */}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 10px', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.4)', fontSize: '0.8125rem',
                      cursor: uploadingImage ? 'wait' : 'pointer',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                    }}>
                      {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Photo
                      <input ref={fileInputRef} type="file" className="hidden"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                        onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>

                    {/* Feed type selector */}
                    <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        onClick={() => setComposerFeedType('business')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '4px 10px', borderRadius: '6px', border: 'none',
                          backgroundColor: composerFeedType === 'business' ? 'rgba(198,166,100,0.2)' : 'transparent',
                          color: composerFeedType === 'business' ? '#C6A664' : 'rgba(255,255,255,0.3)',
                          fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <Briefcase className="w-3 h-3" /> Business
                      </button>
                      <button
                        onClick={() => setComposerFeedType('social')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '4px 10px', borderRadius: '6px', border: 'none',
                          backgroundColor: composerFeedType === 'social' ? 'rgba(255,255,255,0.1)' : 'transparent',
                          color: composerFeedType === 'social' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                          fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <Globe className="w-3 h-3" /> Social
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={handlePost}
                    disabled={submitting || (!composerBody.trim() && composerImages.length === 0)}
                    style={{
                      backgroundColor: '#C6A664', color: '#1A1A1A',
                      fontWeight: 700, fontSize: '0.875rem',
                      border: 'none', borderRadius: '8px',
                      padding: '8px 16px',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1.5" />Post</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feed */}
        {posts.length === 0 && !loading && (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p style={{ color: 'rgba(255,255,255,0.3)' }}>No posts yet. Be the first to share something.</p>
          </div>
        )}

        {posts.map(post => (
          <article
            key={post.id}
            style={{
              backgroundColor: '#111111',
              border: post.is_shadow_hidden && isAdmin
                ? '1px solid rgba(239,68,68,0.3)'
                : '1px solid rgba(255,255,255,0.07)',
              borderRadius: '14px',
              overflow: 'hidden',
              opacity: post.is_shadow_hidden && !isAdmin ? 1 : 1,
            }}
          >
            {/* Shadow hidden indicator for admins */}
            {post.is_shadow_hidden && isAdmin && (
              <div style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                borderBottom: '1px solid rgba(239,68,68,0.2)',
                padding: '6px 16px',
                fontSize: '0.75rem', color: 'rgba(239,68,68,0.8)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <EyeOff className="w-3 h-3" /> Shadow hidden - only visible to admins and the author
              </div>
            )}

            {/* Post header */}
            <div style={{ padding: '16px 16px 12px' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                    overflow: 'hidden', position: 'relative',
                    backgroundColor: 'rgba(198,166,100,0.1)',
                    border: '1px solid rgba(198,166,100,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {post.author_avatar ? (
                      <Image src={post.author_avatar} alt={post.author_name} fill style={{ objectFit: 'cover' }} unoptimized />
                    ) : (
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#C6A664' }}>
                        {getInitials(post.author_name)}
                      </span>
                    )}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.9375rem', lineHeight: 1.2 }}>
                      {post.author_name}
                      {(post.author_role === 'admin' || post.author_role === 'super_admin') && (
                        <span style={{ fontSize: '0.6875rem', color: '#C6A664', marginLeft: '6px', fontWeight: 600 }}>
                          {post.author_role === 'super_admin' ? 'Founder' : 'Admin'}
                        </span>
                      )}
                    </p>
                    {(post.author_title || post.author_company) && (
                      <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>
                        {[post.author_title, post.author_company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      {post.feed_type === 'social' && (
                        <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.2)' }}>· Social feed</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Post menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(255,255,255,0.3)',
                    }}>
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* Own post or admin */}
                    {(post.user_id === user?.id || isAdmin) && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(post.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete post
                      </DropdownMenuItem>
                    )}
                    {/* Admin shadow hide */}
                    {isAdmin && post.user_id !== user?.id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleShadowHide(post)}>
                          <EyeOff className="w-4 h-4 mr-2" />
                          {post.is_shadow_hidden ? 'Restore post' : 'Shadow hide'}
                        </DropdownMenuItem>
                      </>
                    )}
                    {/* Mute (not for admins/super admins) */}
                    {post.user_id !== user?.id &&
                      post.author_role !== 'admin' &&
                      post.author_role !== 'super_admin' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleMute(post)}>
                            <VolumeX className="w-4 h-4 mr-2" /> Mute {post.author_name.split(' ')[0]}
                          </DropdownMenuItem>
                        </>
                      )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Post body */}
              <p style={{
                marginTop: '14px',
                fontSize: '0.9375rem',
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}>
                {post.body}
              </p>
            </div>

            {/* Images */}
            {post.images && post.images.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: post.images.length === 1 ? '1fr' : '1fr 1fr',
                gap: '2px',
              }}>
                {post.images.map((url, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: post.images!.length === 1 ? '16/9' : '1', overflow: 'hidden' }}>
                    <Image src={url} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {/* Like */}
              <button
                onClick={() => handleLike(post)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', borderRadius: '8px', border: 'none',
                  backgroundColor: post.is_liked ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: post.is_liked ? '#ef4444' : 'rgba(255,255,255,0.4)',
                  fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Heart className="w-4 h-4" style={{ fill: post.is_liked ? '#ef4444' : 'none' }} />
                {post.like_count > 0 && post.like_count}
              </button>

              {/* Comment */}
              <button
                onClick={() => toggleComments(post.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', borderRadius: '8px', border: 'none',
                  backgroundColor: expandedComments.has(post.id) ? 'rgba(198,166,100,0.1)' : 'transparent',
                  color: expandedComments.has(post.id) ? '#C6A664' : 'rgba(255,255,255,0.4)',
                  fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <MessageSquare className="w-4 h-4" />
                {post.comment_count > 0 && post.comment_count}
              </button>

              {/* Share */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShareOpen(shareOpen === post.id ? null : post.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '8px', border: 'none',
                    backgroundColor: shareOpen === post.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  {post.share_count > 0 && post.share_count}
                </button>

                {shareOpen === post.id && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                    width: '280px', backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                    padding: '14px', zIndex: 50,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                  }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '10px' }}>
                      Share this post
                    </p>
                    <Textarea
                      value={shareBody}
                      onChange={e => setShareBody(e.target.value)}
                      placeholder="Add a comment (optional)..."
                      rows={2}
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#FFFFFF', resize: 'none', fontSize: '0.8125rem',
                        marginBottom: '10px',
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleShare(post, 'business')}
                        style={{
                          flex: 1, padding: '7px', borderRadius: '8px',
                          backgroundColor: 'rgba(198,166,100,0.15)',
                          border: '1px solid rgba(198,166,100,0.3)',
                          color: '#C6A664', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        }}
                      >
                        <Briefcase className="w-3 h-3" /> Business
                      </button>
                      <button
                        onClick={() => handleShare(post, 'social')}
                        style={{
                          flex: 1, padding: '7px', borderRadius: '8px',
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        }}
                      >
                        <Globe className="w-3 h-3" /> Social
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comments section */}
            {expandedComments.has(post.id) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px' }}>
                {/* Comment list */}
                <div className="space-y-3 mb-3">
                  {(comments[post.id] || []).map(comment => (
                    <div key={comment.id} className="flex gap-2.5">
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        overflow: 'hidden', position: 'relative',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {comment.author_avatar ? (
                          <Image src={comment.author_avatar} alt={comment.author_name} fill style={{ objectFit: 'cover' }} unoptimized />
                        ) : (
                          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
                            {getInitials(comment.author_name)}
                          </span>
                        )}
                      </div>
                      <div style={{
                        flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
                        borderRadius: '10px', padding: '8px 12px',
                      }}>
                        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>
                          {comment.author_name}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {comment.body}
                        </p>
                        <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comment input */}
                <div className="flex gap-2.5">
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                    overflow: 'hidden', position: 'relative',
                    backgroundColor: 'rgba(198,166,100,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {currentUserAvatar ? (
                      <Image src={currentUserAvatar} alt={currentUserName} fill style={{ objectFit: 'cover' }} unoptimized />
                    ) : (
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#C6A664' }}>
                        {getInitials(currentUserName)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 flex gap-2">
                    <input
                      value={commentInputs[post.id] || ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(post.id); } }}
                      placeholder="Write a comment..."
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: '20px',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#FFFFFF', fontSize: '0.875rem', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => submitComment(post.id)}
                      disabled={!commentInputs[post.id]?.trim() || commentLoading[post.id]}
                      style={{
                        width: '34px', height: '34px', borderRadius: '50%',
                        backgroundColor: commentInputs[post.id]?.trim() ? '#C6A664' : 'rgba(255,255,255,0.08)',
                        border: 'none', cursor: commentInputs[post.id]?.trim() ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background-color 0.15s', flexShrink: 0,
                      }}
                    >
                      {commentLoading[post.id]
                        ? <Loader2 style={{ width: '14px', height: '14px', color: '#1A1A1A', animation: 'spin 1s linear infinite' }} />
                        : <Send style={{ width: '14px', height: '14px', color: commentInputs[post.id]?.trim() ? '#1A1A1A' : 'rgba(255,255,255,0.2)' }} />
                      }
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        ))}

        {/* Load more */}
        {hasMore && posts.length > 0 && (
          <div className="text-center py-4">
            <Button
              variant="outline"
              onClick={() => fetchPosts(false)}
              disabled={loadingMore}
              style={{
                borderColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'transparent',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              Load more
            </Button>
          </div>
        )}

      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}