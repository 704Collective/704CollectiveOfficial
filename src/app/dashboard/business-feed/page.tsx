'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { FeedView } from '@/components/portal/FeedView';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Loader2 } from 'lucide-react';

export default function BusinessFeedPage() {
  const { user, profile, loading, isActiveMember, isAdmin, isSuperAdmin, isBusinessMember } = useAuth();
  const router = useRouter();
  usePageTitle('Business Feed');

  const canAccess = isBusinessMember || isAdmin || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // Active social-only members redirect to social feed
    if (isActiveMember && !canAccess) { router.replace('/dashboard/social-feed'); return; }
    // Non-members redirect to dashboard
    if (!isActiveMember && !canAccess) { router.replace('/dashboard'); }
  }, [loading, user, isActiveMember, canAccess, router]);

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
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 overflow-hidden">
            <DashboardNav />
          </div>
        </div>
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
