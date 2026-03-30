'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSocialAccounts, countUnreadSocialInbox } from '@/lib/social/queries';
import { DEFAULT_WORKSPACE_ID } from '@/lib/social/constants';
import { PlatformIcon, platformLabel } from '@/components/social/PlatformIcons';
import { Button } from '@/components/ui/button';
import { ContentCalendar } from '@/components/social/ContentCalendar';
import { PostsList } from '@/components/social/PostsList';
import { SocialInbox } from '@/components/social/SocialInbox';
import { SocialAnalytics } from '@/components/social/SocialAnalytics';
import { HashtagMonitor } from '@/components/social/HashtagMonitor';
import { SavedReplies } from '@/components/social/SavedReplies';
import { PostComposer } from '@/components/social/PostComposer';
import { ConnectAccountModal } from '@/components/social/ConnectAccountModal';
import type { SocialPostRow } from '@/lib/social/types';
import { Plus, Share2 } from 'lucide-react';

type MainTab = 'calendar' | 'posts' | 'inbox' | 'analytics' | 'hashtags' | 'replies';

export function SocialClient({ workspaceId = DEFAULT_WORKSPACE_ID }: { workspaceId?: string }) {
  const [accounts, setAccounts] = useState<
    { id: string; platform: string; account_name: string; status?: string }[]
  >([]);
  const [platTab, setPlatTab] = useState<string>('all');
  const [mainTab, setMainTab] = useState<MainTab>('calendar');
  const [connectOpen, setConnectOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editPost, setEditPost] = useState<SocialPostRow | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [inboxUnread, setInboxUnread] = useState(0);

  const loadAccounts = useCallback(async () => {
    const rows = await getSocialAccounts(workspaceId);
    setAccounts(
      (rows as { id: string; platform: string; account_name: string; status?: string }[]).filter(
        a => a.status !== 'disconnected'
      )
    );
  }, [workspaceId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    countUnreadSocialInbox(workspaceId).then(setInboxUnread);
  }, [workspaceId, mainTab]);

  const accountById = useMemo(
    () => new Map(accounts.map(a => [a.id, { platform: a.platform }])),
    [accounts]
  );

  const openComposer = (post: SocialPostRow | null, day?: string) => {
    setEditPost(post);
    setPresetDate(day ? `${day}T12:00` : null);
    setComposerOpen(true);
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-border">
            <Share2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Social Media</h1>
            <p className="text-sm text-muted-foreground">Atlas CRM — schedule, inbox, and analytics</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setConnectOpen(true)}>
            Connect account
          </Button>
          <Button type="button" className="btn-primary h-9 gap-2" onClick={() => openComposer(null)}>
            <Plus className="h-4 w-4" />
            New post
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center space-y-4 bg-card">
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Connect a social account to unlock scheduling, inbox, and analytics. Use demo connect to explore without OAuth.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'snapchat', 'twitter'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setConnectOpen(true)}
                className="flex flex-col items-center gap-2 border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <PlatformIcon platform={p} className="h-8 w-8" />
                <span className="text-xs text-foreground">{platformLabel(p)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-1 flex-wrap border-b border-border pb-2">
            <button
              type="button"
              onClick={() => setPlatTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                platTab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'
              }`}
            >
              All platforms
            </button>
            {Array.from(new Set(accounts.map(a => a.platform))).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatTab(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                  platTab === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                {platformLabel(p)}
              </button>
            ))}
          </div>

          <div className="flex gap-1 flex-wrap">
            {(
              [
                ['calendar', 'Calendar'],
                ['posts', 'Posts'],
                ['inbox', 'Inbox'],
                ['analytics', 'Analytics'],
                ['hashtags', 'Hashtags'],
                ['replies', 'Saved replies'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMainTab(id)}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  mainTab === id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/30'
                }`}
              >
                {label}
                {id === 'inbox' && inboxUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {inboxUnread > 9 ? '9+' : inboxUnread}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="border border-border rounded-xl p-4 bg-card min-h-[400px]">
            {mainTab === 'calendar' && (
              <ContentCalendar
                workspaceId={workspaceId}
                accountById={accountById}
                onEditPost={p => openComposer(p)}
                onNewPost={day => openComposer(null, day)}
              />
            )}
            {mainTab === 'posts' && (
              <PostsList workspaceId={workspaceId} accountById={accountById} onEdit={p => openComposer(p)} />
            )}
            {mainTab === 'inbox' && (
              <SocialInbox
                workspaceId={workspaceId}
                accountById={accountById}
                onUnreadChange={setInboxUnread}
              />
            )}
            {mainTab === 'analytics' && <SocialAnalytics workspaceId={workspaceId} />}
            {mainTab === 'hashtags' && <HashtagMonitor workspaceId={workspaceId} />}
            {mainTab === 'replies' && <SavedReplies workspaceId={workspaceId} />}
          </div>
        </>
      )}

      <ConnectAccountModal
        open={connectOpen}
        onOpenChange={setConnectOpen}
        workspaceId={workspaceId}
        onConnected={loadAccounts}
      />

      <PostComposer
        open={composerOpen}
        onOpenChange={v => {
          setComposerOpen(v);
          if (!v) setEditPost(null);
        }}
        workspaceId={workspaceId}
        accounts={accounts}
        initial={editPost}
        presetDate={presetDate}
        onSaved={loadAccounts}
      />
    </div>
  );
}
