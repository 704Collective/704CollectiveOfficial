'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ensureAdminDirectConversation,
  createAdminGroupConversation,
  postAdminInboxMessage,
} from '@/app/actions/adminPartnerActions';
import {
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ADAM = 'adam@cltbucketlist.com';

type AdminConv = {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  updated_at: string;
  created_by: string;
};

type ProfileMini = { id: string; full_name: string | null; avatar_url: string | null; email: string | null };

type ParticipantRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  profile: ProfileMini | null;
};

type LastMsg = { conversation_id: string; content: string; created_at: string; sender_id: string };

type EnrichedConv = AdminConv & {
  participants: ParticipantRow[];
  lastMessage?: LastMsg;
};

type AdminMsg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_urls: string[] | null;
  file_urls: string[] | null;
  file_names: string[] | null;
  created_at: string;
};

type SearchHit = {
  id: string;
  full_name: string | null;
  email: string | null;
  member_type: string | null;
  role: string | null;
};

type UniversalRow = {
  source: 'admin' | 'member';
  id: string;
  type: string;
  title: string | null;
  updated_at: string;
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function convTitle(c: EnrichedConv, selfId: string): string {
  if (c.type === 'group') return c.title || 'Group';
  const other = c.participants.find((p) => p.user_id !== selfId);
  return other?.profile?.full_name || other?.profile?.email || 'Direct message';
}

function hasUnread(c: EnrichedConv, selfId: string): boolean {
  if (!c.lastMessage) return false;
  if (c.lastMessage.sender_id === selfId) return false;
  const me = c.participants.find((p) => p.user_id === selfId);
  if (!me?.last_read_at) return true;
  return c.lastMessage.created_at > me.last_read_at;
}

function allowedRecipient(p: SearchHit) {
  return (
    ['business', 'social', 'partner'].includes(p.member_type || '') ||
    ['admin', 'super_admin'].includes(p.role || '')
  );
}

export default function AdminInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, isAdmin, loading } = useAuth();
  usePageTitle('Team Inbox');
  const openConvId = searchParams.get('c');

  const [convs, setConvs] = useState<EnrichedConv[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMsg[]>([]);
  const [senderMap, setSenderMap] = useState<Record<string, ProfileMini>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SearchHit[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);

  const [adamUniversal, setAdamUniversal] = useState(false);
  const [univQ, setUnivQ] = useState('');
  const [univRows, setUnivRows] = useState<UniversalRow[]>([]);
  const [univLoading, setUnivLoading] = useState(false);
  const [univActive, setUnivActive] = useState<UniversalRow | null>(null);
  const [univMessages, setUnivMessages] = useState<AdminMsg[]>([]);
  const [univSenderMap, setUnivSenderMap] = useState<Record<string, ProfileMini>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdam = profile?.email?.toLowerCase() === ADAM;

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    try {
      const { data: parts, error: pe } = await supabase
        .from('admin_conversation_participants')
        .select('conversation_id, user_id, last_read_at')
        .eq('user_id', user.id);
      if (pe) throw pe;
      const ids = [...new Set((parts ?? []).map((p) => p.conversation_id))];
      if (!ids.length) {
        setConvs([]);
        return;
      }

      const { data: convRows, error: ce } = await supabase
        .from('admin_conversations')
        .select('id, type, title, updated_at, created_by')
        .in('id', ids)
        .order('updated_at', { ascending: false });
      if (ce) throw ce;

      const { data: allParts, error: ape } = await supabase
        .from('admin_conversation_participants')
        .select('conversation_id, user_id, last_read_at')
        .in('conversation_id', ids);
      if (ape) throw ape;

      const uidSet = new Set((allParts ?? []).map((p) => p.user_id));
      const { data: profRows } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', [...uidSet]);
      const profMap = Object.fromEntries((profRows ?? []).map((p) => [p.id, p as ProfileMini]));

      const partByConv = new Map<string, ParticipantRow[]>();
      for (const row of allParts ?? []) {
        const r: ParticipantRow = {
          conversation_id: row.conversation_id,
          user_id: row.user_id,
          last_read_at: row.last_read_at,
          profile: profMap[row.user_id] ?? null,
        };
        const list = partByConv.get(r.conversation_id) ?? [];
        list.push(r);
        partByConv.set(r.conversation_id, list);
      }

      const { data: msgs, error: me } = await supabase
        .from('admin_messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(800);
      if (me) throw me;

      const lastByConv = new Map<string, LastMsg>();
      for (const m of msgs ?? []) {
        if (!lastByConv.has(m.conversation_id)) {
          lastByConv.set(m.conversation_id, {
            conversation_id: m.conversation_id,
            content: m.content,
            created_at: m.created_at,
            sender_id: m.sender_id,
          });
        }
      }

      const enriched: EnrichedConv[] = (convRows ?? []).map((c) => ({
        ...c,
        participants: partByConv.get(c.id) ?? [],
        lastMessage: lastByConv.get(c.id),
      }));
      setConvs(enriched);
    } catch (e) {
      console.error(e);
      toast.error('Could not load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/admin');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!openConvId || !user) return;
    setUnivActive(null);
    setActiveId(openConvId);
  }, [openConvId, user]);

  useEffect(() => {
    if (isAdam) {
      (async () => {
        const { data } = await supabase
          .from('profiles')
          .select('see_all_cross_conversations')
          .eq('id', user?.id ?? '')
          .maybeSingle();
        setAdamUniversal(
          (data as { see_all_cross_conversations?: boolean } | null)?.see_all_cross_conversations === true
        );
      })();
    }
  }, [isAdam, user?.id]);

  useEffect(() => {
    if (user && isAdmin) void loadConversations();
  }, [user, isAdmin, loadConversations]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const { data: msgs, error } = await supabase
        .from('admin_messages')
        .select('id, conversation_id, sender_id, content, image_urls, file_urls, file_names, created_at')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      const list = (msgs ?? []) as AdminMsg[];
      setMessages(list);
      const sids = [...new Set(list.map((m) => m.sender_id))];
      if (sids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, email')
          .in('id', sids);
        const map: Record<string, ProfileMini> = {};
        for (const p of profs ?? []) map[p.id] = p as ProfileMini;
        setSenderMap(map);
      } else setSenderMap({});
      await supabase
        .from('admin_conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
      void loadConversations();
    },
    [loadConversations, user]
  );

  useEffect(() => {
    if (!activeId || univActive) return;
    void loadMessages(activeId);
  }, [activeId, univActive, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, univMessages]);

  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`admin-inbox:${activeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_messages',
          filter: `conversation_id=eq.${activeId}`,
        },
        async (payload) => {
          const row = payload.new as AdminMsg;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id !== user?.id) {
            const { data: p } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url, email')
              .eq('id', row.sender_id)
              .maybeSingle();
            if (p) setSenderMap((m) => ({ ...m, [p.id]: p as ProfileMini }));
          }
          void loadConversations();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, user?.id, loadConversations]);

  const activeConv = useMemo(
    () => convs.find((c) => c.id === activeId) ?? null,
    [convs, activeId]
  );

  const runSearch = useCallback(
    (q: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(async () => {
        const t = q.trim();
        if (t.length < 2) {
          setSearchHits([]);
          return;
        }
        const safe = t.replace(/%/g, '\\%').replace(/_/g, '\\_');
        setSearching(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, member_type, role')
          .is('deleted_at', null)
          .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
          .limit(40);
        setSearching(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        setSearchHits((data ?? []).filter(allowedRecipient).filter((p) => p.id !== user?.id));
      }, 250);
    },
    [user?.id]
  );

  const togglePick = (p: SearchHit) => {
    setPicked((prev) => {
      if (prev.some((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
      return [...prev, p];
    });
  };

  const startCompose = async () => {
    if (!picked.length) {
      toast.error('Select at least one recipient');
      return;
    }
    if (picked.length > 1 && !groupTitle.trim()) {
      toast.error('Group title is required');
      return;
    }
    setCreatingConv(true);
    try {
      let cid: string;
      if (picked.length === 1) {
        const r = await ensureAdminDirectConversation(picked[0].id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        cid = r.conversationId;
      } else {
        const r = await createAdminGroupConversation(
          picked.map((p) => p.id),
          groupTitle.trim()
        );
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        cid = r.conversationId;
      }
      setComposeOpen(false);
      setPicked([]);
      setGroupTitle('');
      setSearchQ('');
      setSearchHits([]);
      setUnivActive(null);
      await loadConversations();
      setActiveId(cid);
      await loadMessages(cid);
      toast.success('Conversation ready');
    } finally {
      setCreatingConv(false);
    }
  };

  const uploadAndSend = async (files: FileList | null, asImages: boolean) => {
    if (!files?.length || !activeId || !user) return;
    const imageUrls: string[] = [];
    const fileUrls: string[] = [];
    const fileNames: string[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      if (asImages) {
        const path = `admin-inbox/${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('portal-media').upload(path, file);
        if (error) {
          toast.error(error.message);
          continue;
        }
        const { data: pub } = supabase.storage.from('portal-media').getPublicUrl(path);
        imageUrls.push(pub.publicUrl);
      } else {
        const path = `admin-inbox/${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('portal-files').upload(path, file);
        if (error) {
          toast.error(error.message);
          continue;
        }
        const { data: pub } = supabase.storage.from('portal-files').getPublicUrl(path);
        fileUrls.push(pub.publicUrl);
        fileNames.push(file.name);
      }
    }
    const r = await postAdminInboxMessage(activeId, draft.trim(), imageUrls, fileUrls, fileNames);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setDraft('');
    await loadMessages(activeId);
    if (fileRef.current) fileRef.current.value = '';
    if (imgRef.current) imgRef.current.value = '';
  };

  const sendText = async () => {
    if (!activeId) return;
    setSending(true);
    try {
      const r = await postAdminInboxMessage(activeId, draft.trim(), [], [], []);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setDraft('');
      await loadMessages(activeId);
    } finally {
      setSending(false);
    }
  };

  const fetchUniversal = useCallback(async () => {
    if (!adamUniversal || !isAdam) return;
    setUnivLoading(true);
    try {
      const res = await fetch(`/api/admin/universal-conversations?q=${encodeURIComponent(univQ)}`);
      if (!res.ok) {
        toast.error('Could not load universal list');
        return;
      }
      const j = (await res.json()) as { conversations: UniversalRow[] };
      setUnivRows(j.conversations ?? []);
    } finally {
      setUnivLoading(false);
    }
  }, [adamUniversal, isAdam, univQ]);

  useEffect(() => {
    if (!adamUniversal) return;
    const t = setTimeout(() => void fetchUniversal(), 300);
    return () => clearTimeout(t);
  }, [univQ, adamUniversal, fetchUniversal]);

  const openUniversal = async (row: UniversalRow) => {
    setUnivActive(row);
    setActiveId(null);
    setMessages([]);
    const res = await fetch(
      `/api/admin/universal-messages?source=${encodeURIComponent(row.source)}&id=${encodeURIComponent(row.id)}`
    );
    if (!res.ok) {
      toast.error('Could not load thread');
      return;
    }
    const j = (await res.json()) as { messages: AdminMsg[] };
    const list = j.messages ?? [];
    setUnivMessages(list);
    const sids = [...new Set(list.map((m) => m.sender_id))];
    if (sids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', sids);
      const map: Record<string, ProfileMini> = {};
      for (const p of profs ?? []) map[p.id] = p as ProfileMini;
      setUnivSenderMap(map);
    } else setUnivSenderMap({});
  };

  const selectMine = (id: string) => {
    setUnivActive(null);
    setUnivMessages([]);
    setActiveId(id);
  };

  if (loading || !isAdmin) {
    return (
      <AdminLayout title="Team Inbox">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : null}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Team Inbox">
      <div className="flex flex-col gap-4 h-[calc(100vh-8rem)] min-h-[480px]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team Inbox</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Private conversations between admins and business members, partners, and team.
            </p>
          </div>
          <Button onClick={() => setComposeOpen(true)} className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            New message
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 border border-border rounded-xl overflow-hidden bg-card">
          <div className="w-full max-w-[340px] border-r border-border flex flex-col shrink-0 bg-muted/20">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loadingList ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : convs.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-6">No conversations yet.</p>
                ) : (
                  convs.map((c) => {
                    const title = convTitle(c, user!.id);
                    const unread = hasUnread(c, user!.id);
                    const active = activeId === c.id && !univActive;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectMine(c.id)}
                        className={cn(
                          'w-full text-left rounded-lg px-3 py-2.5 transition-colors border border-transparent',
                          active ? 'bg-accent border-primary/30' : 'hover:bg-accent/60'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-xs">
                              {c.type === 'group' ? <Users className="h-4 w-4" /> : initials(title)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn('text-sm truncate', unread && 'font-semibold')}>{title}</span>
                              {c.lastMessage && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {formatDistanceToNow(new Date(c.lastMessage.created_at), { addSuffix: false })}
                                </span>
                              )}
                            </div>
                            {c.lastMessage?.content && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessage.content}</p>
                            )}
                          </div>
                          {unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {adamUniversal && isAdam && (
                <div className="border-t border-border p-2 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 px-2">
                    All conversations
                  </p>
                  <div className="relative px-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={univQ}
                      onChange={(e) => setUnivQ(e.target.value)}
                      placeholder="Search any thread…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  {univLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-0.5 max-h-[220px] overflow-y-auto">
                      {univRows.map((r) => (
                        <button
                          key={`${r.source}-${r.id}`}
                          type="button"
                          onClick={() => void openUniversal(r)}
                          className={cn(
                            'w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-accent/80',
                            univActive?.id === r.id && univActive.source === r.source && 'bg-accent'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">
                              {r.title || `${r.type} · ${r.id.slice(0, 8)}…`}
                            </span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {r.source}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {univActive ? (
              <>
                <div className="px-4 py-3 border-b border-border shrink-0">
                  <h2 className="font-semibold truncate">
                    {univActive.title || `${univActive.type} (${univActive.source})`}
                  </h2>
                  <p className="text-xs text-muted-foreground">Read-only universal view</p>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {univMessages.map((m) => {
                      const sn = univSenderMap[m.sender_id];
                      const own = m.sender_id === user?.id;
                      return (
                        <div key={m.id} className={cn('flex gap-2', own && 'flex-row-reverse')}>
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={sn?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {initials(sn?.full_name || '?')}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2 max-w-[85%] text-sm',
                              own ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            )}
                          >
                            <p className="text-[10px] opacity-80 mb-1">
                              {sn?.full_name || 'Unknown'} ·{' '}
                              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </p>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            {(m.image_urls?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {m.image_urls!.map((u) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={u} src={u} alt="" className="max-h-40 rounded-md border" />
                                ))}
                              </div>
                            )}
                            {(m.file_urls?.length ?? 0) > 0 &&
                              m.file_urls!.map((u, i) => (
                                <a
                                  key={u}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-xs underline mt-1"
                                >
                                  {m.file_names?.[i] || 'Attachment'}
                                </a>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              </>
            ) : activeConv && activeId ? (
              <>
                <div className="px-4 py-3 border-b border-border shrink-0">
                  <h2 className="font-semibold truncate">{convTitle(activeConv, user!.id)}</h2>
                  {activeConv.type === 'group' && (
                    <p className="text-xs text-muted-foreground">{activeConv.participants.length} members</p>
                  )}
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {messages.map((m) => {
                      const sn = senderMap[m.sender_id];
                      const own = m.sender_id === user?.id;
                      return (
                        <div key={m.id} className={cn('flex gap-2', own && 'flex-row-reverse')}>
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={sn?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {initials(sn?.full_name || '?')}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2 max-w-[85%] text-sm',
                              own ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            )}
                          >
                            <p className="text-[10px] opacity-80 mb-1">
                              {sn?.full_name || 'Unknown'} ·{' '}
                              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </p>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            {(m.image_urls?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {m.image_urls!.map((u) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={u} src={u} alt="" className="max-h-40 rounded-md border" />
                                ))}
                              </div>
                            )}
                            {(m.file_urls?.length ?? 0) > 0 &&
                              m.file_urls!.map((u, i) => (
                                <a
                                  key={u}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-xs underline mt-1"
                                >
                                  {m.file_names?.[i] || 'Attachment'}
                                </a>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
                <div className="p-3 border-t border-border shrink-0 flex flex-col gap-2">
                  <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadAndSend(e.target.files, true)} />
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void uploadAndSend(e.target.files, false)} />
                  <div className="flex items-end gap-2">
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" size="icon" variant="outline" onClick={() => imgRef.current?.click()}>
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="outline" onClick={() => fileRef.current?.click()}>
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      className="min-h-[44px] max-h-32 resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendText();
                        }
                      }}
                    />
                    <Button type="button" size="icon" onClick={() => void sendText()} disabled={sending}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
                Select a conversation or start a new message.
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Search people by name or email</p>
              <Input
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  runSearch(e.target.value);
                }}
                placeholder="Type to search…"
              />
              {searching && <p className="text-xs text-muted-foreground mt-1">Searching…</p>}
              {searchHits.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border divide-y">
                  {searchHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between gap-2"
                      onClick={() => togglePick(h)}
                    >
                      <span className="truncate">{h.full_name || h.email}</span>
                      {picked.some((x) => x.id === h.id) && <Badge variant="secondary">Selected</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {picked.length > 1 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Group title</p>
                <Input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g. Vendor onboarding" />
              </div>
            )}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {picked.map((p) => (
                  <Badge key={p.id} variant="outline" className="gap-1">
                    {p.full_name || p.email}
                    <button type="button" className="ml-1 hover:text-destructive" onClick={() => togglePick(p)}>
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void startCompose()} disabled={creatingConv}>
              {creatingConv ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Open chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
