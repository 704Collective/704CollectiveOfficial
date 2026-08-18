'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { notifyNewConversation } from '@/app/actions/notifyNewConversation';
import { toast } from 'sonner';
import { Search, MessageSquare, User, Loader2 } from 'lucide-react';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';

interface DirectoryMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  member_type: string | null;
  title: string | null;
  company: string | null;
  member_since: string | null;
  is_founding_member?: boolean | null;
  hubs?: string[];
}

function memberDisplayName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  return t && t.length > 0 ? t : 'Member';
}

function initialsFromFullName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  if (!t) return 'M';
  const parts = t.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'M';
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'M';
}

function MemberCard({
  member,
  onMessage,
  messagingId,
}: {
  member: DirectoryMember;
  onMessage: (member: DirectoryMember) => void;
  messagingId: string | null;
}) {
  const router = useRouter();
  const isMessaging = messagingId === member.id;

  const roleBadge =
    member.role === 'super_admin'
      ? { label: 'Super Admin', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
      : member.role === 'admin'
      ? { label: 'Admin', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
      : null;

  return (
    <div className="card-elevated p-4 flex flex-col h-full">
      <div
        className="flex items-start gap-3 cursor-pointer flex-1"
        onClick={() => router.push(`/dashboard/directory/${member.id}`)}
      >
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          {member.avatar_url ? (
            <Avatar className="w-12 h-12 shrink-0">
              <AvatarImage src={member.avatar_url} alt={memberDisplayName(member.full_name)} />
              <AvatarFallback className="text-sm font-bold text-primary bg-primary/10">
                {initialsFromFullName(member.full_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-sm font-bold text-primary">
              {initialsFromFullName(member.full_name)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground text-sm truncate">{memberDisplayName(member.full_name)}</p>
          {member.title && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{member.title}</p>
          )}
          {member.company && (
            <p className="text-xs text-muted-foreground truncate">{member.company}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {roleBadge && (
              <Badge className={`text-[10px] px-1.5 py-0 border ${roleBadge.color}`}>
                {roleBadge.label}
              </Badge>
            )}
            {member.is_founding_member && (
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-yellow-500/30 text-yellow-400">
                Founder
              </Badge>
            )}
            {member.member_type === 'business' && (
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-primary/20 text-primary">
                Business
              </Badge>
            )}
            {member.member_type === 'social' && (
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-muted-foreground/20 text-muted-foreground">
                Social
              </Badge>
            )}
            {member.hubs && member.hubs.map((hubTitle) => (
              <Badge key={hubTitle} variant="outline" className="text-[10px] px-2 py-0 border-[#C6A664]/30 text-[#C6A664]">
                {hubTitle}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs gap-1.5"
          onClick={() => router.push(`/dashboard/directory/${member.id}`)}
        >
          <User className="h-3.5 w-3.5" /> View Profile
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isMessaging}
          className="flex-1 text-xs gap-1.5"
          onClick={() => onMessage(member)}
        >
          {isMessaging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          Message
        </Button>
      </div>
    </div>
  );
}

export function MemberDirectory() {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [messagingId, setMessagingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, member_type, title, company, member_since, is_founding_member')
        .or('member_type.eq.business,role.eq.admin,role.eq.super_admin')
        .is('deleted_at', null)
        .eq('is_internal', false)
        .order('full_name', { ascending: true });
      const memberIds = (data ?? []).map((m) => m.id);
      let hubMap = new Map<string, string[]>();
      if (memberIds.length > 0) {
        const { data: hubRows } = await supabase
          .from('hub_members')
          .select('user_id, hubs(title)')
          .in('user_id', memberIds);
        if (hubRows) {
          for (const row of (hubRows as unknown) as { user_id: string; hubs: { title: string } | null }[]) {
            if (!row.hubs) continue;
            const existing = hubMap.get(row.user_id) ?? [];
            existing.push(row.hubs.title);
            hubMap.set(row.user_id, existing);
          }
        }
      }
      setMembers(
        (data ?? []).map((m) => ({ ...(m as DirectoryMember), hubs: hubMap.get(m.id) ?? [] }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.full_name?.toLowerCase() ?? '').includes(q) ||
      (m.company?.toLowerCase() ?? '').includes(q) ||
      (m.title?.toLowerCase() ?? '').includes(q)
    );
  });

  const handleMessage = async (member: DirectoryMember) => {
    if (!user || !profile) return;
    setMessagingId(member.id);
    try {
      // Check for existing direct conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select(`id, participants:conversation_participants(user_id)`)
        .eq('type', 'direct');

      const match = (existing ?? []).find((c) => {
        const ids = (c.participants as { user_id: string }[]).map((p) => p.user_id);
        return ids.includes(user.id) && ids.includes(member.id) && ids.length === 2;
      });

      if (match) {
        router.push('/dashboard/messages');
        return;
      }

      // Create new conversation
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ type: 'direct', created_by: user.id })
        .select()
        .single();

      if (error || !conv) throw error;

      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: member.id },
      ]);

      notifyNewConversation({
        conversationId: conv.id,
        senderName: memberDisplayName(profile.full_name),
        senderUserId: user.id,
        recipientUserIds: [member.id],
      }).catch(() => {});

      router.push('/dashboard/messages');
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setMessagingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-white">Member Directory</h1>
          <p className="mt-1 text-sm text-white/50">
            {loading ? '…' : `${filtered.length} business member${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-md sm:mx-0 sm:max-w-none sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, title…"
            className="pl-9 bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#C6A664]/50"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl bg-[#2E2E2E]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <User className="h-12 w-12 text-white/10" />
          <p className="text-white/40 text-sm">
            {search ? 'No members match your search' : 'No members yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onMessage={handleMessage}
              messagingId={messagingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
