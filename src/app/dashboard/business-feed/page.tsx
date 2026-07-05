'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { FeedView } from '@/components/portal/FeedView';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SocialOrBusinessFeedPageSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';

export default function BusinessFeedPage() {
  const { user, profile, loading, isActiveMember, isAdmin, isSuperAdmin, isBusinessMember } = useAuth();
  const router = useRouter();
  usePageTitle('Business Feed');
  const redirectToastShown = useRef(false);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

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
    return <SocialOrBusinessFeedPageSkeleton />;
  }

  if (!user || !canAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <DashboardNav />

      <main id="main-content" className={cn(DASHBOARD_MAIN, 'space-y-4')}>
        <h1 className="text-2xl font-semibold text-foreground">Business Feed</h1>
        <Suspense fallback={null}>
          <FeedHighlightFromQuery onPostId={setHighlightPostId} />
        </Suspense>
        <SectionErrorBoundary>
          <FeedView
            feedType="business"
            currentUser={user}
            currentProfile={profile ? {
              id: profile.id,
              full_name: profile.full_name ?? null,
              avatar_url: (profile as any).avatar_url ?? null,
            } : null}
            highlightPostId={highlightPostId}
          />
        </SectionErrorBoundary>
      </main>
    </div>
  );
}

/** Reads `?post=` in a Suspense-isolated subtree (Next.js useSearchParams CSR bailout). */
function FeedHighlightFromQuery({ onPostId }: { onPostId: (id: string | null) => void }) {
  const searchParams = useSearchParams();
  const postId = searchParams.get('post');
  useEffect(() => { onPostId(postId); }, [postId, onPostId]);
  return null;
}
