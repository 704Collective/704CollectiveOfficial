'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { CommunityStatsWidget } from '@/components/CommunityStatsWidget';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { OnboardingCard } from '@/components/OnboardingCard';
import { NonMemberDashboard } from '@/components/NonMemberDashboard';
import { SuggestEventModal } from '@/components/SuggestEventModal';
import { Crown, AlertCircle, CreditCard, Loader2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const { user, profile, isActiveMember, isAdmin, loading, refreshProfile } = useAuth();
  const router = useRouter();
  usePageTitle('Member Portal');
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [heroEventId, setHeroEventId] = useState<string | null>(null);
  const [application, setApplication] = useState<any>(null);
  const [appLoaded, setAppLoaded] = useState(false);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);

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

  // Track last_seen_at for re-engagement cron
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {});
  }, [user]);

  // Load business application for business non-members or any user with application_status set
  useEffect(() => {
    if (!user || !profile) return;
    const p = profile as any;
    const shouldFetchApp =
      p.member_type === 'business_non_member' ||
      (p.application_status && ['pending', 'reviewing', 'approved', 'denied', 'waitlisted'].includes(p.application_status));

    if (shouldFetchApp) {
      supabase
        .from('business_applications')
        .select('*')
        .eq('email', p.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          setApplication(data ?? null);
          setAppLoaded(true);
        });
    } else {
      setAppLoaded(true);
    }
  }, [user, profile]);

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

  // Self-healing fallback: if we land here with a valid session but the auth
  // context profile is still null (happens when SIGNED_IN deduplication
  // suppressed the event during the OAuth callback → dashboard redirect), wait
  // 500 ms and force a profile load via refreshProfile so the page never gets
  // permanently stuck in the loading skeleton.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !profile) {
        timer = setTimeout(() => {
          refreshProfile();
        }, 500);
      }
    };
    check();
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once on mount

  // Redirect to login as soon as we know auth has resolved with no user.
  // Using an effect (rather than a sync redirect) satisfies React's rules of
  // hooks — all hooks above must run unconditionally before any early return.
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !appLoaded) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  // Auth resolved but no user — redirect is in flight via the effect above.
  if (!user || !profile) return null;

  const p = profile as any;

  // ── Non-member view ─────────────────────────────────────────────
  const isNonMember =
    p.member_type === 'social_non_member' ||
    p.member_type === 'business_non_member' ||
    (p.member_type === 'non_member' && !isActiveMember);

  if (isNonMember) {
    return (
      <>
        <Header />
        <NonMemberDashboard
          profile={{
            id: user.id,
            email: p.email,
            full_name: p.full_name,
            member_type: p.member_type,
            application_status: p.application_status,
          }}
          application={application}
        />
      </>
    );
  }

  // ── Active member view (existing) ───────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const displayName = p.full_name?.trim();
  const firstName = displayName
    ? displayName.split(' ')[0]
    : p.email?.split('@')[0] ?? 'Member';

  const subscriptionStatus = p.subscription_status;
  const isCanceling = p.cancel_at_period_end === true;
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

        {/* Sub-nav + suggest event */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 overflow-hidden">
            <DashboardNav />
          </div>
          {isActiveMember && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap"
              onClick={() => setSuggestModalOpen(true)}
            >
              <Lightbulb className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Suggest</span>
            </Button>
          )}
        </div>

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
            <Button variant="hero" asChild>
              <a href="https://buy.stripe.com/704collective" target="_blank" rel="noopener noreferrer">
                <Crown className="w-4 h-4 mr-2" />
                Reactivate Membership
              </a>
            </Button>
          </div>
        )}

        {/* Welcome heading */}
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
          Welcome back, {firstName}
        </h1>

        {/* Business membership nudge for active social members — hidden from admins */}
        {isActiveMember && p.member_type === 'social' && !isAdmin && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">
              Think you're a fit for <strong>704 Business</strong>?
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/business">Learn more</a>
            </Button>
          </div>
        )}

        {/* Membership card + wallet buttons inline */}
        {isActiveMember && (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full max-w-xs">
              <MembershipCard
                name={p.full_name || 'Member'}
                memberId={user.id}
                avatarUrl={p.avatar_url}
                memberSince={memberSince}
              />
            </div>
            <div className="flex flex-col gap-2 sm:pt-2">
              <WalletButtons compact />
            </div>
          </div>
        )}

        {/* Onboarding checklist */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <OnboardingCard userId={user.id} />
          </SectionErrorBoundary>
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

        {/* Calendar sync */}
        {isActiveMember && p.calendar_token && (
          <CalendarSyncButton
            calendarToken={p.calendar_token}
            baseUrl={supabaseUrl || ''}
            variant="cta"
          />
        )}

        {/* Two-column grid */}
        {(isActiveMember || isPastDue) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                My Schedule
              </p>
              <SectionErrorBoundary>
                <MyEventsSection userId={user.id} excludeEventId={heroEventId} />
              </SectionErrorBoundary>
            </div>

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

        {/* Community stats widget */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <CommunityStatsWidget />
          </SectionErrorBoundary>
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
              subscriptionEndsAt={p.subscription_ends_at}
              cancelAtPeriodEnd={p.cancel_at_period_end}
              membershipOverride={p.membership_override ?? false}
              subscriptionStatus={subscriptionStatus}
              onManageBilling={handleManageSubscription}
              isPortalLoading={isPortalLoading}
            />
          </SectionErrorBoundary>
        </div>

        {/* Suggest an Event — bottom CTA for active members */}
        {isActiveMember && (
          <div className="rounded-xl border border-border bg-card/50 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Have an event idea?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Share it with the 704 Collective team.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setSuggestModalOpen(true)}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Suggest an Event
            </Button>
          </div>
        )}

      </main>

      {isActiveMember && (
        <SuggestEventModal
          open={suggestModalOpen}
          onOpenChange={setSuggestModalOpen}
          profileId={user.id}
          email={p.email ?? ''}
          fullName={p.full_name ?? null}
        />
      )}
    </div>
  );
}