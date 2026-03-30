'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformIcon, platformLabel } from '@/components/social/PlatformIcons';
import { BestTimeRecommendations } from '@/components/social/BestTimeRecommendations';
import { AIWritingAssistant } from '@/components/social/AIWritingAssistant';
import { createSocialPost, updateSocialPost } from '@/lib/social/queries';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { SocialPostRow } from '@/lib/social/types';
import { Smile } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const LIMITS: Record<string, number> = {
  twitter: 280,
  instagram: 2200,
  linkedin: 3000,
  facebook: 63206,
  tiktok: 2200,
  youtube: 5000,
  pinterest: 500,
  snapchat: 250,
};

const EMOJI = ['🎉', '✨', '🔥', '💬', '📍', '🙌', '❤️', '🎯'];

export function PostComposer({
  open,
  onOpenChange,
  workspaceId,
  accounts,
  initial,
  presetDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  accounts: { id: string; platform: string; account_name: string }[];
  initial: SocialPostRow | null;
  presetDate: string | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkUrl, setLinkUrl] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [firstCommentOn, setFirstCommentOn] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewAccountId, setPreviewAccountId] = useState<string>('');
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCaption(initial.caption);
      setSelected(new Set(initial.target_account_ids ?? []));
      setLinkUrl(initial.link_url ?? '');
      setHashtags((initial.hashtags ?? []).join(', '));
      setFirstComment(initial.first_comment ?? '');
      setFirstCommentOn(!!initial.first_comment?.trim());
      setSchedule(initial.status === 'scheduled');
      setScheduledAt(
        initial.scheduled_at ? initial.scheduled_at.slice(0, 16) : presetDate ?? ''
      );
      setMediaUrls(initial.media_urls ?? []);
      setPreviewAccountId(initial.target_account_ids?.[0] ?? accounts[0]?.id ?? '');
    } else {
      setCaption('');
      setSelected(new Set(accounts.slice(0, 1).map(a => a.id)));
      setLinkUrl('');
      setHashtags('');
      setFirstComment('');
      setFirstCommentOn(false);
      setSchedule(!!presetDate);
      setScheduledAt(presetDate ?? '');
      setMediaUrls([]);
    }
  }, [open, initial, accounts, presetDate]);

  useEffect(() => {
    if (!previewAccountId && accounts.length) {
      setPreviewAccountId(accounts[0].id);
    }
  }, [accounts, previewAccountId]);

  const selectedAccounts = useMemo(
    () => accounts.filter(a => selected.has(a.id)),
    [accounts, selected]
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hashtagSuggestions = useMemo(() => {
    const found = caption.match(/#[\w]+/g) ?? [];
    return Array.from(new Set([...found, '#704Collective', '#Charlotte', '#Networking']));
  }, [caption]);

  const overLimit = selectedAccounts.some(a => caption.length > (LIMITS[a.platform] ?? 5000));

  const save = async (mode: 'draft' | 'scheduled' | 'now') => {
    if (!caption.trim()) {
      toast.error('Caption required');
      return;
    }
    if (selected.size === 0) {
      toast.error('Select at least one account');
      return;
    }
    setSaving(true);
    try {
      const tagList = hashtags
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => (t.startsWith('#') ? t : `#${t}`));
      const payload = {
        workspace_id: workspaceId,
        caption: caption.trim(),
        media_urls: mediaUrls,
        media_types: mediaUrls.length ? mediaUrls.map(() => 'image') : [],
        link_url: linkUrl || null,
        hashtags: tagList,
        first_comment: firstCommentOn ? firstComment || null : null,
        target_account_ids: Array.from(selected),
        status:
          mode === 'now'
            ? ('published' as const)
            : mode === 'scheduled'
              ? ('scheduled' as const)
              : ('draft' as const),
        scheduled_at:
          mode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        published_at: mode === 'now' ? new Date().toISOString() : null,
        approval_status: 'draft' as const,
        created_by: user?.id ?? null,
      };

      if (initial) {
        await updateSocialPost(initial.id, {
          caption: payload.caption,
          media_urls: payload.media_urls,
          media_types: payload.media_types,
          link_url: payload.link_url,
          hashtags: payload.hashtags,
          first_comment: payload.first_comment,
          target_account_ids: payload.target_account_ids,
          status: payload.status,
          scheduled_at: payload.scheduled_at,
        });
        toast.success('Post updated');
      } else {
        await createSocialPost(payload);
        toast.success(mode === 'draft' ? 'Draft saved' : 'Post created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl border-border bg-card text-card-foreground flex flex-col h-full p-0"
        >
          <SheetHeader className="p-4 border-b border-border space-y-1">
            <SheetTitle>{initial ? 'Edit post' : 'New post'}</SheetTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => save('draft')} disabled={saving}>
                Save draft
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => save('scheduled')} disabled={saving || !schedule}>
                Schedule
              </Button>
              <Button type="button" className="btn-primary" size="sm" onClick={() => save('now')} disabled={saving}>
                Post now
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Platforms</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {accounts.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      selected.has(a.id) ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'
                    }`}
                  >
                    <PlatformIcon platform={a.platform} />
                    <span className="truncate max-w-[120px]">{a.account_name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-muted-foreground">Caption</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAiOpen(true)}>
                    Generate caption
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Emoji">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border-border bg-popover p-2">
                      <div className="flex flex-wrap gap-1">
                        {EMOJI.map(e => (
                          <button
                            key={e}
                            type="button"
                            className="text-lg p-1 hover:bg-muted rounded"
                            onClick={() => setCaption(c => c + e)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={8}
                className="mt-1 border-border bg-background resize-none"
                placeholder="Write your caption… Type # for hashtag ideas"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {hashtagSuggestions.slice(0, 6).map(h => (
                  <button
                    key={h}
                    type="button"
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-muted"
                    onClick={() => setCaption(c => (c.includes(h) ? c : `${c} ${h}`).trim())}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-1">
                {selectedAccounts.map(a => {
                  const lim = LIMITS[a.platform] ?? 99999;
                  const bad = caption.length > lim;
                  return (
                    <p key={a.id} className={`text-[11px] ${bad ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {platformLabel(a.platform)}: {caption.length}/{lim}
                    </p>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Media URLs (paste image/video URLs, one per line)</Label>
              <Textarea
                value={mediaUrls.join('\n')}
                onChange={e =>
                  setMediaUrls(
                    e.target.value
                      .split('\n')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .slice(0, 10)
                  )
                }
                rows={3}
                className="mt-1 border-border bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Instagram needs image/video; TikTok needs video. Up to 10 assets or one primary video.
              </p>
            </div>

            <div>
              <Label className="text-muted-foreground">Hashtags (comma-separated)</Label>
              <Input value={hashtags} onChange={e => setHashtags(e.target.value)} className="mt-1 border-border bg-background" />
            </div>

            <div>
              <Label className="text-muted-foreground">Link URL (Facebook / LinkedIn previews)</Label>
              <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="mt-1 border-border bg-background" />
            </div>

            <div className="flex items-center justify-between border border-border rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-foreground">First comment (Instagram)</p>
                <p className="text-xs text-muted-foreground">Move hashtags out of the main caption.</p>
              </div>
              <Switch checked={firstCommentOn} onCheckedChange={setFirstCommentOn} />
            </div>
            {firstCommentOn && (
              <Textarea
                value={firstComment}
                onChange={e => setFirstComment(e.target.value)}
                rows={3}
                className="border-border bg-background"
                placeholder="First comment text…"
              />
            )}

            <div className="flex items-center justify-between border border-border rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Schedule</p>
                <p className="text-xs text-muted-foreground">Pick date & time for queue.</p>
              </div>
              <Switch checked={schedule} onCheckedChange={setSchedule} />
            </div>
            {schedule && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="border-border bg-background"
              />
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Best time suggestions</p>
              <BestTimeRecommendations accounts={selectedAccounts} />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Approval</p>
              <p className="text-xs text-muted-foreground mb-2">
                Workspace approval rules can gate publishing. These posts save as drafts until approved in the database.
              </p>
              <Button type="button" variant="secondary" size="sm" disabled>
                Submit for approval (wire workspace setting)
              </Button>
            </div>

            <div>
              <Tabs value={previewAccountId} onValueChange={setPreviewAccountId}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <TabsList className="bg-muted flex-wrap h-auto">
                    {selectedAccounts.map(a => (
                      <TabsTrigger key={a.id} value={a.id} className="text-xs gap-1">
                        <PlatformIcon platform={a.platform} className="h-3 w-3" />
                        {platformLabel(a.platform)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={previewViewport === 'mobile' ? 'secondary' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setPreviewViewport('mobile')}
                    >
                      Mobile
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={previewViewport === 'desktop' ? 'secondary' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setPreviewViewport('desktop')}
                    >
                      Desktop
                    </Button>
                  </div>
                </div>
                {selectedAccounts.map(a => (
                  <TabsContent key={a.id} value={a.id} className="mt-0">
                    <div
                      className={`border border-border rounded-xl bg-muted/20 p-3 mx-auto ${
                        previewViewport === 'mobile' ? 'max-w-sm' : 'max-w-lg'
                      }`}
                    >
                      <p className="text-xs text-muted-foreground mb-1">{platformLabel(a.platform)} preview</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{caption || '…'}</p>
                      {linkUrl && <p className="text-xs text-primary mt-2 truncate">{linkUrl}</p>}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AIWritingAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        type="social_caption"
        platform={selectedAccounts.find(a => a.id === previewAccountId)?.platform ?? 'instagram'}
        topic={caption.slice(0, 80)}
        tone="warm, professional"
        onInsert={text => setCaption(text)}
      />
    </>
  );
}
