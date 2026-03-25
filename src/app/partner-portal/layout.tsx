'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { PartnerHeader } from '@/components/partner/PartnerHeader';
import { PartnerNav } from '@/components/partner/PartnerNav';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const p = profile as Record<string, unknown> | null;

  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const partnerStatus = (p?.partner_status as string) ?? 'pending';
  const partnerApproved = partnerStatus === 'approved';

  const loadBranding = useCallback(async () => {
    if (!user) return;
    const { data: listing } = await supabase
      .from('partner_listings')
      .select('company_name, logo_url')
      .eq('user_id', user.id)
      .maybeSingle();
    if (listing?.company_name) {
      setCompanyName(listing.company_name);
      setLogoUrl(listing.logo_url ?? null);
      return;
    }
    const { data: app } = await supabase
      .from('partner_applications')
      .select('company_name, logo_url')
      .eq('user_id', user.id)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCompanyName(app?.company_name ?? '');
    setLogoUrl(app?.logo_url ?? null);
  }, [user]);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace('/login');
      return;
    }
    if (p?.member_type !== 'partner') {
      router.replace('/dashboard');
      return;
    }
    if (!partnerApproved) {
      const onSettings = pathname.startsWith('/partner-portal/settings');
      const onDash = pathname === '/partner-portal' || pathname === '/partner-portal/';
      if (!onSettings && !onDash) {
        router.replace('/partner-portal');
      }
    }
  }, [loading, user, profile, pathname, router, p?.member_type, partnerApproved]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C6A664' }} />
      </div>
    );
  }

  if (!user || !profile || p?.member_type !== 'partner') {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <Header />
      <PartnerHeader companyName={companyName || 'Partner'} logoUrl={logoUrl} />
      <PartnerNav partnerApproved={partnerApproved} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
