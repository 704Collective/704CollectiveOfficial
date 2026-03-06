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
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { OnboardingCard } from '@/components/OnboardingCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, AlertCircle, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
      toast.success('Ticket purchased!', { description: 'You\'re all set for the event.' });
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
      if (error) {
        console.error('Supabase error:', error);
        toast.error('Failed to open billing portal');
        setIsPortalLoading(false);
        return;
      }
      if (data?.error) {
        console.error('Function error:', data.error);
        toast.error(data.error);
        setIsPortalLoading(false);
        return;
      }
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('No portal URL received');
      }
    } catch (err) {
      console.error('Portal error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <Skeleton className="h-48 sm:h-56 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </main>
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const p = profile as any;
  const firstName = p.full_name?.split(' ')[0] || 'Member';
  const subscriptionStatus = p.subscription_status;
  const isCanceledOrInactive = subscriptionStatus === 'canceled' || subscriptionStatus === 'inactive' || !subscriptionStatus;
  const isPastDue = subscriptionStatus === 'past_due';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 max-w-6xl mx-auto">
        <DashboardNav />

        {/* Past Due Warning Banner */}
        {isPastDue && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm text-foreground">There's an issue with your payment</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Please update your billing info to keep your membership active. Stripe may still retry the charge.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageSubscription}
              disabled={isPortalLoading}
              className="shrink-0"
            >
              {isPortalLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CreditCard className="w-3.5 h-3.5" />
              )}
              Update Billing
            </Button>
          </div>
        )}

        {/* Canceled / Inactive Reactivation Banner */}
        {isCanceledOrInactive && !isActiveMember && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8 text-center space-y-4">
            <Crown className="w-10 h-10 text-primary mx-auto" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Your membership is inactive</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Reactivate to unlock free RSVPs, guest passes, and all member benefits.
              </p>
            </div>
            <Button variant="hero" asChild>
              <Link href="/join">
                <Crown className="w-4 h-4" />
                Reactivate Membership
              </Link>
            </Button>
          </div>
        )}

        {/* Onboarding */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <OnboardingCard userId={user.id} />
          </SectionErrorBoundary>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-semibold">
            Welcome back, {firstName}
          </h1>
        </div>

        {/* Calendar Sync CTA */}
        {isActiveMember && (
          <CalendarSyncButton
            calendarToken={p.calendar_token}
            baseUrl={supabaseUrl || ''}
            variant="cta"
          />
        )}

        {/* Next Event Hero */}
        {(isActiveMember || isPastDue) && (
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Your Next Event</p>
            <SectionErrorBoundary>
              <NextEventHero userId={user.id} onEventLoaded={setHeroEventId} />
            </SectionErrorBoundary>
          </div>
        )}

        {/* Two-column grid */}
        {(isActiveMember || isPastDue) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Guest Pass + Updates */}
            <div className="space-y-6 order-1">
              {isActiveMember && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Grow The Community</p>
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

            {/* Right: Upcoming Events */}
            <div className="order-first lg:order-2">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">My Schedule</p>
              <SectionErrorBoundary>
                <MyEventsSection userId={user.id} excludeEventId={heroEventId} />
              </SectionErrorBoundary>
            </div>
          </div>
        )}

        {/* Membership Status Bar */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Your Membership</p>
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