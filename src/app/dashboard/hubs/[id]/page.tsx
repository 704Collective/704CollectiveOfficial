'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notifyAfterHubPostCreated } from '@/app/actions/portalFeedNotifications';
import {
  ChevronLeft, Users, FileText, MessageSquare, Pencil, Trash2, Download,
  Upload, Heart, Send, Loader2, X, Paperclip, Plus,
} from 'lucide-react';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────

interface HubDetail {
  id: string;
  title: string;
  description: string | null;
  header_image_url: string | null;
  created_by: string;
  created_at: string;
}

interface HubMember {
  user_id: string;
  joined_at: string;
  profile: { id: string; full_name: string; avatar_url: string | null; title: string | null; company: string | null } | null;
}

interface HubPost {
  id: string;
  hub_id: string;
  author_id: string;
  content: string | null;
  image_urls: string[] | null;
  file_urls: string[] | null;
  file_names: string[] | null;
  is_edited: boolean;
  created_at: string;
  deleted_at: string | null;
  author: { id: string; full_name: string; avatar_url: string | null } | null;
  like_count: number;
  user_has_liked: boolean;
  comment_count: number;
}

interface HubResource {
  id: string;
  hub_id: string;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
  uploader: { full_name: string; avatar_url: string | null } | null;
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Feed Tab ──────────────────────────────────────────────────────────────

function HubFeedPost({
  post,
  currentUserId,
  isAdmin,
  onDeleted,
}: {
  post: HubPost;
  currentUserId: string;
  isAdmin: boolean;
  onDeleted: (id: string) => void;
}) {
  const [liked, setLiked] = useState(post.user_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: string; content: string; created_at: string; author: { full_name: string; avatar_url: string | null } | null }[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const toggleLike = async () => {
    if (liked) {
      await supabase.from('hub_post_likes').delete().eq('hub_post_id', post.id).eq('user_id', currentUserId);
      setLiked(false); setLikeCount((n) => n - 1);
    } else {
      await supabase.from('hub_post_likes').insert({ hub_post_id: post.id, user_id: currentUserId });
      setLiked(true); setLikeCount((n) => n + 1);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    const { data } = await supabase
      .from('hub_post_comments')
      .select('id, content, created_at, author:profiles(full_name, avatar_url)')
      .eq('hub_post_id', post.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    setComments((data ?? []) as unknown as typeof comments);
    setLoadingComments(false);
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0) loadComments();
    setShowComments((v) => !v);
  };

  const submitComment = async () => {
    if (!commentDraft.trim()) return;
    setSendingComment(true);
    const { data } = await supabase
      .from('hub_post_comments')
      .insert({ hub_post_id: post.id, author_id: currentUserId, content: commentDraft.trim() })
      .select('id, content, created_at, author:profiles(full_name, avatar_url)')
      .single();
    if (data) setComments((prev) => [...prev, data as unknown as typeof comments[0]]);
    setCommentDraft('');
    setSendingComment(false);
  };

  const deletePost = async () => {
    await supabase.from('hub_posts').update({ deleted_at: new Date().toISOString() }).eq('id', post.id);
    onDeleted(post.id);
    toast.success('Post deleted');
  };

  if (post.deleted_at) return null;

  return (
    <div className="bg-[#2E2E2E] border border-white/10 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-[#1A1A1A] text-[#D4A853] text-xs">
              {initials(post.author?.full_name || '?')}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-white leading-tight">{post.author?.full_name}</p>
            <p className="text-xs text-white/40">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              {post.is_edited && <span className="ml-1">(edited)</span>}
            </p>
          </div>
        </div>
        {(post.author_id === currentUserId || isAdmin) && (
          <button onClick={deletePost} className="text-white/30 hover:text-red-400 transition-colors p-1">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {post.content && <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed mb-3">{post.content}</p>}

      {/* Images */}
      {post.image_urls && post.image_urls.length > 0 && (
        <div className={`grid gap-1 mb-3 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.image_urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="rounded-lg w-full object-cover max-h-64" />
            </a>
          ))}
        </div>
      )}

      {/* Files */}
      {post.file_urls && post.file_urls.length > 0 && (
        <div className="space-y-1 mb-3">
          {post.file_urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[#D4A853] hover:underline">
              <Paperclip className="h-3 w-3" />
              {post.file_names?.[i] || 'File'}
            </a>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-white/5">
        <button onClick={toggleLike} className={`flex items-center gap-1.5 text-xs transition-colors ${liked ? 'text-red-400' : 'text-white/40 hover:text-white/70'}`}>
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
          {likeCount}
        </button>
        <button onClick={toggleComments} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <MessageSquare className="h-4 w-4" />
          {post.comment_count + comments.length - (post.comment_count > 0 ? 0 : 0)}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
          {loadingComments ? (
            <Loader2 className="h-4 w-4 animate-spin text-white/30 mx-auto" />
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  <AvatarImage src={c.author?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-[#1A1A1A] text-[#D4A853] text-[9px]">
                    {initials(c.author?.full_name || '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="bg-[#1A1A1A] rounded-lg px-2.5 py-1.5 flex-1">
                  <p className="text-xs font-medium text-white/70">{c.author?.full_name}</p>
                  <p className="text-xs text-white/60 mt-0.5">{c.content}</p>
                </div>
              </div>
            ))
          )}
          <div className="flex gap-2 mt-2">
            <Input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment(); } }}
              placeholder="Write a comment…"
              className="bg-[#1A1A1A] border-white/10 text-white text-xs placeholder:text-white/30 h-8"
            />
            <Button size="sm" onClick={submitComment} disabled={!commentDraft.trim() || sendingComment}
              className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] h-8 px-2">
              {sendingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HubFeedTab({ hubId, currentUserId, isAdmin }: { hubId: string; currentUserId: string; isAdmin: boolean }) {
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hub_posts')
      .select('*, author:profiles(id, full_name, avatar_url)')
      .eq('hub_id', hubId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!data) { setLoading(false); return; }

    const postIds = data.map((p) => p.id);
    const [likesRes, commentsRes, userLikesRes] = await Promise.all([
      supabase.from('hub_post_likes').select('hub_post_id').in('hub_post_id', postIds),
      supabase.from('hub_post_comments').select('hub_post_id').in('hub_post_id', postIds).is('deleted_at', null),
      supabase.from('hub_post_likes').select('hub_post_id').in('hub_post_id', postIds).eq('user_id', currentUserId),
    ]);

    const likeMap: Record<string, number> = {};
    const commentMap: Record<string, number> = {};
    const userLikeSet = new Set((userLikesRes.data ?? []).map((l) => l.hub_post_id));

    (likesRes.data ?? []).forEach((l) => { likeMap[l.hub_post_id] = (likeMap[l.hub_post_id] ?? 0) + 1; });
    (commentsRes.data ?? []).forEach((c) => { commentMap[c.hub_post_id] = (commentMap[c.hub_post_id] ?? 0) + 1; });

    setPosts(data.map((p) => ({
      ...p,
      author: p.author as HubPost['author'],
      like_count: likeMap[p.id] ?? 0,
      comment_count: commentMap[p.id] ?? 0,
      user_has_liked: userLikeSet.has(p.id),
    })));
    setLoading(false);
  }, [hubId, currentUserId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const createPost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    const { data } = await supabase
      .from('hub_posts')
      .insert({ hub_id: hubId, author_id: currentUserId, content: draft.trim() })
      .select('*, author:profiles(id, full_name, avatar_url)')
      .single();
    if (data) {
      void notifyAfterHubPostCreated(data.id, hubId);
      setPosts((prev) => [{ ...data, author: data.author as HubPost['author'], like_count: 0, comment_count: 0, user_has_liked: false }, ...prev]);
    }
    setDraft('');
    setPosting(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4);
    if (!files.length) return;
    setUploadingImages(true);
    const urls: string[] = [];
    for (const file of files) {
      const path = `hub-posts/${hubId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('portal-media').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('portal-media').getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    if (urls.length) {
      const { data } = await supabase
        .from('hub_posts')
        .insert({ hub_id: hubId, author_id: currentUserId, image_urls: urls })
        .select('*, author:profiles(id, full_name, avatar_url)')
        .single();
      if (data) {
        void notifyAfterHubPostCreated(data.id, hubId);
        setPosts((prev) => [{ ...data, author: data.author as HubPost['author'], like_count: 0, comment_count: 0, user_has_liked: false }, ...prev]);
      }
    }
    setUploadingImages(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="bg-[#2E2E2E] border border-white/10 rounded-xl p-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) createPost(); }}
          placeholder="Share something with this hub…"
          rows={3}
          className="bg-[#1A1A1A] border-white/10 text-white text-sm placeholder:text-white/30 resize-none focus-visible:ring-[#D4A853]/50"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImages}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded hover:bg-white/5">
              {uploadingImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Image
            </button>
          </div>
          <Button size="sm" onClick={createPost} disabled={!draft.trim() || posting}
            className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold text-xs h-8 px-4">
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Post'}
          </Button>
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl bg-[#2E2E2E]" />)
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">No posts yet. Be the first to share!</div>
      ) : (
        posts.map((post) => (
          <HubFeedPost
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))
      )}
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────

function HubMembersTab({ hubId, isAdmin }: { hubId: string; isAdmin: boolean }) {
  const [members, setMembers] = useState<HubMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('hub_members')
      .select('user_id, joined_at, profile:profiles(id, full_name, avatar_url, title, company)')
      .eq('hub_id', hubId)
      .order('joined_at', { ascending: true });
    setMembers((data ?? []) as unknown as HubMember[]);
    setLoading(false);
  }, [hubId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const removeMember = async (userId: string) => {
    await supabase.from('hub_members').delete().eq('hub_id', hubId).eq('user_id', userId);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    toast.success('Member removed');
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>;

  return (
    <div className="space-y-2">
      {members.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">No members yet.</div>
      ) : (
        members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 bg-[#2E2E2E] border border-white/10 rounded-xl px-4 py-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={m.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-[#1A1A1A] text-[#D4A853] text-xs">
                {initials(m.profile?.full_name || '?')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium leading-tight truncate">{m.profile?.full_name}</p>
              {(m.profile?.title || m.profile?.company) && (
                <p className="text-xs text-white/40 truncate">
                  {[m.profile.title, m.profile.company].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <span className="text-xs text-white/30 shrink-0">
              Joined {format(new Date(m.joined_at), 'MMM d, yyyy')}
            </span>
            {isAdmin && (
              <button onClick={() => removeMember(m.user_id)}
                className="text-white/30 hover:text-red-400 transition-colors p-1 shrink-0">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Resources Tab ─────────────────────────────────────────────────────────

function HubResourcesTab({ hubId, currentUserId, isAdmin }: { hubId: string; currentUserId: string; isAdmin: boolean }) {
  const [resources, setResources] = useState<HubResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchResources = useCallback(async () => {
    const { data } = await supabase
      .from('hub_resources')
      .select('*, uploader:profiles(full_name, avatar_url)')
      .eq('hub_id', hubId)
      .order('created_at', { ascending: false });
    setResources((data ?? []) as HubResource[]);
    setLoading(false);
  }, [hubId]);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        const path = `${hubId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('hub-files').upload(path, file);
        if (error) { toast.error(`Failed to upload ${file.name}`); continue; }
        const { data: pub } = supabase.storage.from('hub-files').getPublicUrl(path);
        await supabase.from('hub_resources').insert({
          hub_id: hubId,
          uploaded_by: currentUserId,
          file_url: pub.publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || null,
        });
      }
      await fetchResources();
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteResource = async (resource: HubResource) => {
    await supabase.from('hub_resources').delete().eq('id', resource.id);
    setResources((prev) => prev.filter((r) => r.id !== resource.id));
    toast.success('File deleted');
  };

  const fileIcon = (type: string | null) => {
    if (!type) return '📄';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('presentation') || type.includes('powerpoint')) return '📊';
    return '📄';
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) uploadFiles(files);
        }}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? 'border-[#D4A853] bg-[#D4A853]/5' : 'border-white/10 hover:border-white/20'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
            <p className="text-sm text-white/50">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/50">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-white/30">Any file type supported</p>
          </div>
        )}
      </div>

      {/* File list */}
      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg bg-[#2E2E2E]" />)
      ) : resources.length === 0 ? (
        <div className="text-center py-8 text-white/30 text-sm">No files uploaded yet.</div>
      ) : (
        <div className="space-y-2">
          {resources.map((r) => (
            <div key={r.id} className="flex items-center gap-3 bg-[#2E2E2E] border border-white/10 rounded-lg px-4 py-3">
              <span className="text-xl shrink-0">{fileIcon(r.file_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{r.file_name}</p>
                <p className="text-xs text-white/40">
                  {formatBytes(r.file_size)} · {r.uploader?.full_name} · {format(new Date(r.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a href={r.file_url} target="_blank" rel="noopener noreferrer" download={r.file_name}>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/5">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </a>
                {(r.uploaded_by === currentUserId || isAdmin) && (
                  <Button size="sm" variant="ghost" onClick={() => deleteResource(r)}
                    className="h-7 px-2 text-white/30 hover:text-red-400 hover:bg-red-400/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function HubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('Hub');

  const [hub, setHub] = useState<HubDetail | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'resources'>('feed');

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHeaderUrl, setEditHeaderUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);

  const canManage = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
  }, [authLoading, user, router]);

  const fetchHub = useCallback(async () => {
    if (!id) return;
    const [hubRes, countRes] = await Promise.all([
      supabase.from('hubs').select('*').eq('id', id).single(),
      supabase.from('hub_members').select('user_id', { count: 'exact', head: true }).eq('hub_id', id),
    ]);
    setHub(hubRes.data as HubDetail ?? null);
    setMemberCount(countRes.count ?? 0);
    setPageLoading(false);
  }, [id]);

  useEffect(() => { fetchHub(); }, [fetchHub]);

  const openEdit = () => {
    if (!hub) return;
    setEditTitle(hub.title);
    setEditDesc(hub.description ?? '');
    setEditHeaderUrl(hub.header_image_url ?? '');
    setEditOpen(true);
  };

  const uploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderUploading(true);
    const path = `hub-headers/${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('portal-media').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('portal-media').getPublicUrl(path);
      setEditHeaderUrl(data.publicUrl);
    }
    setHeaderUploading(false);
    if (headerInputRef.current) headerInputRef.current.value = '';
  };

  const saveEdit = async () => {
    if (!editTitle.trim() || !id) return;
    setEditSaving(true);
    const { data } = await supabase
      .from('hubs')
      .update({ title: editTitle.trim(), description: editDesc.trim() || null, header_image_url: editHeaderUrl || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (data) setHub(data as HubDetail);
    setEditSaving(false);
    setEditOpen(false);
    toast.success('Hub updated');
  };

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-48 rounded-2xl bg-[#2E2E2E] mb-6" />
          <Skeleton className="h-8 w-48 bg-[#2E2E2E]" />
        </main>
      </div>
    );
  }

  if (!hub) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <main className={cn(DASHBOARD_MAIN, 'text-center')}>
          <p className="text-white/40">Hub not found.</p>
          <Button variant="link" className="text-[#D4A853]" onClick={() => router.push('/dashboard/hubs')}>Back to Hubs</Button>
        </main>
      </div>
    );
  }

  const tabs = [
    { key: 'feed' as const, label: 'Feed', icon: <MessageSquare className="h-4 w-4" /> },
    { key: 'members' as const, label: 'Members', icon: <Users className="h-4 w-4" /> },
    { key: 'resources' as const, label: 'Resources', icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main className={cn(DASHBOARD_MAIN)}>
        {/* Back */}
        <button onClick={() => router.push('/dashboard/hubs')}
          className="mb-5 flex w-full items-center justify-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white sm:w-auto sm:justify-start">
          <ChevronLeft className="h-4 w-4" /> All Hubs
        </button>

        {/* Hub header */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#D4A853]/20 via-[#1A1A1A] to-[#D4A853]/10 border border-white/10 mb-6">
          {hub.header_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hub.header_image_url} alt={hub.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
          )}
          <div className="relative z-10 p-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{hub.title}</h1>
              {hub.description && <p className="text-sm text-white/60 mt-1 max-w-xl">{hub.description}</p>}
              <div className="flex items-center gap-1.5 mt-3 text-sm text-white/50">
                <Users className="h-4 w-4" />
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </div>
            </div>
            {canManage && (
              <Button size="sm" onClick={openEdit}
                className="bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30 gap-1.5 shrink-0">
                <Pencil className="h-3.5 w-3.5" /> Edit Hub
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#2E2E2E] p-1 rounded-xl mb-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'bg-[#D4A853] text-[#1A1A1A]' : 'text-white/50 hover:text-white'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'feed' && user && (
          <HubFeedTab hubId={hub.id} currentUserId={user.id} isAdmin={canManage} />
        )}
        {activeTab === 'members' && (
          <HubMembersTab hubId={hub.id} isAdmin={canManage} />
        )}
        {activeTab === 'resources' && user && (
          <HubResourcesTab hubId={hub.id} currentUserId={user.id} isAdmin={canManage} />
        )}
      </main>

      {/* Edit Hub Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Hub</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-white/70 text-xs">Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Description</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                className="mt-1 bg-[#2E2E2E] border-white/10 text-white resize-none" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Header Image</Label>
              <input ref={headerInputRef} type="file" accept="image/*" className="hidden" onChange={uploadHeader} />
              <div className="flex gap-2 mt-1">
                <Input value={editHeaderUrl} onChange={(e) => setEditHeaderUrl(e.target.value)}
                  placeholder="Image URL or upload below"
                  className="bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30" />
                <Button size="sm" variant="outline" onClick={() => headerInputRef.current?.click()}
                  disabled={headerUploading}
                  className="border-white/10 text-white/70 hover:text-white bg-transparent shrink-0">
                  {headerUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={saveEdit} disabled={!editTitle.trim() || editSaving}
              className="w-full bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold">
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
