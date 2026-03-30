'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, MessageCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { ensureAdminDirectConversation } from '@/app/actions/adminPartnerActions';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

type Listing = {
  id: string;
  user_id: string;
  company_name: string;
  description: string;
  website: string | null;
  phone: string | null;
  logo_url: string | null;
  photo_urls: string[];
  partner_types: string[];
};

const TYPE_LABEL: Record<string, string> = {
  vendor: 'Vendor',
  venue: 'Venue',
  sponsor: 'Sponsor',
  partner: 'Partner',
  general: 'Partner',
};

function typeLabel(t: string) {
  return TYPE_LABEL[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export default function PartnerListingDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user, profile, loading, isAdmin, isSuperAdmin, isActiveMember, isBusinessMember } = useAuth();

  const isPartnerAccount = profile?.member_type === 'partner';
  const canAccess =
    (!isPartnerAccount && isBusinessMember && isActiveMember) || isAdmin || isSuperAdmin;

  const [listing, setListing] = useState<Listing | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [msgBusy, setMsgBusy] = useState(false);

  usePageTitle(listing?.company_name ?? 'Partner');

  const load = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    setNotFound(false);
    try {
      const { data: row, error } = await supabase.from('partner_listings').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) {
        setListing(null);
        setNotFound(true);
        return;
      }
      const { data: owner } = await supabase
        .from('profiles')
        .select('partner_status')
        .eq('id', row.user_id)
        .maybeSingle();
      if (owner?.partner_status !== 'approved') {
        setListing(null);
        setNotFound(true);
        return;
      }
      setListing(row as Listing);
    } catch {
      setNotFound(true);
      setListing(null);
    } finally {
      setPageLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (isPartnerAccount) {
      router.replace('/partner-portal');
      return;
    }
    if (!canAccess) {
      router.replace('/dashboard');
    }
  }, [loading, user, canAccess, router, isPartnerAccount]);

  useEffect(() => {
    if (!user || !canAccess || isPartnerAccount) return;
    void load();
  }, [user, canAccess, isPartnerAccount, load]);

  const handleSendMessage = async () => {
    if (!listing || !user) return;
    setMsgBusy(true);
    try {
      if (isAdmin || isSuperAdmin) {
        const r = await ensureAdminDirectConversation(listing.user_id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        router.push(`/admin/inbox?c=${encodeURIComponent(r.conversationId)}`);
        return;
      }
      router.push(`/dashboard/messages?dm=${encodeURIComponent(listing.user_id)}`);
    } finally {
      setMsgBusy(false);
    }
  };

  if (loading || !user || isPartnerAccount || !canAccess) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
        </div>
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="min-h-screen bg-[#1A1A1A]">
        <Header />
        <DashboardNav />
        <main id="main-content" className={cn(DASHBOARD_MAIN, 'py-16 text-center text-white/70')}>
          <p className="text-lg font-medium text-white mb-2">Partner not found</p>
          <p className="text-sm text-white/45 mb-6">This listing may be unavailable or not approved.</p>
          <Button variant="secondary" asChild>
            <Link href="/dashboard/partners">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to directory
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  const site = listing.website?.trim();
  const href =
    site && (site.startsWith('http://') || site.startsWith('https://')) ? site : site ? `https://${site}` : null;

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN)}>
        <Link
          href="/dashboard/partners"
          className="mb-6 flex w-full items-center justify-center gap-1 text-sm text-white/45 transition-colors hover:text-white sm:inline-flex sm:w-auto sm:justify-start"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All partners
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="flex flex-col items-center px-6 pt-10 pb-6 border-b border-white/10">
            <div className="relative h-32 w-32 sm:h-40 sm:w-40 rounded-xl bg-white border border-white/10 overflow-hidden">
              {listing.logo_url ? (
                <Image src={listing.logo_url} alt="" fill className="object-contain p-2" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/30">
                  {listing.company_name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-6 text-center">{listing.company_name}</h1>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {(listing.partner_types ?? []).map((t) => (
                <Badge key={t} className="bg-[#D4A853]/20 text-[#D4A853] border-0">
                  {typeLabel(t)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="px-6 py-8 space-y-6">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">About</h2>
              <p className="text-white/80 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#D4A853] hover:underline text-sm font-medium"
                >
                  <ExternalLink className="h-4 w-4" />
                  Visit website
                </a>
              )}
              {listing.phone?.trim() && (
                <a href={`tel:${listing.phone.replace(/\s/g, '')}`} className="text-sm text-white/70 hover:text-white">
                  {listing.phone}
                </a>
              )}
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto gap-2 bg-[#D4A853] text-black hover:bg-[#c49b4a]"
              onClick={() => void handleSendMessage()}
              disabled={msgBusy}
            >
              {msgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Send message
            </Button>

            {(listing.photo_urls ?? []).filter(Boolean).length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Photos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(listing.photo_urls ?? []).filter(Boolean).map((url) => (
                    <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-white/5">
                      <Image src={url} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
