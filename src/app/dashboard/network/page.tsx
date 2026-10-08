'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { NetworkView } from '@/components/network/portal/NetworkView';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { DASHBOARD_MAIN_WIDE } from '@/lib/dashboard-layout';
import { DashboardOverviewSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';

/** Wave H5 - The Network for active members (social + business) and admins. Non-members never see it. */
export default function DashboardNetworkPage() {
  const { user, loading, isAdmin, isSuperAdmin, isActiveMember } = useAuth();
  const router = useRouter();
  usePageTitle('The Network');
  const canAccess = isActiveMember || isAdmin || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!canAccess) router.replace('/dashboard');
  }, [loading, user, canAccess, router]);

  if (loading) return <DashboardOverviewSkeleton />;
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
