'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Handshake } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';

type Listing = {
  id: string;
  user_id: string;
  company_name: string;
  description: string;
  logo_url: string | null;
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

function PartnersGridBody({
  listings,
  search,
}: {
  listings: Listing[];
  search: string;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => {
      const inName = l.company_name.toLowerCase().includes(q);
      const inDesc = l.description.toLowerCase().includes(q);
      const inTypes = (l.partner_types ?? []).some((t) => t.toLowerCase().includes(q));
      return inName || inDesc || inTypes;
    });
  }, [listings, search]);

  if (filtered.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
        <Handshake className="h-12 w-12 mx-auto text-[#D4A853]/60 mb-4" />
        <p className="text-white/80 font-medium">
          {listings.length === 0 ? 'No approved partners in the directory yet.' : 'No partners match your search.'}
        </p>
        <p className="text-sm text-white/45 mt-2">
          {listings.length === 0
            ? 'Check back soon as our partner network grows.'
            : 'Try a different company name or partner type.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((l) => (
        <Link
          key={l.id}
          href={`/dashboard/partners/${l.id}`}
          className="group rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-[#D4A853]/40 hover:bg-white/[0.06]"
        >
          <div className="flex gap-4">
            <div className="relative h-16 w-16 shrink-0 rounded-lg bg-white/10 overflow-hidden border border-white/10">
              {l.logo_url ? (
                <Image src={l.logo_url} alt="" fill className="object-contain p-1" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-white/40 font-medium text-center px-1">
                  {l.company_name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-white truncate group-hover:text-[#D4A853] transition-colors">
                {l.company_name}
              </h2>
              <div className="flex flex-wrap gap-1 mt-2">
                {(l.partner_types ?? []).slice(0, 4).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] bg-white/10 text-white/80 border-0">
                    {typeLabel(t)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-white/55 mt-4 line-clamp-2 leading-relaxed">{l.description}</p>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPartnersDirectoryPage() {
  const router = useRouter();
  const { user, profile, loading, isAdmin, isSuperAdmin, isActiveMember, isBusinessMember } = useAuth();
  usePageTitle('Partners');

  const isPartnerAccount = profile?.member_type === 'partner';
  const canAccess =
    (!isPartnerAccount && isBusinessMember && isActiveMember) || isAdmin || isSuperAdmin;

  const [listings, setListings] = useState<Listing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setDataLoading(true);
    setLoadError(null);
    try {
      const { data: approved, error: pe } = await supabase
        .from('profiles')
        .select('id')
        .eq('member_type', 'partner')
        .eq('partner_status', 'approved')
        .is('deleted_at', null);
      if (pe) throw new Error(pe.message);
      const ids = (approved ?? []).map((r) => r.id);
      if (!ids.length) {
        setListings([]);
        return;
      }
      const { data: rows, error: le } = await supabase
        .from('partner_listings')
        .select('id, user_id, company_name, description, logo_url, partner_types')
        .in('user_id', ids)
        .order('company_name', { ascending: true });
      if (le) throw new Error(le.message);
      setListings((rows ?? []) as Listing[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load partners');
      setListings([]);
    } finally {
      setDataLoading(false);
    }
  }, []);

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

  if (loading || !user || isPartnerAccount || !canAccess) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className="w-full py-4 sm:py-8">
        <div className="w-full max-w-3xl mx-auto px-4">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Partner directory</h1>
            <p className="mt-1 text-sm text-white/50">
              Browse approved 704 Collective partners. Message a partner from their profile.
            </p>
          </div>

          <div className="relative mx-auto mb-8 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description, or type…"
              className="pl-10 bg-white/5 border-white/15 text-white placeholder:text-white/35"
            />
          </div>

          {loadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive-foreground px-4 py-3 text-sm mb-6">
              {loadError}
              <button type="button" className="underline ml-2 text-white" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}

          {dataLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
            </div>
          ) : (
            <SectionErrorBoundary>
              <PartnersGridBody listings={listings} search={search} />
            </SectionErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}
