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

interface DirectoryMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  member_type: string | null;
  title: string | null;
  company: string | null;
  member_since: string | null;
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

  const memberTypeBadge =
    member.member_type === 'business'
      ? { label: 'Business', color: 'bg-[#D4A853]/20 text-[#D4A853] border-[#D4A853]/30' }
      : member.member_type === 'social'
      ? { label: 'Social', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
      : null;

  return (
    <div className="bg-[#2E2E2E] border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:border-[#D4A853]/30 transition-colors">
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={() => router.push(`/dashboard/directory/${member.id}`)}
      >
        <Avatar className="h-14 w-14 shrink-0 ring-2 ring-white/10">
          <AvatarImage src={member.avatar_url ?? undefined} alt={memberDisplayName(member.full_name)} />
          <AvatarFallback className="bg-[#1A1A1A] text-[#D4A853] text-lg">
            {initialsFromFullName(member.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white leading-tight truncate">{memberDisplayName(member.full_name)}</p>
          {member.title && (
            <p className="text-sm text-white/60 truncate mt-0.5">{member.title}</p>
          )}
          {member.company && (
            <p className="text-xs text-white/40 truncate">{member.company}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {roleBadge && (
              <Badge className={`text-[10px] px-1.5 py-0 border ${roleBadge.color}`}>
                {roleBadge.label}
              </Badge>
            )}
            {memberTypeBadge && (
              <Badge className={`text-[10px] px-1.5 py-0 border ${memberTypeBadge.color}`}>
                {memberTypeBadge.label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent text-xs gap-1.5"
          onClick={() => router.push(`/dashboard/directory/${member.id}`)}
        >
          <User className="h-3.5 w-3.5" /> View Profile
        </Button>
        <Button
          size="sm"
          disabled={isMessaging}
          className="flex-1 bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30 text-xs gap-1.5"
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
        .select('id, full_name, avatar_url, role, member_type, title, company, member_since')
        .or('member_type.eq.business,role.eq.admin,role.eq.super_admin')
        .is('deleted_at', null)
        .order('full_name', { ascending: true });
      setMembers((data ?? []) as DirectoryMember[]);
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
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Member Directory</h1>
          <p className="text-sm text-white/50 mt-1">
            {loading ? '…' : `${filtered.length} business member${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, title…"
            className="pl-9 bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#D4A853]/50"
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
