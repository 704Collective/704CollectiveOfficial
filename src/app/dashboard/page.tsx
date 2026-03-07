'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { MyEventsSection } from '@/components/MyEventsSection';
import { GuestPassSection } from '@/components/GuestPassSection';
import { NotificationsFeed } from '@/components/NotificationsFeed';
import { NextEventHero } from '@/components/NextEventHero';
import { CalendarSyncButton } from '@/components/CalendarSyncButton';
import { MembershipStatusBar } from '@/components/MembershipStatusBar';
import { MembershipCard } from '@/components/MembershipCard';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { OnboardingCard } from '@/components/OnboardingCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, AlertCircle, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Dashboard() {
  const router = useRouter();
  const { user, profile, isActiveMember, isAdmin, loading } = useAuth();
  usePageTitle('Member Portal');
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [heroEventId, setHeroEventId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('welcome')) {
      toast.success('Welcome to 704 Collective!', { description: 'Your membership is now active.' });
      params.delete('welcome');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    } else if (params.has('ticket_purchased')) {
      toast.success('Ticket purchased!', { description: "You're all set for the event." });
      params.delete('ticket_purchased');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const path = window.location.pathname;
      if (path !== '/setup-password' && path !== '/update-password') {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) { toast.error('Failed to open billing portal'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.url) { window.open(data.url, '_blank'); }
      else { toast.error('No portal URL received'); }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 sm:h-56 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!user || !profile) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const p = profile as any;

  const displayName = p.full_name?.trim();
  const firstName = displayName
    ? displayName.split(' ')[0]
    : p.email?.split('@')[0] ?? 'Member';

  const subscriptionStatus = p.subscription_status;
  const isCanceledOrInactive =
    subscriptionStatus === 'canceled' ||
    subscriptionStatus === 'inactive' ||
    !subscriptionStatus;
  const isPastDue = subscriptionStatus === 'past_due';

  const memberSince = p.member_since
    ? format(new Date(p.member_since), 'MMMM yyyy')
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* Sub-nav */}
        <DashboardNav />

        {/* Past due warning */}
        {isPastDue && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">There's an issue with your payment</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update your billing info to keep your membership active.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={isPortalLoading} className="shrink-0">
              {isPortalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-1.5" />}
              Update Billing
            </Button>
          </div>
        )}

        {/* Inactive / canceled banner */}
        {isCanceledOrInactive && !isActiveMember && (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <Crown className="w-10 h-10 text-primary mx-auto" />
            <div>
              <h2 className="text-lg font-semibold">Your membership is inactive</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Reactivate to unlock free RSVPs, guest passes, and all member benefits.
              </p>
            </div>
            <Button variant="default" asChild>
              <Link href="/join">
                <Crown className="w-4 h-4 mr-2" />
                Reactivate Membership
              </Link>
            </Button>
          </div>
        )}

        {/* Onboarding checklist */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <OnboardingCard userId={user.id} />
          </SectionErrorBoundary>
        )}

        {/* Welcome heading */}
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
          Welcome back, {firstName}
        </h1>

        {/* Membership card + wallet buttons */}
        {isActiveMember && (
          <div className="space-y-3">
            <div className="max-w-xs">
              <MembershipCard
                name={p.full_name || 'Member'}
                memberId={user.id}
                avatarUrl={p.avatar_url}
                memberSince={memberSince}
              />
            </div>
            <div className="flex gap-2 max-w-xs">
              <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
                Google Wallet
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Apple Wallet
              </Button>
            </div>
          </div>
        )}

        {/* Next Event */}
        {(isActiveMember || isPastDue) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Your Next Event
            </p>
            <SectionErrorBoundary>
              <NextEventHero userId={user.id} onEventLoaded={setHeroEventId} />
            </SectionErrorBoundary>
          </div>
        )}

        {/* Calendar sync — subtle, not gold CTA */}
        {isActiveMember && (
          <CalendarSyncButton
            calendarToken={p.calendar_token}
            baseUrl={supabaseUrl || ''}
            variant="subtle"
          />
        )}

        {/* Two-column grid: MY SCHEDULE left, GROW THE COMMUNITY right */}
        {(isActiveMember || isPastDue) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: My Schedule */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                My Schedule
              </p>
              <SectionErrorBoundary>
                <MyEventsSection userId={user.id} excludeEventId={heroEventId} />
              </SectionErrorBoundary>
            </div>

            {/* Right: Grow the Community + Updates */}
            <div className="space-y-5">
              {isActiveMember && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Grow The Community
                  </p>
                  <SectionErrorBoundary>
                    <GuestPassSection userId={user.id} />
                  </SectionErrorBoundary>
                </div>
              )}
              <SectionErrorBoundary>
                <div className="card-elevated p-4 sm:p-5">
                  <NotificationsFeed userId={user.id} />
                </div>
              </SectionErrorBoundary>
            </div>

          </div>
        )}

        {/* Membership status bar */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Your Membership
          </p>
          <SectionErrorBoundary>
            <MembershipStatusBar
              isActiveMember={isActiveMember}
              memberSince={p.member_since}
              subscriptionEnd={p.subscription_end}
              membershipOverride={p.membership_override ?? false}
              onManageBilling={handleManageSubscription}
              isPortalLoading={isPortalLoading}
            />
          </SectionErrorBoundary>
        </div>

      </main>
    </div>
  );
}