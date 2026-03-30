'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { MessagesPageClient } from '@/app/dashboard/messages/MessagesPageClient';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MessagesPageShellSkeleton, MessagesInnerSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { DASHBOARD_MAIN_WIDE } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

export default function MessagesPage() {
  const { user, profile, loading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  usePageTitle('Messages');

  const isBusinessMember = profile?.member_type === 'business';
  const canAccess = isBusinessMember || isAdmin || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!canAccess) { router.replace('/dashboard'); }
  }, [loading, user, canAccess, router]);

  if (loading) {
    return <MessagesPageShellSkeleton />;
  }

  if (!user || !canAccess) return null;

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN_WIDE)}>
        <Suspense fallback={<MessagesInnerSkeleton />}>
          <SectionErrorBoundary>
            <MessagesPageClient />
          </SectionErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
