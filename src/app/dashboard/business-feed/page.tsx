'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { FeedView } from '@/components/portal/FeedView';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Loader2 } from 'lucide-react';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

export default function BusinessFeedPage() {
  const { user, profile, loading, isActiveMember, isAdmin, isSuperAdmin, isBusinessMember } = useAuth();
  const router = useRouter();
  usePageTitle('Business Feed');
  const redirectToastShown = useRef(false);

  const canAccess = isBusinessMember || isAdmin || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (canAccess) return;
    if (isActiveMember && profile?.member_type === 'social') {
      if (!redirectToastShown.current) {
        redirectToastShown.current = true;
        toast.info('The Business feed is for Business members only.');
      }
      router.replace('/dashboard/social-feed');
      return;
    }
    router.replace('/dashboard');
  }, [loading, user, isActiveMember, canAccess, profile?.member_type, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !canAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <DashboardNav />

      <main className={cn(DASHBOARD_MAIN, 'space-y-4')}>
        <h1 className="text-2xl font-semibold text-foreground">Business Feed</h1>
        <SectionErrorBoundary>
          <FeedView
            feedType="business"
            currentUser={user}
            currentProfile={profile ? {
              id: profile.id,
              full_name: profile.full_name ?? null,
              avatar_url: (profile as any).avatar_url ?? null,
            } : null}
          />
        </SectionErrorBoundary>
      </main>
    </div>
  );
}
