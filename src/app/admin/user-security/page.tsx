'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Search, ChevronDown, ChevronRight, Trash2, MessageSquare, Users,
  Loader2, Shield, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  member_type: string | null;
}

interface ConversationSummary {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  updated_at: string;
  participants: { user_id: string; profile: { full_name: string } | null }[];
  message_count: number;
}

interface MessageRow {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  deleted_at: string | null;
  sender: { full_name: string; avatar_url: string | null } | null;
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

// ── Conversation viewer ────────────────────────────────────────────────────

function ConversationViewer({
  conv,
  focusUserId,
}: {
  conv: ConversationSummary;
  focusUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMessages = async () => {
    if (messages.length) return;
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at, deleted_at, sender:profiles(full_name, avatar_url)')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as unknown as MessageRow[]);
    setLoading(false);
  };

  const toggle = () => {
    if (!expanded) loadMessages();
    setExpanded((v) => !v);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', msgId);
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m));
    toast.success('Message deleted');
  };

  const convName = conv.type === 'group'
    ? (conv.title || `Group (${conv.participants.length} members)`)
    : conv.participants.filter((p) => p.user_id !== focusUserId).map((p) => p.profile?.full_name || 'Unknown').join(', ');

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/50 transition-colors text-left"
      >
        {conv.type === 'group'
          ? <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          : <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{convName}</p>
          <p className="text-xs text-muted-foreground">
            {conv.message_count} messages · Last active {format(new Date(conv.updated_at), 'MMM d, yyyy')}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No messages</div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-3 px-4 py-3 ${msg.deleted_at ? 'opacity-40' : ''}`}>
                  <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                    <AvatarImage src={msg.sender?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px]">{initials(msg.sender?.full_name || '?')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-foreground">{msg.sender?.full_name}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(msg.created_at), 'MMM d, h:mm a')}</span>
                      {msg.deleted_at && <Badge variant="destructive" className="text-[10px] py-0">Deleted</Badge>}
                    </div>
                    {msg.deleted_at ? (
                      <p className="text-xs text-muted-foreground italic">Message deleted</p>
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content || <em className="text-muted-foreground">[Media/attachment]</em>}</p>
                    )}
                  </div>
                  {!msg.deleted_at && (
                    <button onClick={() => deleteMessage(msg.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Member row ─────────────────────────────────────────────────────────────

function MemberSecurityRow({ member }: { member: MemberRow }) {
  const [expanded, setExpanded] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadConversations = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      // Get all conversation IDs this member is in
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', member.id);

      const convIds = (participantRows ?? []).map((r) => r.conversation_id);
      if (!convIds.length) { setLoaded(true); setLoading(false); return; }

      const { data: convs } = await supabase
        .from('conversations')
        .select('id, type, title, updated_at, participants:conversation_participants(user_id, profile:profiles(full_name))')
        .in('id', convIds)
        .order('updated_at', { ascending: false });

      const convList = (convs ?? []) as unknown as (ConversationSummary & { participants: { user_id: string; profile: { full_name: string } | null }[] })[];

      // Get message counts
      const countResults = await Promise.all(
        convList.map((c) =>
          supabase.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', c.id).is('deleted_at', null)
        )
      );

      setConversations(convList.map((c, i) => ({
        ...c,
        message_count: countResults[i].count ?? 0,
      })));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!expanded) loadConversations();
    setExpanded((v) => !v);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-4 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={member.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm leading-tight">{member.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
          {member.member_type || member.role}
        </Badge>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border bg-accent/20 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No conversations</p>
          ) : (
            conversations.map((conv) => (
              <ConversationViewer key={conv.id} conv={conv} focusUserId={member.id} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function UserSecurityPage() {
  const { user, loading, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('User Security');

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || !isSuperAdmin) router.replace('/admin');
  }, [loading, user, isSuperAdmin, router]);

  const fetchMembers = useCallback(async () => {
    setPageLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role, member_type')
      .or('member_type.eq.business,role.eq.admin,role.eq.super_admin')
      .is('deleted_at', null)
      .order('full_name', { ascending: true });
    setMembers((data ?? []) as MemberRow[]);
    setPageLoading(false);
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  if (loading || pageLoading) {
    return (
      <AdminLayout title="User Security">
        <div className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </AdminLayout>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <AdminLayout title="User Security">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Review member conversations and moderate messages</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMembers} className="gap-1.5 text-xs shrink-0">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <Shield className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            This panel allows super admins to review all member conversations for policy violations. 
            Use responsibly and in accordance with your privacy policy.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or email…"
            className="pl-9" />
        </div>

        {/* Member list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search ? 'No members match your search' : 'No members found'}
            </div>
          ) : (
            filtered.map((member) => (
              <MemberSecurityRow key={member.id} member={member} />
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
