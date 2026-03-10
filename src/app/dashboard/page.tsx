'use client';

export const dynamic = 'force-dynamic';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
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
import { WalletButtons } from '@/components/WalletButtons';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { OnboardingCard } from '@/components/OnboardingCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, AlertCircle, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Dashboard() {
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

  // Show skeleton while auth is resolving
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        <DashboardNav />

        {isPastDue && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">There's an issue with your payment</p>
                <p className="text-xs text-muted-foreground mt-0.5">Update your billing info to keep your membership active.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={isPortalLoading} className="shrink-0">
              {isPortalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-1.5" />}
              Update Billing
            </Button>
          </div>
        )}

        {isCanceledOrInactive && !isActiveMember && (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <Crown className="w-10 h-10 text-primary mx-auto" />
            <div>
              <h2 className="text-lg font-semibold">Your membership is inactive</h2>
              <p className="text-sm text-muted-foreground mt-1">Reactivate to unlock free RSVPs, guest passes, and all member benefits.</p>
            </div>
            <Button variant="default" asChild>
              <Link href="/join"><Crown className="w-4 h-4 mr-2" />Reactivate Membership</Link>
            </Button>
          </div>
        )}

        {isActiveMember && (
          <SectionErrorBoundary>
            <OnboardingCard userId={user.id} />
          </SectionErrorBoundary>
        )}

        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
          Welcome back, {firstName}
        </h1>

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
            <div className="max-w-xs">
              <WalletButtons />
            </div>
          </div>
        )}

        {(isActiveMember || isPastDue) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Your Next Event</p>
            <SectionErrorBoundary>
              <NextEventHero userId={user.id} onEventLoaded={setHeroEventId} />
            </SectionErrorBoundary>
          </div>
        )}

        {isActiveMember && (
          <CalendarSyncButton
            calendarToken={p.calendar_token}
            baseUrl={supabaseUrl || ''}
            variant="cta"
          />
        )}

        {(isActiveMember || isPastDue) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">My Schedule</p>
              <SectionErrorBoundary>
                <MyEventsSection userId={user.id} excludeEventId={heroEventId} />
              </SectionErrorBoundary>
            </div>

            <div className="space-y-5">
              {isActiveMember && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Grow The Community</p>
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

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Your Membership</p>
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