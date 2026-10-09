'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { NetworkView } from '@/components/network/portal/NetworkView';
import { useAuth } from '@/hooks/useAuth';
import { useHubPagesLive } from '@/hooks/useHubPagesLive';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { DASHBOARD_MAIN_WIDE } from '@/lib/dashboard-layout';
import { DashboardOverviewSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';

/** Wave H5 - The Network for active members (social + business) and admins. Non-members never see it. */
export default function DashboardNetworkPage() {
  const { user, loading, isAdmin, isSuperAdmin, isActiveMember } = useAuth();
  const hubLive = useHubPagesLive();
  const router = useRouter();
  usePageTitle('The Network');
  // H5 close-out: members need HUB_PAGES_LIVE; admins always pass. Wait for the flag before bouncing.
  const isAdminish = isAdmin || isSuperAdmin;
  const pending = !isAdminish && hubLive === null;
  const canAccess = isAdminish || (isActiveMember && hubLive === true);

  useEffect(() => {
    if (loading || pending) return;
    if (!user) { router.replace('/login'); return; }
    if (!canAccess) router.replace('/dashboard');
  }, [loading, pending, user, canAccess, router]);

  if (loading || pending) return <DashboardOverviewSkeleton />;
  if (!user || !canAccess) return null;

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={DASHBOARD_MAIN_WIDE}>
        <SectionErrorBoundary>
          <NetworkView />
        </SectionErrorBoundary>
      </main>
    </div>
  );
}
