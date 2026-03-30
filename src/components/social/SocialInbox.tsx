'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  assignMessage,
  getInboxMessages,
  getInboxMessage,
  replyToMessage,
  updateMessageStatus,
  getSavedReplies,
} from '@/lib/social/queries';
import { PlatformIcon } from '@/components/social/PlatformIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Smile } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function SocialInbox({
  workspaceId,
  accountById,
  onUnreadChange,
}: {
  workspaceId: string;
  accountById: Map<string, { platform: string }>;
  onUnreadChange?: (n: number) => void;
}) {
  const { user } = useAuth();
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ message: Record<string, unknown>; thread: unknown[]; replies: unknown[] } | null>(
    null
  );
  const [reply, setReply] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('unread');
  const [plat, setPlat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);

  const loadList = useCallback(async () => {
    const rows = await getInboxMessages(workspaceId, {
      type: typeFilter === 'all' ? 'all' : (typeFilter as 'comment' | 'dm' | 'mention' | 'reply'),
      status:
        statusFilter === 'assigned' || statusFilter === 'all'
          ? 'all'
          : (statusFilter as 'unread' | 'read' | 'replied' | 'archived' | 'spam'),
      platform: plat === 'all' ? 'all' : (plat as 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'pinterest' | 'snapchat' | 'twitter'),
      search,
      assignedTo: statusFilter === 'assigned' ? 'me' : 'all',
    });
    setList(rows);
    const unread = rows.filter((r: { status?: string }) => r.status === 'unread').length;
    onUnreadChange?.(unread);
  }, [workspaceId, typeFilter, statusFilter, plat, search, onUnreadChange]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    getSavedReplies(workspaceId).then(setTemplates);
  }, [workspaceId]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    getInboxMessage(activeId).then(setDetail);
  }, [activeId]);

  const open = async (id: string) => {
    setActiveId(id);
    await updateMessageStatus(id, 'read');
    loadList();
  };

  const sendReply = async () => {
    if (!activeId || !user || !reply.trim()) return;
    try {
      await replyToMessage(activeId, reply.trim(), user.id);
      setReply('');
      toast.success('Reply logged (platform send is a placeholder)');
      loadList();
      const d = await getInboxMessage(activeId);
      setDetail(d);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reply failed');
    }
  };

  return (
    <div className="flex border border-border rounded-xl overflow-hidden bg-card min-h-[520px]">
      <div className="w-full max-w-[320px] border-r border-border flex flex-col">
        <div className="p-2 border-b border-border space-y-2">
          <div className="flex flex-wrap gap-1">
            {(['all', 'instagram', 'facebook', 'linkedin', 'twitter'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlat(p)}
                className={`p-1.5 rounded-md border ${plat === p ? 'border-primary bg-primary/10' : 'border-transparent'}`}
              >
                {p === 'all' ? <span className="text-[10px] px-1">All</span> : <PlatformIcon platform={p} className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap text-[10px]">
            {(['all', 'comment', 'dm', 'mention'] as const).map(t => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={typeFilter === t ? 'secondary' : 'ghost'}
                className="h-7 capitalize"
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap text-[10px]">
            {(['unread', 'all', 'assigned'] as const).map(t => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={statusFilter === t ? 'secondary' : 'ghost'}
                className="h-7 capitalize"
                onClick={() => setStatusFilter(t)}
              >
                {t === 'assigned' ? 'Assigned to me' : t}
              </Button>
            ))}
          </div>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 text-xs border-border bg-background"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((m: Record<string, unknown>) => {
            const id = m.id as string;
            const acc = accountById.get(m.social_account_id as string);
            return (
              <button
                key={id}
                type="button"
                onClick={() => open(id)}
                className={`w-full text-left p-3 border-b border-border hover:bg-muted/30 flex gap-2 ${activeId === id ? 'bg-muted/40' : ''}`}
              >
                <PlatformIcon platform={acc?.platform ?? 'twitter'} className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{m.author_name as string}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{m.content as string}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(m.received_at as string), { addSuffix: true })}
                  </p>
                </div>
                {m.status === 'unread' && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a message</div>
        ) : (
          <>
            <div className="p-4 border-b border-border space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{detail.message.author_name as string}</p>
                  <p className="text-xs text-muted-foreground">{(detail.message.author_handle as string) ?? ''}</p>
                </div>
                <PlatformIcon
                  platform={accountById.get(detail.message.social_account_id as string)?.platform ?? 'twitter'}
                  className="h-5 w-5"
                />
              </div>
              {detail.message.sentiment ? (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {String(detail.message.sentiment)}
                </Badge>
              ) : null}
              <p className="text-sm text-foreground whitespace-pre-wrap">{detail.message.content as string}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => user && assignMessage(activeId!, user.id)}>
                  Assign to me
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => activeId && updateMessageStatus(activeId, 'archived').then(loadList)}
                >
                  Archive
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => activeId && updateMessageStatus(activeId, 'spam').then(loadList)}
                >
                  Spam
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(detail.thread as Record<string, unknown>[]).map(t => (
                <div key={String(t.id)} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                  {String(t.content ?? '')}
                </div>
              ))}
              {(detail.replies as Record<string, unknown>[]).map(r => (
                <div key={r.id as string} className="text-xs bg-muted/30 rounded-md p-2">
                  {r.content as string}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border space-y-2">
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
                      Saved replies
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-64 overflow-y-auto border-border bg-popover">
                    {templates.map(t => (
                      <DropdownMenuItem
                        key={t.id as string}
                        className="text-xs"
                        onClick={() => setReply(r => r + (t.content as string))}
                      >
                        {t.name as string}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                      <Smile className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto border-border bg-popover p-2">Emoji picker placeholder</PopoverContent>
                </Popover>
              </div>
              <Textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder="Write a reply…"
                className="border-border bg-background text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{reply.length} characters</p>
              <Button type="button" className="btn-primary h-9" onClick={sendReply} disabled={!reply.trim()}>
                Send (log)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
