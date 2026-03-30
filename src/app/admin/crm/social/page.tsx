'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, Trash2, X, Loader2,
  Instagram, Facebook, Clock, Send, Image as ImageIcon,
  CheckCircle2, AlertCircle, Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─── Types ─── */
type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled';
type Platform = 'instagram' | 'facebook' | 'tiktok';

interface SocialPost {
  id: string;
  caption: string;
  media_urls: string[];
  platforms: Platform[];
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  created_at: string | null;
}

interface SocialAccount {
  id: string;
  platform: Platform;
  account_name: string;
  is_connected: boolean;
}

/* ─── Constants ─── */
const STATUS_STYLES: Record<PostStatus, string> = {
  draft:     'bg-gray-500/15 text-gray-400 border-gray-500/20',
  scheduled: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed:    'bg-red-500/15 text-red-400 border-red-500/20',
  cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const PLATFORMS: { value: Platform; label: string; color: string }[] = [
  { value: 'instagram', label: 'Instagram', color: 'text-pink-400' },
  { value: 'facebook',  label: 'Facebook',  color: 'text-blue-400' },
  { value: 'tiktok',    label: 'TikTok',    color: 'text-foreground' },
];

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === 'instagram') return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
  );
  if (platform === 'facebook') return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
  );
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.78a4.86 4.86 0 0 1-1-.09z"/></svg>
  );
}

/* ─── Compose Dialog ─── */
function ComposeDialog({
  open, onClose, post, onSaved,
}: {
  open: boolean; onClose: () => void; post: SocialPost | null; onSaved: () => void;
}) {
  const isEdit = !!post;
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(post?.platforms ?? ['instagram', 'facebook']);
  const [scheduledFor, setScheduledFor] = useState(post?.scheduled_for ? format(new Date(post.scheduled_for), "yyyy-MM-dd'T'HH:mm") : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (post) {
      setCaption(post.caption);
      setSelectedPlatforms(post.platforms);
      setScheduledFor(post.scheduled_for ? format(new Date(post.scheduled_for), "yyyy-MM-dd'T'HH:mm") : '');
    } else {
      setCaption('');
      setSelectedPlatforms(['instagram', 'facebook']);
      setScheduledFor('');
    }
  }, [post, open]);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const handleSave = async (sendNow = false) => {
    if (!caption.trim()) { toast.error('Caption is required'); return; }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return; }
    setSaving(true);
    try {
      const payload = {
        caption: caption.trim(),
        platforms: selectedPlatforms,
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        status: sendNow ? 'published' : scheduledFor ? 'scheduled' : 'draft',
        ...(sendNow ? { published_at: new Date().toISOString() } : {}),
      };
      if (isEdit) {
        const { error } = await supabase.from('social_posts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', post!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_posts').insert(payload);
        if (error) throw error;
      }
      toast.success(sendNow ? 'Post published' : scheduledFor ? 'Post scheduled' : 'Post saved as draft');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const charCount = caption.length;
  const maxChars = 2200;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Post' : 'Create Post'}</DialogTitle>
          <DialogDescription>Compose and schedule your social post</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Platform selector */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Platforms</Label>
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    selectedPlatforms.includes(p.value)
                      ? `border-primary bg-primary/10 ${p.color}`
                      : 'border-border text-muted-foreground hover:border-border/60'
                  }`}
                >
                  <PlatformIcon platform={p.value} className="w-4 h-4" />
                  <span className="hidden sm:inline">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Caption</Label>
            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption… Use {event_name}, {event_date} for auto-fill tokens"
              rows={6}
              maxLength={maxChars}
              className="text-sm resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground/60">Use {'{first_name}'} for personalization tokens</p>
              <p className={`text-xs ${charCount > maxChars * 0.9 ? 'text-yellow-400' : 'text-muted-foreground/60'}`}>
                {charCount}/{maxChars}
              </p>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Schedule (optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground/60 mt-1">Leave empty to save as draft</p>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            {scheduledFor ? 'Schedule' : 'Save Draft'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving} className="w-full sm:w-auto gap-2">
            <Send className="w-4 h-4" /> Publish Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ─── */
export default function CrmSocialPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'accounts'>('posts');
  const [composePost, setComposePost] = useState<SocialPost | null | undefined>(undefined);
  const [deletePost, setDeletePost] = useState<SocialPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<PostStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, accountsRes] = await Promise.all([
        supabase.from('social_posts').select('*').order('created_at', { ascending: false }),
        supabase.from('social_accounts').select('*').order('platform'),
      ]);
      setPosts(postsRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deletePost) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('social_posts').delete().eq('id', deletePost.id);
      if (error) throw error;
      toast.success('Post deleted');
      setDeletePost(null);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setDeleting(false); }
  };

  const filteredPosts = filterStatus === 'all' ? posts : posts.filter(p => p.status === filterStatus);

  const stats = {
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    published: posts.filter(p => p.status === 'published').length,
    drafts: posts.filter(p => p.status === 'draft').length,
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Social</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Schedule and monitor posts across platforms</p>
        </div>
        <Button size="sm" onClick={() => setComposePost(null)} className="gap-2">
          <Plus className="w-4 h-4" /> Create Post
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Scheduled', value: stats.scheduled, color: 'text-blue-400' },
          { label: 'Published', value: stats.published, color: 'text-emerald-400' },
          { label: 'Drafts',    value: stats.drafts,    color: 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['posts', 'accounts'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab === 'posts' ? `Posts (${posts.length})` : `Connected Accounts (${accounts.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' ? (
        /* ── Accounts ── */
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Connect your social accounts to enable post scheduling.</p>
          {PLATFORMS.map(p => {
            const account = accounts.find(a => a.platform === p.value);
            return (
              <div key={p.value} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg bg-muted ${p.color}`}>
                  <PlatformIcon platform={p.value} className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {account ? account.account_name : 'Not connected'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {account?.is_connected ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs h-8">Connect</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Posts ── */
        <>
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'draft', 'scheduled', 'published', 'failed'] as const).map(s => (
              <button key={s} type="button" onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-all ${filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {s === 'all' ? `All (${posts.length})` : s}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
              <Send className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm mb-1">No posts yet</p>
              <Button size="sm" onClick={() => setComposePost(null)} className="gap-2 mt-2">
                <Plus className="w-4 h-4" /> Create First Post
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map(post => (
                <div key={post.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">{post.caption}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[post.status]}`}>
                          {post.status}
                        </span>
                        <div className="flex items-center gap-1">
                          {post.platforms.map(p => (
                            <PlatformIcon key={p} platform={p} className={`w-3.5 h-3.5 ${PLATFORMS.find(x => x.value === p)?.color}`} />
                          ))}
                        </div>
                        {post.scheduled_for && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{format(new Date(post.scheduled_for), 'MMM d, h:mm a')}
                          </span>
                        )}
                        {post.published_at && (
                          <span className="text-xs text-muted-foreground">
                            Published {format(new Date(post.published_at), 'MMM d')}
                          </span>
                        )}
                      </div>
                      {post.status === 'published' && (post.likes != null || post.reach != null) && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {post.reach != null && <span>👁 {post.reach.toLocaleString()} reach</span>}
                          {post.likes != null && <span>❤️ {post.likes.toLocaleString()} likes</span>}
                          {post.comments != null && <span>💬 {post.comments.toLocaleString()} comments</span>}
                        </div>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open scheduled post actions menu">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setComposePost(post)} className="text-sm">Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeletePost(post)} className="text-sm text-red-400 focus:text-red-400 gap-2">
                          <Trash2 className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Compose dialog */}
      {composePost !== undefined && (
        <ComposeDialog
          open={true}
          onClose={() => setComposePost(undefined)}
          post={composePost}
          onSaved={load}
        />
      )}

      {/* Delete dialog */}
      <Dialog open={!!deletePost} onOpenChange={() => setDeletePost(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>Permanently delete this post? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeletePost(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}