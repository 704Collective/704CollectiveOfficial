'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { MyEventsSection } from '@/components/MyEventsSection';
import { GuestPassSection } from '@/components/GuestPassSection';
import { NotificationsFeed } from '@/components/NotificationsFeed';
import { NextEventHero } from '@/components/NextEventHero';
import { CalendarSyncButton } from '@/components/CalendarSyncButton';
import { CalendarConnectPrompt } from '@/components/CalendarConnectPrompt';
import { MembershipStatusBar } from '@/components/MembershipStatusBar';
import { MembershipCard } from '@/components/MembershipCard';
import { WalletButtons } from '@/components/WalletButtons';
import { CommunityStatsWidget } from '@/components/CommunityStatsWidget';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { OnboardingCard } from '@/components/OnboardingCard';
import { NonMemberDashboard } from '@/components/NonMemberDashboard';
import { HubsPreviewWidget } from '@/components/HubsPreviewWidget';
import { SuggestEventModal } from '@/components/SuggestEventModal';
import { Crown, AlertCircle, CreditCard, Loader2, Lightbulb, Heart, ArrowRight, Rss, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardOverviewSkeleton } from '@/components/dashboard/DashboardLoadingSkeletons';
import { supabase } from '@/integrations/supabase/client';
import { DASHBOARD_MAIN } from '@/lib/dashboard-layout';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';

// ---------------------------------------------------------------------------
// Feed preview widget (read-only, 3 most recent posts)
// ---------------------------------------------------------------------------
interface PreviewPost {
  id: string;
  content: string | null;
  created_at: string;
  like_count: number;
  author: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

function FeedPreviewWidget({ feedType, href }: { feedType: 'social' | 'business'; href: string }) {
  const [posts, setPosts] = useState<PreviewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('posts')
      .select(`
        id, content, created_at,
        author:profiles!posts_author_id_fkey(id, full_name, avatar_url),
        like_count:post_likes(count)
      `)
      .eq('feed_type', feedType)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(true); setLoading(false); return; }
        setPosts(
          ((data ?? []) as any[]).map((row) => ({
            ...row,
            author: Array.isArray(row.author) ? row.author[0] ?? null : row.author,
            like_count: Array.isArray(row.like_count) ? ((row.like_count[0] as any)?.count ?? 0) : 0,
          }))
        );
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [feedType]);

  const label = feedType === 'social' ? 'Social Feed' : 'Business Feed';
  const Icon = feedType === 'social' ? Rss : Briefcase;

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Link href={href}>
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-elevated p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="w-7 h-7 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card-elevated p-4 text-center text-sm text-muted-foreground">
          Unable to load feed preview.
        </div>
      ) : posts.length === 0 ? (
        <div className="card-elevated p-4 text-center">
          <p className="text-sm text-muted-foreground">No posts yet.</p>
          <Button variant="outline" size="sm" asChild className="mt-2">
            <Link href={href}>Be the first to post</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const name = post.author?.full_name ?? 'Member';
            const parts = name.trim().split(/\s+/).filter(Boolean);
            const initials =
              parts.length >= 2
                ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
                : name.slice(0, 2).toUpperCase();
            const authorKey = post.author?.id ?? name;
            return (
              <Link key={post.id} href={href} className="block card-elevated p-3 hover:bg-accent/30 transition-colors rounded-xl">
                <div className="flex items-start gap-2.5">
                  <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                    <AvatarImage src={post.author?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px] font-semibold" style={getInitialsAvatarStyle(authorKey)}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">{name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {post.content && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {post.content}
                      </p>
                    )}
                    {post.like_count > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Heart className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{post.like_count}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          <Button variant="outline" size="sm" asChild className="w-full gap-1.5 text-xs mt-1">
            <Link href={href}>
              <Icon className="w-3.5 h-3.5" />
              View {label}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Reads `?suggest=1` in a Suspense-isolated subtree (Next.js useSearchParams CSR bailout). */
function DashboardSuggestFromQuery({ onOpen }: { onOpen: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('suggest') !== '1') return;
    onOpen();
    const next = new URLSearchParams(searchParams.toString());
    next.delete('suggest');
    const q = next.toString();
    router.replace(q ? `/dashboard?${q}` : '/dashboard', { scroll: false });
  }, [searchParams, router, onOpen]);

  return null;
}

export default function Dashboard() {
  const { user, profile, isActiveMember, isAdmin, loading, refreshProfile } = useAuth();
  const [calendarPromptDismissed, setCalendarPromptDismissed] = useState(false);
  const [isAmbassador, setIsAmbassador] = useState(false);

  useEffect(() => {
    if ((profile as { calendar_token?: string | null } | null)?.calendar_token) {
      setCalendarPromptDismissed(false);
    }
  }, [profile]);
  const router = useRouter();
  usePageTitle('Member Portal');
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [heroEventId, setHeroEventId] = useState<string | null>(null);
  const [application, setApplication] = useState<any>(null);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const openSuggestFromQuery = useCallback(() => setSuggestModalOpen(true), []);

  // Re-fetch profile on every mount so that membership status changes (e.g.
  // cancellation) are reflected immediately without a manual page refresh.
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once on mount
  }, []);

  // Self-healing fallback: wait 800 ms then check whether a session exists but
  // the profile never loaded. This catches the case where SIGNED_IN was
  // deduplicated across the OAuth callback → dashboard redirect and the
  // profile fetch never ran.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !profile) {
        refreshProfile();
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once on mount
  }, []);

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
    if (loading || !profile) return;
    const p = profile as { member_type?: string | null };
    if (p.member_type === 'partner') {
      router.replace('/partner-portal');
    }
  }, [loading, profile, router]);

  // Track last_seen_at for re-engagement cron
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.error('[dashboard] last_seen update failed');
      });
  }, [user]);

  // Check if this member is also an ambassador.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('ambassadors')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsAmbassador(!!data);
      });
  }, [user]);

  // Load business application when profile is available.
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
        .then(({ data, error: baErr }) => {
          if (baErr) console.error('[dashboard] business_applications fetch failed');
          setApplication(data ?? null);
        });
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

  // Redirect to login as soon as we know auth has resolved with no user.
  // Using an effect (rather than a sync redirect) satisfies React's rules of
  // hooks — all hooks above must run unconditionally before any early return.
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) return <DashboardOverviewSkeleton />;

  // Auth resolved but no user — redirect is in flight via the effect above.
  if (!user || !profile) return null;

  const p = profile as any;

  // ── Non-member view ─────────────────────────────────────────────
  const isNonMember =
    p.member_type === 'social_non_member' ||
    p.member_type === 'business_non_member' ||
    (p.member_type === 'non_member' && !isActiveMember);

  // ── Canceled member view ─────────────────────────────────────────
  const isCanceledMember =
    (p.subscription_status === 'canceled' || p.subscription_status === 'cancelled') &&
    !p.membership_override;

  if (isNonMember || isCanceledMember) {
    return (
      <>
        <Header />
        <NonMemberDashboard
          profile={{
            id: user.id,
            email: p.email,
            full_name: p.full_name,
            // Use 'non_member' so the component shows the rejoin CTA
            member_type: isCanceledMember ? 'non_member' : p.member_type,
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

      <Suspense fallback={null}>
        <DashboardSuggestFromQuery onOpen={openSuggestFromQuery} />
      </Suspense>

      <DashboardNav
        suggestOpen={suggestModalOpen}
        onSuggestClick={() => setSuggestModalOpen(true)}
      />

      <main id="main-content" className={cn(DASHBOARD_MAIN, 'space-y-6')}>

        {/* Ambassador dual-role banner */}
        {isAmbassador && (
          <Link href="/ambassadors/dashboard">
            <div
              className="cursor-pointer transition hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, rgba(198,166,100,0.15) 0%, rgba(198,166,100,0.08) 100%)',
                border: '1px solid rgba(198,166,100,0.3)',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#C6A664', margin: 0 }}>
                  You&apos;re also an ambassador
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.65)', margin: '2px 0 0' }}>
                  Track your referrals and manage payouts in your ambassador dashboard.
                </p>
              </div>
              <span style={{ color: '#C6A664', fontSize: '1.125rem', fontWeight: 600, flexShrink: 0 }}>
                View dashboard →
              </span>
            </div>
          </Link>
        )}

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
              <Link href="/join">
                <Crown className="w-4 h-4 mr-2" />
                Reactivate Membership
              </Link>
            </Button>
          </div>
        )}

        {/* Welcome heading */}
        <h1 className="text-center text-2xl font-semibold text-foreground sm:text-3xl">
          Welcome back, {firstName}
        </h1>

        {/* Next Event */}
        {(isActiveMember || isPastDue) && (
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
              Your Next Event
            </p>
            <SectionErrorBoundary>
              <NextEventHero userId={user.id} onEventLoaded={setHeroEventId} />
            </SectionErrorBoundary>
          </div>
        )}

        {/* Community stats widget */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <CommunityStatsWidget />
          </SectionErrorBoundary>
        )}

        {/* Two-column grid */}
        {(isActiveMember || isPastDue) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                My Schedule
              </p>
              <SectionErrorBoundary>
                <MyEventsSection userId={user.id} excludeEventId={heroEventId} />
              </SectionErrorBoundary>
            </div>

            <div className="space-y-5">
              {isActiveMember && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
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

        {/* Hubs preview — business members and admins only */}
        {isActiveMember && (p.member_type === 'business' || isAdmin) && (
          <SectionErrorBoundary>
            <HubsPreviewWidget userId={user.id} />
          </SectionErrorBoundary>
        )}

        {/* Feed previews — shown for active members only */}
        {isActiveMember && (
          <>
            {/* Social feed preview — all active members */}
            <SectionErrorBoundary>
              <FeedPreviewWidget feedType="social" href="/dashboard/social-feed" />
            </SectionErrorBoundary>

            {/* Business feed preview — business members, admins, super admins */}
            {(p.member_type === 'business' || isAdmin) && (
              <SectionErrorBoundary>
                <FeedPreviewWidget feedType="business" href="/dashboard/business-feed" />
              </SectionErrorBoundary>
            )}
          </>
        )}

        {/* Calendar sync — RSVPed events only; prompt setup if no token yet */}
        {isActiveMember && supabaseUrl && (
          <div id="calendar-section" className="scroll-mt-28 space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Calendar
            </p>
            <SectionErrorBoundary>
              {p.calendar_token ? (
                <CalendarSyncButton
                  calendarToken={p.calendar_token}
                  baseUrl={supabaseUrl}
                  variant="cta"
                  userId={user.id}
                />
              ) : !calendarPromptDismissed ? (
                <CalendarConnectPrompt
                  calendarToken={null}
                  baseUrl={supabaseUrl}
                  userId={user.id}
                  onDismiss={() => setCalendarPromptDismissed(true)}
                  onTokenCreated={() => void refreshProfile()}
                />
              ) : (
                <button
                  type="button"
                  className="text-sm font-medium text-[#C6A664] hover:underline"
                  onClick={() => setCalendarPromptDismissed(false)}
                >
                  Connect your calendar
                </button>
              )}
            </SectionErrorBoundary>
          </div>
        )}

        {/* Onboarding checklist */}
        {isActiveMember && (
          <SectionErrorBoundary>
            <OnboardingCard userId={user.id} />
          </SectionErrorBoundary>
        )}

        {/* Membership card + wallet — stacked and centered on all breakpoints (desktop included) */}
        {isActiveMember && (
          <div
            id="wallet-section"
            className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 scroll-mt-28"
          >
            <div className="w-full">
              <MembershipCard
                name={p.full_name || 'Member'}
                memberId={user.id}
                memberSince={memberSince}
                memberType={p.member_type === 'business' ? 'business' : 'social'}
                memberLabel={
                  p.member_type === 'business' ? 'Business Member' : 'Social Member'
                }
                brandSubtitle={p.member_type === 'business' ? 'Business' : 'Social'}
              />
            </div>
            <WalletButtons compact />
          </div>
        )}

        {/* Business membership nudge for active social members — hidden from admins */}
        {isActiveMember && p.member_type === 'social' && !isAdmin && (
          <div style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid rgba(198,166,100,0.25)',
            borderRadius: '12px',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}>
            <p style={{ fontSize: '0.9375rem', color: '#FAF6F0', margin: 0 }}>
              Want your business in front of these members?
            </p>
            <a
              href="/business"
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#C6A664',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0,
              }}
            >
              Explore 704 Business <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Membership status bar */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
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
