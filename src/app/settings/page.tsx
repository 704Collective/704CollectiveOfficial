'use client';

import { useAuth } from '@/hooks/useAuth';
import { SOCIAL_TIER } from '@/lib/pricing';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvatarUpload } from '@/components/AvatarUpload';
import { PasswordChangeForm } from '@/components/PasswordChangeForm';
import { NotificationSettings } from '@/components/NotificationSettings';
import { MembershipDangerZone } from '@/components/MembershipDangerZone';
import { toast } from 'sonner';
import { Loader2, User, Key, Bell, CreditCard, Calendar, LogOut, ExternalLink, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { MemberStatusDotLabel, resolveSubscriptionVisualKind } from '@/lib/memberSubscriptionStatus';

export default function Settings() {
  const router = useRouter();
  const { user, profile, isActiveMember, isAdmin, signOut, loading } = useAuth();
  usePageTitle('Account Settings');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [livePriceDisplay, setLivePriceDisplay] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [planTierLabel, setPlanTierLabel] = useState('Social');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState<string | null>(null);
  const [billingCancelAtPeriodEnd, setBillingCancelAtPeriodEnd] = useState(false);
  const [billingDiscountLabel, setBillingDiscountLabel] = useState<string | null>(null);
  const [billingPaidThrough, setBillingPaidThrough] = useState<string | null>(null);

  const p = profile as any;
  // Only treat the user as having an actionable Stripe subscription when:
  // - they have a Stripe customer
  // - they are still an active member
  // - they aren't on an admin override
  // - their subscription is genuinely 'active' (not canceled/paused/past_due)
  // - cancellation isn't already pending at period end
  // This prevents the Cancel/Pause/Manage flows from being shown to users
  // whose subscription was canceled in Stripe Dashboard but still in their
  // grace period.
  // A real Stripe subscription (has a subscription_id) means the member can
  // self-manage billing via the portal, whether or not an admin also set an
  // override. Only true comps (active, no subscription_id) see the
  // "managed by an administrator" message instead.
  const hasStripeSubscription =
    !!p?.stripe_customer_id
    && isActiveMember
    && !!p?.subscription_id
    && p?.subscription_status === 'active'
    && !p?.cancel_at_period_end;

  useEffect(() => {
    if (p) {
      setFullName(p.full_name || '');
      setAvatarUrl(p.avatar_url || '');
      setPlanTierLabel(
        p.member_type === 'business'
          ? 'Business'
          : p.member_type === 'partner'
            ? 'Partner'
            : 'Social'
      );
    }
  }, [profile]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Live "what you pay" — never hardcode a dollar amount for current plan.
  useEffect(() => {
    if (!user || !isActiveMember) {
      setLivePriceDisplay(null);
      setBillingPeriodEnd(null);
      setBillingCancelAtPeriodEnd(false);
      setBillingDiscountLabel(null);
      setBillingPaidThrough(null);
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/billing/current-subscription', {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          ok?: boolean;
          priceCents?: number;
          priceDisplay?: string;
          tierLabel?: string;
          tier?: string;
          cancelAtPeriodEnd?: boolean;
          currentPeriodEnd?: string | null;
          paidThrough?: string | null;
          discount?: {
            couponName?: string;
            couponCode?: string | null;
            percentOff?: number | null;
            amountOffCents?: number | null;
          } | null;
        };
        if (cancelled) return;
        const paidThrough =
          json?.ok && typeof json.paidThrough === 'string' ? json.paidThrough : null;
        setBillingPaidThrough(paidThrough);
        const live =
          !paidThrough &&
          json?.ok &&
          typeof json.priceCents === 'number' &&
          json.priceCents > 0 &&
          typeof json.priceDisplay === 'string' &&
          json.priceDisplay.startsWith('$')
            ? json.priceDisplay
            : null;
        setLivePriceDisplay(live);
        setBillingPeriodEnd(
          json?.ok && typeof json.currentPeriodEnd === 'string' ? json.currentPeriodEnd : null,
        );
        setBillingCancelAtPeriodEnd(!!(json?.ok && json.cancelAtPeriodEnd));
        if (json?.ok && json.discount) {
          const d = json.discount;
          const amountLabel =
            typeof d.percentOff === 'number'
              ? `${d.percentOff}% off`
              : typeof d.amountOffCents === 'number'
                ? `$${(d.amountOffCents / 100).toFixed(d.amountOffCents % 100 === 0 ? 0 : 2)} off`
                : null;
          setBillingDiscountLabel(
            [d.couponCode || d.couponName, amountLabel].filter(Boolean).join(' · ') || null,
          );
        } else {
          setBillingDiscountLabel(null);
        }
        if (json?.ok && json.tierLabel) {
          // Prefer API tier label when available (Business vs Social).
          setPlanTierLabel(
            json.tier === 'business'
              ? 'Business'
              : json.tier === 'partner'
                ? 'Partner'
                : json.tier === 'social'
                  ? 'Social'
                  : json.tierLabel.replace(/ Membership$/i, '')
          );
        }
      } catch {
        if (!cancelled) {
          setLivePriceDisplay(null);
          setBillingPeriodEnd(null);
          setBillingCancelAtPeriodEnd(false);
          setBillingDiscountLabel(null);
          setBillingPaidThrough(null);
        }
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isActiveMember]);

  const membershipPlanLabel = !isActiveMember
    ? 'No active membership'
    : billingPaidThrough
      ? `${planTierLabel} - Annual member`
      : livePriceDisplay
        ? `${planTierLabel} - ${livePriceDisplay}`
        : planTierLabel;

  const periodEndIso =
    billingPaidThrough || billingPeriodEnd || p?.subscription_ends_at || null;
  const endsAtPeriodEnd = billingPaidThrough
    ? false
    : billingCancelAtPeriodEnd || !!p?.cancel_at_period_end;

  const handleSave = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to open billing portal');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', { body: {} });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
    } finally {
      setSubscribeLoading(false);
    }
  };

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-muted mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="container py-8 max-w-2xl">
        <h1 className="text-3xl font-semibold mb-8">Account Settings</h1>

        <div className="space-y-6">
          {/* Become a Member CTA for non-members */}
          {!isActiveMember && (
            <div className="card-elevated p-6 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Become a Member</h2>
                  <p className="text-sm text-muted-foreground">Get access to all events, the member community, and exclusive perks.</p>
                </div>
              </div>
              <Button onClick={handleSubscribe} disabled={subscribeLoading} className="w-full">
                {subscribeLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  `Subscribe - ${SOCIAL_TIER.monthlyPriceFull}`
                )}
              </Button>
            </div>
          )}

          {/* Profile Section */}
          <div className="card-elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your account information</p>
              </div>
            </div>

            <div className="space-y-6">
              <AvatarUpload
                userId={user.id}
                currentAvatarUrl={avatarUrl}
                userName={fullName}
                onUploadComplete={(url) => setAvatarUrl(url)}
              />

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user.email || ''} disabled />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={100}
                />
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>

          {/* Password Section */}
          <div className="card-elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Password</h2>
                <p className="text-sm text-muted-foreground">Update your password</p>
              </div>
            </div>
            <PasswordChangeForm />
          </div>

          {/* Notifications Section */}
          <div className="card-elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Notifications</h2>
                <p className="text-sm text-muted-foreground">Manage your notification preferences</p>
              </div>
            </div>
            <NotificationSettings 
              userId={user.id}
              initialSettings={{
                notify_event_reminders: p.notify_event_reminders ?? true,
                notify_new_events: p.notify_new_events ?? true,
                notify_announcements: p.notify_announcements ?? true,
              }}
            />
          </div>

          {/* Membership Section */}
          <div className="card-elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Membership</h2>
                <p className="text-sm text-muted-foreground">Manage your subscription</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">
                    {membershipPlanLabel}
                    {priceLoading && isActiveMember && !livePriceDisplay && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">…</span>
                    )}
                  </p>
                  {p.member_since && (
                    <p className="text-sm text-muted-foreground">
                      Member since {format(new Date(p.member_since), 'MMMM yyyy')}
                    </p>
                  )}
                  {isActiveMember && periodEndIso && (
                    <p className="text-sm text-muted-foreground">
                      {endsAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                      {format(new Date(periodEndIso), 'MMMM d, yyyy')}
                    </p>
                  )}
                  {isActiveMember && billingDiscountLabel && (
                    <p className="text-sm text-muted-foreground">
                      Discount: {billingDiscountLabel}
                    </p>
                  )}
                </div>
                <MemberStatusDotLabel
                  kind={resolveSubscriptionVisualKind(p.subscription_status, { deletedAt: null })}
                />
              </div>

              {hasStripeSubscription ? (
                <>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleManageBilling}
                    disabled={billingLoading}
                  >
                    {billingLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening Portal...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Manage Billing
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    View invoices, update payment method, and download receipts
                  </p>
                </>
              ) : isActiveMember ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Your membership is managed by an administrator.
                </p>
              ) : null}
            </div>
          </div>

          {/* Danger Zone */}
          {isActiveMember && hasStripeSubscription && (
            <div className="card-elevated p-6 border-destructive/20">
              <MembershipDangerZone userId={user.id} isActiveMember={isActiveMember} hasStripeSubscription={hasStripeSubscription} hasStripeCustomer={!!p?.stripe_customer_id} membershipOverride={!!p?.membership_override} />
            </div>
          )}

          {/* Calendar Token Section */}
          <div className="card-elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Calendar</h2>
                <p className="text-sm text-muted-foreground">Your private calendar subscription</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <code className="text-xs text-muted-foreground break-all">
                Token: {p.calendar_token}
              </code>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This token is used for your private calendar feed. Keep it secret.
            </p>
          </div>

          {/* Sign Out */}
          <div className="card-elevated p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h2 className="font-semibold">Sign Out</h2>
                  <p className="text-sm text-muted-foreground">Sign out of your account</p>
                </div>
              </div>
              <Button variant="destructive" onClick={handleSignOut} className="self-start sm:self-auto">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}