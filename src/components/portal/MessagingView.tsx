'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { notifyNewConversation } from '@/app/actions/notifyNewConversation';
import { toast } from 'sonner';
import {
  Plus,
  Send,
  Image as ImageIcon,
  Paperclip,
  MoreVertical,
  X,
  Users,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface ParticipantProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface Participant {
  user_id: string;
  last_read_at: string | null;
  profile: ParticipantProfile | null;
}

interface LastMessage {
  content: string | null;
  created_at: string;
  sender_id: string;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants: Participant[];
  lastMessage?: LastMessage;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  image_urls: string[] | null;
  file_urls: string[] | null;
  file_names: string[] | null;
  is_edited: boolean;
  created_at: string;
  deleted_at: string | null;
  sender: ParticipantProfile | null;
}

interface MemberSearchResult {
  id: string;
  full_name: string;
  avatar_url: string | null;
  title: string | null;
  company: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getConversationName(conv: Conversation, currentUserId: string): string {
  if (conv.type === 'group') return conv.title || 'Group Chat';
  const other = conv.participants.find((p) => p.user_id !== currentUserId);
  return other?.profile?.full_name || 'Unknown Member';
}

function getConversationAvatar(conv: Conversation, currentUserId: string): string | null {
  if (conv.type === 'group') return null;
  const other = conv.participants.find((p) => p.user_id !== currentUserId);
  return other?.profile?.avatar_url ?? null;
}

function hasUnread(conv: Conversation, currentUserId: string): boolean {
  if (!conv.lastMessage) return false;
  if (conv.lastMessage.sender_id === currentUserId) return false;
  const participant = conv.participants.find((p) => p.user_id === currentUserId);
  if (!participant?.last_read_at) return true;
  return conv.lastMessage.created_at > participant.last_read_at;
}

function initials(name: string | null | undefined): string {
  const t = name?.trim();
  if (!t) return '?';
  return t
    .split(/\s+/)
    .filter((n) => n.length > 0)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';
}

// ── Sub-components ────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  currentUserId,
  isActive,
  onClick,
}: {
  conv: Conversation;
  currentUserId: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = getConversationName(conv, currentUserId);
  const avatar = getConversationAvatar(conv, currentUserId);
  const unread = hasUnread(conv, currentUserId);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-[#D4A853]/15 border border-[#D4A853]/30'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={avatar ?? undefined} />
        <AvatarFallback className="bg-[#2E2E2E] text-[#D4A853] text-xs">
          {conv.type === 'group' ? <Users className="h-4 w-4" /> : initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${unread ? 'font-semibold text-white' : 'text-white/80'}`}>
            {name}
          </span>
          {conv.lastMessage && (
            <span className="text-xs text-white/40 shrink-0">
              {formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: false })}
            </span>
          )}
        </div>
        {conv.lastMessage?.content && (
          <p className={`text-xs truncate mt-0.5 ${unread ? 'text-white/70' : 'text-white/40'}`}>
            {conv.lastMessage.content}
          </p>
        )}
        {conv.type === 'group' && (
          <p className="text-xs text-white/40 mt-0.5">{conv.participants.length} members</p>
        )}
      </div>
      {unread && <div className="h-2 w-2 rounded-full bg-[#D4A853] shrink-0" />}
    </button>
  );
}

function MessageBubble({
  msg,
  isOwn,
  onEdit,
  onDelete,
}: {
  msg: Message;
  isOwn: boolean;
  onEdit: (msg: Message) => void;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleTouchStart = () => {
    if (!isOwn) return;
    longPressTimer.current = setTimeout(() => setShowMenu(true), 600);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (msg.deleted_at) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
        <span className="text-xs text-white/30 italic">Message deleted</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-end gap-2 mb-3 group ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      onContextMenu={(e) => {
        if (!isOwn) return;
        e.preventDefault();
        setShowMenu(true);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {!isOwn && (
        <Avatar className="h-7 w-7 shrink-0 mb-1">
          <AvatarImage src={msg.sender?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-[#2E2E2E] text-[#D4A853] text-xs">
            {initials(msg.sender?.full_name || '?')}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {!isOwn && (
          <span className="text-xs text-white/50 px-1">{msg.sender?.full_name}</span>
        )}
        <div
          className={`relative rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? 'bg-[#D4A853] text-[#1A1A1A] rounded-tr-sm'
              : 'bg-[#2E2E2E] text-white/90 rounded-tl-sm'
          }`}
        >
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
          {msg.image_urls && msg.image_urls.length > 0 && (
            <div className="grid grid-cols-2 gap-1 mt-2">
              {msg.image_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="rounded w-full object-cover max-h-32" />
                </a>
              ))}
            </div>
          )}
          {msg.file_urls && msg.file_urls.length > 0 && (
            <div className="mt-2 space-y-1">
              {msg.file_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100"
                >
                  <Paperclip className="h-3 w-3" />
                  {msg.file_names?.[i] || 'File'}
                </a>
              ))}
            </div>
          )}
          {msg.is_edited && (
            <span className="text-[10px] opacity-50 block mt-1">edited</span>
          )}
        </div>
        <span className="text-[10px] text-white/30 px-1">
          {format(new Date(msg.created_at), 'h:mm a')}
        </span>
      </div>

      {isOwn && (
        <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 mb-5">
              <MoreVertical className="h-3 w-3 text-white/50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#2E2E2E] border-white/10">
            <DropdownMenuItem
              onClick={() => { setShowMenu(false); onEdit(msg); }}
              className="text-white/80 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => { setShowMenu(false); onDelete(msg.id); }}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MessagingView({ initialDirectPeerId }: { initialDirectPeerId?: string | null }) {
  const { user, profile } = useAuth();

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // Input
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);

  // File uploads
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New conversation modal
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberSearchResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<MemberSearchResult[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  // ── Fetch conversations ──────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setConvLoading(true);
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select(`
          *,
          participants:conversation_participants(
            user_id, last_read_at,
            profile:profiles(id, full_name, avatar_url)
          )
        `)
        .order('updated_at', { ascending: false });

      if (!convs) { setConvLoading(false); return; }

      // Fetch last messages
      const ids = convs.map((c) => c.id);
      const { data: lastMsgs } = ids.length
        ? await supabase
            .from('messages')
            .select('conversation_id, content, created_at, sender_id')
            .in('conversation_id', ids)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        : { data: [] };

      const lastMsgMap: Record<string, LastMessage> = {};
      for (const m of lastMsgs ?? []) {
        if (!lastMsgMap[m.conversation_id]) {
          lastMsgMap[m.conversation_id] = m as LastMessage;
        }
      }

      const mapped: Conversation[] = convs.map((c) => ({
        ...c,
        type: c.type as 'direct' | 'group',
        participants: (c.participants as Participant[]) ?? [],
        lastMessage: lastMsgMap[c.id],
      }));

      setConversations(mapped);
    } finally {
      setConvLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const dmOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    const peer = initialDirectPeerId?.trim();
    if (!peer || !user || peer === user.id || convLoading) return;
    if (dmOpenedRef.current === peer) return;

    (async () => {
      try {
        const { data: existing } = await supabase
          .from('conversations')
          .select(`id, participants:conversation_participants(user_id)`)
          .eq('type', 'direct');

        const match = (existing ?? []).find((c) => {
          const ids = (c.participants as { user_id: string }[]).map((p) => p.user_id);
          return ids.includes(user.id) && ids.includes(peer) && ids.length === 2;
        });

        if (match) {
          dmOpenedRef.current = peer;
          setSelectedConvId(match.id);
          setShowSidebar(false);
          return;
        }

        const { data: conv, error } = await supabase
          .from('conversations')
          .insert({ type: 'direct', created_by: user.id })
          .select()
          .single();

        if (error || !conv) throw error;

        await supabase.from('conversation_participants').insert([
          { conversation_id: conv.id, user_id: user.id },
          { conversation_id: conv.id, user_id: peer },
        ]);

        if (profile) {
          notifyNewConversation({
            conversationId: conv.id,
            senderName: profile.full_name,
            senderUserId: user.id,
            recipientUserIds: [peer],
          }).catch(() => {});
        }

        dmOpenedRef.current = peer;
        await fetchConversations();
        setSelectedConvId(conv.id);
        setShowSidebar(false);
      } catch {
        dmOpenedRef.current = null;
      }
    })();
  }, [initialDirectPeerId, user, convLoading, profile, fetchConversations]);

  // ── Fetch messages for selected conversation ─────────────────────────────

  const fetchMessages = useCallback(async (convId: string) => {
    setMsgLoading(true);
    try {
      const { data } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(id, full_name, avatar_url)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      setMessages((data ?? []) as Message[]);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedConvId) return;
    fetchMessages(selectedConvId);

    // Mark as read
    if (user) {
      supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', selectedConvId)
        .eq('user_id', user.id)
        .then(() => {});
    }
  }, [selectedConvId, fetchMessages, user]);

  // ── Realtime subscription for messages ──────────────────────────────────

  useEffect(() => {
    if (!selectedConvId) return;

    realtimeRef.current?.unsubscribe();

    realtimeRef.current = supabase
      .channel(`messages:${selectedConvId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConvId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_id === user?.id) return; // already added optimistically

          // Fetch sender profile
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();

          setMessages((prev) => [...prev, { ...newMsg, sender: sender ?? null }]);

          // Mark as read immediately
          if (user) {
            await supabase
              .from('conversation_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', selectedConvId)
              .eq('user_id', user.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConvId}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
          );
        }
      )
      .subscribe();

    return () => { realtimeRef.current?.unsubscribe(); };
  }, [selectedConvId, user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Member search for new conversation ──────────────────────────────────

  useEffect(() => {
    if (!memberSearch.trim()) { setMemberResults([]); return; }
    const timeout = setTimeout(async () => {
      setMemberSearchLoading(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, title, company')
          .ilike('full_name', `%${memberSearch}%`)
          .neq('id', user?.id ?? '')
          .in('role', ['admin', 'super_admin', 'lead'])
          .or('member_type.eq.business,role.eq.admin,role.eq.super_admin')
          .limit(8);
        setMemberResults((data ?? []) as MemberSearchResult[]);
      } finally {
        setMemberSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [memberSearch, user?.id]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !selectedConvId || !user) return;
    const content = draft.trim();
    setDraft('');

    if (editingMsg) {
      // Edit mode
      await supabase
        .from('messages')
        .update({ content, is_edited: true, edited_at: new Date().toISOString() })
        .eq('id', editingMsg.id);
      setEditingMsg(null);
      return;
    }

    setSending(true);
    try {
      const { data: msg } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConvId,
          sender_id: user.id,
          content,
        })
        .select(`*, sender:profiles(id, full_name, avatar_url)`)
        .single();

      if (msg) {
        setMessages((prev) => [...prev, msg as Message]);
        // Update conversation updated_at
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', selectedConvId);
        fetchConversations();
      }
    } finally {
      setSending(false);
    }
  }, [draft, selectedConvId, user, editingMsg, fetchConversations]);

  // ── Upload image attachment ───────────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !selectedConvId || !user) return;
    setUploadingFiles(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 4)) {
        const path = `messages/${selectedConvId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('portal-media').upload(path, file);
        if (!error) {
          const { data: pub } = supabase.storage.from('portal-media').getPublicUrl(path);
          urls.push(pub.publicUrl);
        }
      }
      if (urls.length) {
        const { data: msg } = await supabase
          .from('messages')
          .insert({ conversation_id: selectedConvId, sender_id: user.id, image_urls: urls })
          .select(`*, sender:profiles(id, full_name, avatar_url)`)
          .single();
        if (msg) setMessages((prev) => [...prev, msg as Message]);
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', selectedConvId);
        fetchConversations();
      }
    } finally {
      setUploadingFiles(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // ── Upload file attachment ───────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !selectedConvId || !user) return;
    setUploadingFiles(true);
    try {
      const urls: string[] = [];
      const names: string[] = [];
      for (const file of files.slice(0, 5)) {
        const path = `messages/${selectedConvId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('portal-files').upload(path, file);
        if (!error) {
          const { data: pub } = supabase.storage.from('portal-files').getPublicUrl(path);
          urls.push(pub.publicUrl);
          names.push(file.name);
        }
      }
      if (urls.length) {
        const { data: msg } = await supabase
          .from('messages')
          .insert({ conversation_id: selectedConvId, sender_id: user.id, file_urls: urls, file_names: names })
          .select(`*, sender:profiles(id, full_name, avatar_url)`)
          .single();
        if (msg) setMessages((prev) => [...prev, msg as Message]);
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', selectedConvId);
        fetchConversations();
      }
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Delete message ───────────────────────────────────────────────────────

  const deleteMessage = async (id: string) => {
    await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m))
    );
  };

  // ── Create new conversation ──────────────────────────────────────────────

  const createConversation = async () => {
    if (!selectedMembers.length || !user || !profile) return;
    setCreatingConv(true);
    try {
      const isGroup = selectedMembers.length > 1;
      const type = isGroup ? 'group' : 'direct';

      // Check for existing direct conversation
      if (!isGroup) {
        const otherId = selectedMembers[0].id;
        const { data: existing } = await supabase
          .from('conversations')
          .select(`id, participants:conversation_participants(user_id)`)
          .eq('type', 'direct');
        const match = (existing ?? []).find((c) => {
          const ids = (c.participants as { user_id: string }[]).map((p) => p.user_id);
          return ids.includes(user.id) && ids.includes(otherId) && ids.length === 2;
        });
        if (match) {
          setSelectedConvId(match.id);
          setNewConvOpen(false);
          setSelectedMembers([]);
          setMemberSearch('');
          setShowSidebar(false);
          return;
        }
      }

      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ type, title: isGroup ? (groupTitle || null) : null, created_by: user.id })
        .select()
        .single();

      if (error || !conv) throw error;

      const allParticipants = [user.id, ...selectedMembers.map((m) => m.id)];
      await supabase.from('conversation_participants').insert(
        allParticipants.map((uid) => ({ conversation_id: conv.id, user_id: uid }))
      );

      // Notify recipients (fire and forget)
      notifyNewConversation({
        conversationId: conv.id,
        senderName: profile.full_name,
        senderUserId: user.id,
        recipientUserIds: selectedMembers.map((m) => m.id),
      }).catch(() => {});

      await fetchConversations();
      setSelectedConvId(conv.id);
      setNewConvOpen(false);
      setSelectedMembers([]);
      setMemberSearch('');
      setGroupTitle('');
      setShowSidebar(false);
    } catch {
      toast.error('Failed to create conversation');
    } finally {
      setCreatingConv(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!user) return null;

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-white/10 bg-[#1A1A1A]">
      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

      {/* ── Sidebar ── */}
      <div
        className={`w-full sm:w-72 lg:w-80 flex flex-col border-r border-white/10 shrink-0 ${
          showSidebar ? 'flex' : 'hidden sm:flex'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Messages</h2>
          <Button
            size="sm"
            onClick={() => setNewConvOpen(true)}
            className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] h-8 px-3 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1 px-2 py-2">
          {convLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageSquare className="h-8 w-8 text-white/20" />
              <p className="text-xs text-white/40">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  currentUserId={user.id}
                  isActive={conv.id === selectedConvId}
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    setShowSidebar(false);
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Main panel ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!showSidebar ? 'flex' : 'hidden md:flex'}`}>
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <MessageSquare className="h-12 w-12 text-white/10" />
            <p className="text-sm text-white/30">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <button
                type="button"
                aria-label="Back to conversations"
                className="sm:hidden p-1 text-white/60 hover:text-white"
                onClick={() => setShowSidebar(true)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <Avatar className="h-8 w-8">
                <AvatarImage src={getConversationAvatar(selectedConv, user.id) ?? undefined} />
                <AvatarFallback className="bg-[#2E2E2E] text-[#D4A853] text-xs">
                  {selectedConv.type === 'group'
                    ? <Users className="h-4 w-4" />
                    : initials(getConversationName(selectedConv, user.id))}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm leading-tight truncate">
                  {getConversationName(selectedConv, user.id)}
                </p>
                {selectedConv.type === 'group' && (
                  <p className="text-xs text-white/40">
                    {selectedConv.participants.map((p) => p.profile?.full_name).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4">
              {msgLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <MessageSquare className="h-8 w-8 text-white/20" />
                  <p className="text-xs text-white/40">No messages yet. Say hello!</p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.sender_id === user.id}
                      onEdit={(m) => { setEditingMsg(m); setDraft(m.content ?? ''); }}
                      onDelete={deleteMessage}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="border-t border-white/10 p-3">
              {editingMsg && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[#D4A853]/10 rounded text-xs text-[#D4A853]">
                  <Pencil className="h-3 w-3" />
                  Editing message
                  <button onClick={() => { setEditingMsg(null); setDraft(''); }} className="ml-auto">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingFiles}
                    className="p-2 text-white/40 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5"
                    title="Upload image"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFiles}
                    className="p-2 text-white/40 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5"
                    title="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 min-h-[40px] max-h-32 resize-none bg-[#2E2E2E] border-white/10 text-white text-sm placeholder:text-white/30 focus-visible:ring-[#D4A853]/50"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!draft.trim() || sending}
                  size="sm"
                  className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] h-10 px-3"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── New Conversation Modal ── */}
      <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
        <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">New Message</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedMembers.map((m) => (
                  <Badge
                    key={m.id}
                    className="bg-[#D4A853]/20 text-[#D4A853] border-[#D4A853]/30 gap-1 pr-1"
                  >
                    {m.full_name}
                    <button onClick={() => setSelectedMembers((prev) => prev.filter((x) => x.id !== m.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search business members…"
                className="bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30"
              />
              {memberSearchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/40" />
              )}
            </div>

            {/* Results */}
            {memberResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {memberResults
                  .filter((m) => !selectedMembers.find((s) => s.id === m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedMembers((prev) => [...prev, m]); setMemberSearch(''); setMemberResults([]); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-[#2E2E2E] text-[#D4A853] text-xs">
                          {initials(m.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm text-white">{m.full_name}</p>
                        {m.company && <p className="text-xs text-white/40">{m.company}</p>}
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {/* Group title (when multiple members selected) */}
            {selectedMembers.length > 1 && (
              <Input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group name (optional)"
                className="bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30"
              />
            )}

            <Button
              onClick={createConversation}
              disabled={!selectedMembers.length || creatingConv}
              className="w-full bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold"
            >
              {creatingConv ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start Conversation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
