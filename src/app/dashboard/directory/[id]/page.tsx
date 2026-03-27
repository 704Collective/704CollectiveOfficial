'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { BusinessCard } from '@/components/portal/BusinessCard';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { notifyNewConversation } from '@/app/actions/notifyNewConversation';
import { toast } from 'sonner';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Share2,
  Linkedin,
  Globe,
  Phone,
  Mail,
  ChevronLeft,
  Loader2,
  Calendar,
  Building2,
  Briefcase,
} from 'lucide-react';

interface MemberProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  member_type: string | null;
  title: string | null;
  company: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  member_since: string | null;
  subscription_status: string | null;
  membership_override: boolean;
}

interface BusinessCardData {
  id: string;
  user_id: string;
  public_id: string;
  full_name: string | null;
  title: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
  custom_fields: Record<string, string> | null;
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

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile: currentProfile, loading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('Member Profile');

  const [member, setMember] = useState<MemberProfile | null>(null);
  const [businessCard, setBusinessCard] = useState<BusinessCardData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [messagingLoading, setMessagingLoading] = useState(false);

  const isBusinessMember = currentProfile?.member_type === 'business';
  const canAccess = isBusinessMember || isAdmin || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!canAccess) { router.replace('/dashboard'); }
  }, [loading, user, canAccess, router]);

  const fetchMember = useCallback(async () => {
    if (!id) return;
    setPageLoading(true);
    try {
      const [profileRes, cardRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, member_type, title, company, industry, phone, email, linkedin_url, website_url, member_since, subscription_status, membership_override')
          .eq('id', id)
          .is('deleted_at', null)
          .single(),
        supabase
          .from('business_cards')
          .select('*')
          .eq('user_id', id)
          .maybeSingle(),
      ]);
      setMember((profileRes.data as MemberProfile) ?? null);
      setBusinessCard((cardRes.data as BusinessCardData) ?? null);
    } finally {
      setPageLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchMember(); }, [fetchMember]);

  const handleMessage = async () => {
    if (!user || !currentProfile || !member) return;
    setMessagingLoading(true);
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select(`id, participants:conversation_participants(user_id)`)
        .eq('type', 'direct');

      const match = (existing ?? []).find((c) => {
        const ids = (c.participants as { user_id: string }[]).map((p) => p.user_id);
        return ids.includes(user.id) && ids.includes(member.id) && ids.length === 2;
      });

      if (match) { router.push('/dashboard/messages'); return; }

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
        senderName: memberDisplayName(currentProfile.full_name),
        senderUserId: user.id,
        recipientUserIds: [member.id],
      }).catch(() => {});

      router.push('/dashboard/messages');
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setMessagingLoading(false);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/dashboard/directory/${id}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Profile URL copied to clipboard'),
      () => toast.error('Failed to copy URL')
    );
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <main className={cn(DASHBOARD_MAIN)}>
          <Skeleton className="h-8 w-32 bg-[#2E2E2E] mb-8" />
          <div className="flex gap-6">
            <Skeleton className="h-24 w-24 rounded-full bg-[#2E2E2E]" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-48 bg-[#2E2E2E]" />
              <Skeleton className="h-4 w-36 bg-[#2E2E2E]" />
              <Skeleton className="h-4 w-28 bg-[#2E2E2E]" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !canAccess) return null;

  if (!member) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <main className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-white/50">Member not found.</p>
          <Button variant="link" className="text-[#D4A853] mt-4" onClick={() => router.back()}>
            Go back
          </Button>
        </main>
      </div>
    );
  }

  const roleBadge =
    member.role === 'super_admin'
      ? { label: 'Super Admin', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
      : member.role === 'admin'
      ? { label: 'Admin', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
      : null;

  const memberTypeBadge =
    member.member_type === 'business'
      ? { label: 'Business Member', color: 'bg-[#D4A853]/20 text-[#D4A853] border-[#D4A853]/30' }
      : member.member_type === 'social'
      ? { label: 'Social Member', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
      : null;

  const isOwnProfile = user.id === member.id;

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main className={cn(DASHBOARD_MAIN)}>
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex w-full items-center justify-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white sm:w-auto sm:justify-start"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Directory
        </button>

        {/* Profile card */}
        <div className="bg-[#2E2E2E] border border-white/10 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Avatar */}
            <Avatar className="h-24 w-24 ring-4 ring-[#D4A853]/20 shrink-0">
              <AvatarImage src={member.avatar_url ?? undefined} alt={memberDisplayName(member.full_name)} />
              <AvatarFallback className="bg-[#1A1A1A] text-[#D4A853] text-3xl">
                {initialsFromFullName(member.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">{memberDisplayName(member.full_name)}</h1>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {roleBadge && (
                      <Badge className={`border ${roleBadge.color}`}>{roleBadge.label}</Badge>
                    )}
                    {memberTypeBadge && (
                      <Badge className={`border ${memberTypeBadge.color}`}>{memberTypeBadge.label}</Badge>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-2 shrink-0">
                  {!isOwnProfile && (
                    <Button
                      onClick={handleMessage}
                      disabled={messagingLoading}
                      className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold gap-2"
                    >
                      {messagingLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      Message
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleShare}
                    className="border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent gap-2"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-8 pt-6 border-t border-white/10">
            {member.title && (
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Title" value={member.title} />
            )}
            {member.company && (
              <InfoRow icon={<Building2 className="h-4 w-4" />} label="Company" value={member.company} />
            )}
            {member.industry && (
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Industry" value={member.industry} />
            )}
            {member.email && (
              <InfoRow
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={member.email}
                href={`mailto:${member.email}`}
              />
            )}
            {member.phone && (
              <InfoRow
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={member.phone}
                href={`tel:${member.phone}`}
              />
            )}
            {member.linkedin_url && (
              <InfoRow
                icon={<Linkedin className="h-4 w-4" />}
                label="LinkedIn"
                value="View Profile"
                href={member.linkedin_url}
                external
              />
            )}
            {member.website_url && (
              <InfoRow
                icon={<Globe className="h-4 w-4" />}
                label="Website"
                value={(member.website_url ?? '').replace(/^https?:\/\//, '')}
                href={member.website_url}
                external
              />
            )}
            {member.member_since && (
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Member Since"
                value={format(new Date(member.member_since), 'MMMM yyyy')}
              />
            )}
          </div>
        </div>

        {/* Business card section */}
        <div className="mt-8">
          <BusinessCard
            userId={member.id}
            card={businessCard}
            isOwner={isOwnProfile}
            onCardUpdated={fetchMember}
          />
        </div>
      </main>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/40 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-white/40 leading-none mb-0.5">{label}</p>
        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="text-sm text-[#D4A853] hover:underline truncate block"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-white/80 truncate">{value}</p>
        )}
      </div>
    </div>
  );
}
