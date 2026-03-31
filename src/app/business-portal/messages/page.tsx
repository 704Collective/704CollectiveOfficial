'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import Image from 'next/image';
import {
  Send, Search, Users, MessageSquare, X, Check,
  MoreHorizontal, Loader2, ChevronLeft,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string | null;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  participants: Participant[];
}

interface Participant {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender_name: string;
  sender_avatar: string | null;
}

interface DirectoryMember {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  title: string | null;
  company_name: string | null;
}

export default function BusinessMessagesPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const p = profile as any;
  const isSuperAdmin = p?.role === 'super_admin';
  const isAdmin = p?.role === 'admin' || isSuperAdmin;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState('');

  // New conversation
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [directoryMembers, setDirectoryMembers] = useState<DirectoryMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<DirectoryMember[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Load conversations ─────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConvs(true);
    try {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participations || participations.length === 0) {
        setConversations([]);
        setLoadingConvs(false);
        return;
      }

      const convIds = participations.map((p: any) => p.conversation_id);
      const lastReadMap: Record<string, string | null> = {};
      participations.forEach((p: any) => { lastReadMap[p.conversation_id] = p.last_read_at; });

      const { data: convs } = await supabase
        .from('conversations')
        .select('id, type, name, created_by, updated_at')
        .in('id', convIds)
        .order('updated_at', { ascending: false });

      if (!convs) { setLoadingConvs(false); return; }

      // Load participants + last messages
      const enriched = await Promise.all(convs.map(async (conv: any) => {
        const { data: parts } = await supabase
          .from('conversation_participants')
          .select('user_id, profiles(full_name, avatar_url)')
          .eq('conversation_id', conv.id);

        const { data: lastMsgArr } = await supabase
          .from('messages')
          .select('body, created_at')
          .eq('conversation_id', conv.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastRead = lastReadMap[conv.id];
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .is('deleted_at', null)
          .neq('sender_id', user.id)
          .gt('created_at', lastRead || '1970-01-01');

        return {
          id: conv.id,
          type: conv.type,
          name: conv.name,
          created_by: conv.created_by,
          updated_at: conv.updated_at,
          last_message: lastMsgArr?.[0]?.body || null,
          last_message_at: lastMsgArr?.[0]?.created_at || null,
          unread_count: unreadCount || 0,
          participants: (parts || []).map((p: any) => ({
            user_id: p.user_id,
            full_name: p.profiles?.full_name || 'Member',
            avatar_url: p.profiles?.avatar_url || null,
          })),
        };
      }));

      setConversations(enriched);
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Handle ?dm= query param (from directory)
  useEffect(() => {
    const dmUserId = searchParams.get('dm');
    const convId = searchParams.get('conversation');
    if (dmUserId && user && conversations.length > 0) {
      const existing = conversations.find(c =>
        c.type === 'direct' &&
        c.participants.some(p => p.user_id === dmUserId)
      );
      if (existing) {
        setActiveConv(existing);
      } else {
        // Open new DM dialog pre-selecting this user
        openDirectDM(dmUserId);
      }
    }
    if (convId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === convId);
      if (conv) setActiveConv(conv);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations]);

  // ── Load messages ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from('messages')
      .select(`
        id, conversation_id, sender_id, body, created_at, edited_at, deleted_at,
        profiles(full_name, avatar_url)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages((data || []).map((m: any) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      edited_at: m.edited_at,
      deleted_at: m.deleted_at,
      sender_name: m.profiles?.full_name || 'Member',
      sender_avatar: m.profiles?.avatar_url || null,
    })));
    setLoadingMsgs(false);

    // Mark as read
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('user_id', user!.id);
  }, [user]);

  useEffect(() => {
    if (!activeConv) return;
    fetchMessages(activeConv.id);
  }, [activeConv, fetchMessages]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConv) return;
    const channel = supabase
      .channel(`messages:${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async (payload) => {
        const m = payload.new as any;
        // Fetch sender info
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', m.sender_id)
          .maybeSingle();
        setMessages(prev => [...prev, {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          body: m.body,
          created_at: m.created_at,
          edited_at: null,
          deleted_at: null,
          sender_name: prof?.full_name || 'Member',
          sender_avatar: prof?.avatar_url || null,
        }]);
        // Mark read immediately if active
        await supabase
          .from('conversation_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', activeConv.id)
          .eq('user_id', user!.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConv, user]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!messageInput.trim() || !activeConv || !user) return;
    const body = messageInput.trim();
    setMessageInput('');
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        body,
      });
      if (error) throw error;
      // Update conversation updated_at
      await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConv.id);
      // Update unread count in list
      setConversations(prev => prev.map(c => c.id === activeConv.id
        ? { ...c, last_message: body, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : c
      ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } catch {
      toast.error('Failed to send message');
      setMessageInput(body);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ── Load directory members for new conv ────────────────────────────────────
  const loadDirectoryMembers = async () => {
    const { data } = await supabase
      .from('business_profiles')
      .select(`
        user_id, company_name, title,
        profiles!inner(full_name, avatar_url, member_type, deleted_at)
      `)
      .filter('profiles.deleted_at', 'is', null)
      .filter('profiles.member_type', 'eq', 'business');

    setDirectoryMembers((data || [])
      .filter((bp: any) => bp.user_id !== user?.id)
      .map((bp: any) => ({
        user_id: bp.user_id,
        full_name: bp.profiles?.full_name || 'Member',
        avatar_url: bp.profiles?.avatar_url || null,
        title: bp.title,
        company_name: bp.company_name,
      }))
    );
  };

  const openDirectDM = async (targetUserId?: string) => {
    await loadDirectoryMembers();
    setShowNewDM(true);
    if (targetUserId) {
      // Pre-select
      const { data: prof } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', targetUserId).maybeSingle();
      if (prof) {
        setSelectedMembers([{ user_id: targetUserId, full_name: prof.full_name || 'Member', avatar_url: prof.avatar_url, title: null, company_name: null }]);
      }
    }
  };

  // ── Create DM ──────────────────────────────────────────────────────────────
  const createDM = async () => {
    if (selectedMembers.length !== 1 || !user) return;
    const target = selectedMembers[0];

    // Check if DM already exists
    const existing = conversations.find(c =>
      c.type === 'direct' && c.participants.some(p => p.user_id === target.user_id)
    );
    if (existing) {
      setActiveConv(existing);
      setShowNewDM(false);
      setSelectedMembers([]);
      return;
    }

    setCreatingConv(true);
    try {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ type: 'direct', created_by: user.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: target.user_id },
      ]);

      // Send initial email notification to target
      await supabase.functions.invoke('send-email', {
        body: {
          to: target.user_id,
          template: 'new_message',
          data: {
            senderName: p?.full_name || 'A member',
            portalUrl: `${window.location.origin}/business-portal/messages?conversation=${conv.id}`,
          },
        },
      }).catch(() => {});

      const newConv: Conversation = {
        id: conv.id, type: 'direct', name: null,
        created_by: user.id, updated_at: conv.created_at,
        last_message: null, last_message_at: null, unread_count: 0,
        participants: [
          { user_id: user.id, full_name: p?.full_name || 'You', avatar_url: p?.avatar_url || null },
          { user_id: target.user_id, full_name: target.full_name, avatar_url: target.avatar_url },
        ],
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConv(newConv);
      setShowNewDM(false);
      setSelectedMembers([]);
    } catch {
      toast.error('Failed to create conversation');
    } finally {
      setCreatingConv(false);
    }
  };

  // ── Create group ───────────────────────────────────────────────────────────
  const createGroup = async () => {
    if (selectedMembers.length < 2 || !user || !groupName.trim()) return;
    setCreatingConv(true);
    try {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ type: 'group', name: groupName.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: user.id },
        ...selectedMembers.map(m => ({ conversation_id: conv.id, user_id: m.user_id })),
      ]);

      // Notify all participants
      for (const m of selectedMembers) {
        supabase.functions.invoke('send-email', {
          body: {
            to: m.user_id,
            template: 'group_added',
            data: {
              groupName: groupName.trim(),
              addedBy: p?.full_name || 'A member',
              portalUrl: `${window.location.origin}/business-portal/messages?conversation=${conv.id}`,
            },
          },
        }).catch(() => {});
      }

      const newConv: Conversation = {
        id: conv.id, type: 'group', name: groupName.trim(),
        created_by: user.id, updated_at: conv.created_at,
        last_message: null, last_message_at: null, unread_count: 0,
        participants: [
          { user_id: user.id, full_name: p?.full_name || 'You', avatar_url: p?.avatar_url || null },
          ...selectedMembers.map(m => ({ user_id: m.user_id, full_name: m.full_name, avatar_url: m.avatar_url })),
        ],
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConv(newConv);
      setShowNewGroup(false);
      setSelectedMembers([]);
      setGroupName('');
    } catch {
      toast.error('Failed to create group');
    } finally {
      setCreatingConv(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getConvName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name || 'Group Chat';
    const other = conv.participants.find(p => p.user_id !== user?.id);
    return other?.full_name || 'Direct Message';
  };

  const getConvAvatar = (conv: Conversation) => {
    if (conv.type === 'group') return null;
    return conv.participants.find(p => p.user_id !== user?.id)?.avatar_url || null;
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const formatMsgTime = (ts: string) => {
    const d = new Date(ts);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d');
  };

  const filteredConvs = conversations.filter(c =>
    getConvName(c).toLowerCase().includes(search.toLowerCase())
  );

  const filteredMembers = directoryMembers.filter(m =>
    m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.company_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.title?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const canRemoveFromGroup = (conv: Conversation, participantId: string) => {
    if (participantId === user?.id) return false; // Can't remove yourself
    if (isSuperAdmin) return true;
    if (conv.created_by === user?.id) return true;
    return false;
  };

  const removeFromGroup = async (conv: Conversation, participantId: string) => {
    await supabase
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conv.id)
      .eq('user_id', participantId);
    setConversations(prev => prev.map(c => c.id === conv.id
      ? { ...c, participants: c.participants.filter(p => p.user_id !== participantId) }
      : c
    ));
    if (activeConv?.id === conv.id) {
      setActiveConv(prev => prev ? { ...prev, participants: prev.participants.filter(p => p.user_id !== participantId) } : null);
    }
    toast.success('Removed from group');
  };

  return (
    <>
      <BusinessPortalNav />
      <div style={{
        height: 'calc(100vh - 128px)',
        display: 'flex',
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '0 16px',
        gap: '0',
      }}>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div style={{
          width: activeConv ? '0' : '100%',
          maxWidth: '340px',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.2s',
          flexShrink: 0,
        }}
          className="sm:!w-[340px]"
        >
          {/* Sidebar header */}
          <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '1.125rem' }}>Messages</h2>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await loadDirectoryMembers(); setShowNewDM(true); }}
                  title="New DM"
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => { await loadDirectoryMembers(); setShowNewGroup(true); }}
                  title="New group"
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  <Users className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft: '32px', fontSize: '0.875rem',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#FFFFFF',
                }}
              />
            </div>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingConvs && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#C6A664' }} />
              </div>
            )}
            {!loadingConvs && filteredConvs.length === 0 && (
              <div className="text-center py-12 px-4">
                <MessageSquare className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
                  No conversations yet. Start a DM or group chat.
                </p>
              </div>
            )}
            {filteredConvs.map(conv => {
              const isActive = activeConv?.id === conv.id;
              const convName = getConvName(conv);
              const convAvatar = getConvAvatar(conv);
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConv(conv)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    width: '100%', padding: '12px 16px', textAlign: 'left',
                    backgroundColor: isActive ? 'rgba(198,166,100,0.08)' : 'transparent',
                    borderLeft: isActive ? '2px solid #C6A664' : '2px solid transparent',
                    border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '44px', height: '44px', borderRadius: conv.type === 'group' ? '12px' : '50%',
                    flexShrink: 0, overflow: 'hidden', position: 'relative',
                    backgroundColor: conv.type === 'group' ? 'rgba(198,166,100,0.15)' : 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {convAvatar ? (
                      <Image src={convAvatar} alt={convName} fill style={{ objectFit: 'cover' }} unoptimized />
                    ) : conv.type === 'group' ? (
                      <Users style={{ width: '18px', height: '18px', color: '#C6A664' }} />
                    ) : (
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
                        {getInitials(convName)}
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center justify-between gap-2">
                      <p style={{
                        fontWeight: conv.unread_count > 0 ? 700 : 500,
                        color: '#FFFFFF', fontSize: '0.9375rem',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {convName}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {conv.last_message_at && (
                          <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.25)' }}>
                            {formatMsgTime(conv.last_message_at)}
                          </span>
                        )}
                        {conv.unread_count > 0 && (
                          <div style={{
                            minWidth: '18px', height: '18px', borderRadius: '9px',
                            backgroundColor: '#C6A664', color: '#1A1A1A',
                            fontSize: '0.625rem', fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 4px',
                          }}>
                            {conv.unread_count}
                          </div>
                        )}
                      </div>
                    </div>
                    {conv.last_message && (
                      <p style={{
                        fontSize: '0.8125rem',
                        color: conv.unread_count > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        marginTop: '2px',
                      }}>
                        {conv.last_message}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat panel ───────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-14 h-14 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.9375rem' }}>
                  Select a conversation or start a new one
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <button
                  onClick={() => setActiveConv(null)}
                  className="sm:hidden"
                  style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div style={{
                  width: '38px', height: '38px',
                  borderRadius: activeConv.type === 'group' ? '10px' : '50%',
                  flexShrink: 0, overflow: 'hidden', position: 'relative',
                  backgroundColor: activeConv.type === 'group' ? 'rgba(198,166,100,0.15)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {getConvAvatar(activeConv) ? (
                    <Image src={getConvAvatar(activeConv)!} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
                  ) : activeConv.type === 'group' ? (
                    <Users style={{ width: '16px', height: '16px', color: '#C6A664' }} />
                  ) : (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
                      {getInitials(getConvName(activeConv))}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.9375rem' }}>
                    {getConvName(activeConv)}
                  </p>
                  {activeConv.type === 'group' && (
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                      {activeConv.participants.length} members
                    </p>
                  )}
                </div>

                {/* Group actions */}
                {activeConv.type === 'group' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backgroundColor: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.4)',
                      }}>
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Participants</p>
                        {activeConv.participants.map(participant => (
                          <div key={participant.user_id} className="flex items-center justify-between py-1">
                            <span className="text-sm">{participant.full_name}</span>
                            {canRemoveFromGroup(activeConv, participant.user_id) && (
                              <button
                                onClick={() => removeFromGroup(activeConv, participant.user_id)}
                                className="text-xs text-destructive hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {loadingMsgs && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#C6A664' }} />
                  </div>
                )}
                {messages.filter(m => !m.deleted_at).map((msg, i) => {
                  const isOwn = msg.sender_id === user?.id;
                  const prevMsg = messages[i - 1];
                  const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
                  const showName = !isOwn && (activeConv.type === 'group') && showAvatar;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: isOwn ? 'row-reverse' : 'row',
                        alignItems: 'flex-end',
                        gap: '8px',
                        marginTop: showAvatar ? '12px' : '2px',
                      }}
                    >
                      {/* Avatar for others */}
                      {!isOwn && (
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          overflow: 'hidden', position: 'relative',
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          display: showAvatar ? 'flex' : 'block',
                          alignItems: 'center', justifyContent: 'center',
                          visibility: showAvatar ? 'visible' : 'hidden',
                        }}>
                          {msg.sender_avatar ? (
                            <Image src={msg.sender_avatar} alt={msg.sender_name} fill style={{ objectFit: 'cover' }} unoptimized />
                          ) : (
                            <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
                              {getInitials(msg.sender_name)}
                            </span>
                          )}
                        </div>
                      )}

                      <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                        {showName && (
                          <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)', marginBottom: '4px', paddingLeft: '12px' }}>
                            {msg.sender_name}
                          </p>
                        )}
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          backgroundColor: isOwn ? '#C6A664' : 'rgba(255,255,255,0.08)',
                          color: isOwn ? '#1A1A1A' : '#FFFFFF',
                          fontSize: '0.9375rem',
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {msg.body}
                        </div>
                        <p style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', marginTop: '3px', paddingLeft: '4px', paddingRight: '4px' }}>
                          {format(new Date(msg.created_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', gap: '10px', alignItems: 'flex-end',
              }}>
                <input
                  ref={inputRef}
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={`Message ${getConvName(activeConv)}...`}
                  style={{
                    flex: 1, padding: '10px 16px',
                    borderRadius: '24px',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#FFFFFF', fontSize: '0.9375rem',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageInput.trim() || sending}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                    backgroundColor: messageInput.trim() ? '#C6A664' : 'rgba(255,255,255,0.08)',
                    border: 'none',
                    cursor: messageInput.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {sending
                    ? <Loader2 style={{ width: '16px', height: '16px', color: '#1A1A1A', animation: 'spin 1s linear infinite' }} />
                    : <Send style={{ width: '16px', height: '16px', color: messageInput.trim() ? '#1A1A1A' : 'rgba(255,255,255,0.2)' }} />
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── New DM Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showNewDM} onOpenChange={v => { setShowNewDM(v); if (!v) { setSelectedMembers([]); setMemberSearch(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Search members..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              autoFocus
            />
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {filteredMembers.map(m => {
                const isSelected = selectedMembers.some(s => s.user_id === m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => setSelectedMembers(isSelected ? [] : [m])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '8px 4px', borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(198,166,100,0.1)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                      overflow: 'hidden', position: 'relative',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {m.avatar_url ? (
                        <Image src={m.avatar_url} alt={m.full_name} fill style={{ objectFit: 'cover' }} unoptimized />
                      ) : (
                        <span className="text-xs font-bold">{getInitials(m.full_name)}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="text-sm font-medium truncate">{m.full_name}</p>
                      {(m.title || m.company_name) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[m.title, m.company_name].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: '#C6A664' }} />}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDM(false)}>Cancel</Button>
            <Button onClick={createDM} disabled={selectedMembers.length !== 1 || creatingConv}>
              {creatingConv ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Open Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Group Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewGroup} onOpenChange={v => { setShowNewGroup(v); if (!v) { setSelectedMembers([]); setMemberSearch(''); setGroupName(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Group Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Group name..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map(m => (
                  <div key={m.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    backgroundColor: 'rgba(198,166,100,0.15)',
                    border: '1px solid rgba(198,166,100,0.3)',
                    borderRadius: '20px', padding: '3px 10px 3px 6px',
                  }}>
                    <span className="text-xs font-medium" style={{ color: '#C6A664' }}>{m.full_name}</span>
                    <button
                      onClick={() => setSelectedMembers(prev => prev.filter(s => s.user_id !== m.user_id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C6A664', padding: 0, lineHeight: 1 }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Input
              placeholder="Search members to add..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
            />
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {filteredMembers.map(m => {
                const isSelected = selectedMembers.some(s => s.user_id === m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => setSelectedMembers(prev =>
                      isSelected ? prev.filter(s => s.user_id !== m.user_id) : [...prev, m]
                    )}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '8px 4px', borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(198,166,100,0.1)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      overflow: 'hidden', position: 'relative',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {m.avatar_url ? (
                        <Image src={m.avatar_url} alt={m.full_name} fill style={{ objectFit: 'cover' }} unoptimized />
                      ) : (
                        <span className="text-xs font-bold">{getInitials(m.full_name)}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="text-sm font-medium truncate">{m.full_name}</p>
                      {(m.title || m.company_name) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[m.title, m.company_name].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: '#C6A664' }} />}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewGroup(false)}>Cancel</Button>
            <Button
              onClick={createGroup}
              disabled={selectedMembers.length < 2 || !groupName.trim() || creatingConv}
            >
              {creatingConv ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Group ({selectedMembers.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @media (min-width: 640px) {
          .sm\\!w-\\[340px\\] { width: 340px !important; }
        }
      `}</style>
    </>
  );
}