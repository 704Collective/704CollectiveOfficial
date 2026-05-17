import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROFILES = 200;
const END_DATE_DRIFT_MS = 24 * 60 * 60 * 1000; // 24h

type Severity = 'critical' | 'medium' | 'low';
type SuggestedAction = 'sync_from_stripe' | 'manual_review';

export interface ProfileState {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  stripeCustomerId: string | null;
  subscriptionEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface StripeState {
  activeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
}

export interface Mismatch {
  profileId: string;
  email: string;
  fullName: string | null;
  memberType: string | null;
  severity: Severity;
  mismatchType: string;
  explanation: string;
  profileState: ProfileState;
  stripeState: StripeState | null;
  suggestedAction: SuggestedAction;
}

export interface ReconcilePreviewResponse {
  ok: boolean;
  scanned: number;
  partial?: boolean;
  total_profiles_with_stripe?: number;
  mismatches: Mismatch[];
  summary: { critical_count: number; medium_count: number; low_count: number };
  error?: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  member_type: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  stripe_customer_id: string | null;
  subscription_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  membership_override: boolean | null;
  deleted_at: string | null;
}

const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due']);
const CANCEL_LIKE_PROFILE_STATUSES = new Set(['canceled', 'cancelled', 'inactive']);

function periodEndSeconds(
  sub: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
): number | null {
  // API version 2026-02-25.clover may expose current_period_end per item;
  // older shapes expose it on the subscription. Try both.
  const subAny = sub as unknown as { current_period_end?: number | null };
  const itemAny = item as unknown as { current_period_end?: number | null } | undefined;
  return subAny.current_period_end ?? itemAny?.current_period_end ?? null;
}

function buildProfileState(p: ProfileRow): ProfileState {
  return {
    subscriptionStatus: p.subscription_status,
    subscriptionId: p.subscription_id,
    stripeCustomerId: p.stripe_customer_id,
    subscriptionEndsAt: p.subscription_ends_at,
    cancelAtPeriodEnd: !!p.cancel_at_period_end,
  };
}

function buildStripeState(sub: Stripe.Subscription | null): StripeState | null {
  if (!sub) return null;
  const item = sub.items.data[0];
  const periodEnd = periodEndSeconds(sub, item);
  return {
    activeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    priceId: item?.price?.id ?? null,
  };
}

function pickActiveSub(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  // Prefer trialing/active/past_due over canceled/incomplete; among the
  // preferred set, return the most recently created.
  const candidates = subs.filter((s) => ACTIVE_STRIPE_STATUSES.has(s.status));
  const pool = candidates.length > 0 ? candidates : [];
  if (pool.length === 0) return null;
  return pool.slice().sort((a, b) => b.created - a.created)[0]!;
}

function severityRank(s: Severity): number {
  return s === 'critical' ? 0 : s === 'medium' ? 1 : 2;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', scanned: 0, mismatches: [], summary: { critical_count: 0, medium_count: 0, low_count: 0 } } as ReconcilePreviewResponse,
        { status: 401 },
      );
    }

    const { data: meRow } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (meRow?.role !== 'super_admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden', scanned: 0, mismatches: [], summary: { critical_count: 0, medium_count: 0, low_count: 0 } } as ReconcilePreviewResponse,
        { status: 403 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { ok: false, error: 'Stripe not configured', scanned: 0, mismatches: [], summary: { critical_count: 0, medium_count: 0, low_count: 0 } } as ReconcilePreviewResponse,
        { status: 500 },
      );
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' });

    // Count eligible profiles (for partial flag)
    const { count: totalEligible } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .neq('membership_override', true)
      .neq('member_type', 'partner')
      .or('subscription_id.not.is.null,stripe_customer_id.not.is.null');

    // Fetch first MAX_PROFILES eligible profiles
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, member_type, subscription_status, subscription_id, stripe_customer_id, subscription_ends_at, cancel_at_period_end, membership_override, deleted_at')
      .is('deleted_at', null)
      .neq('membership_override', true)
      .neq('member_type', 'partner')
      .or('subscription_id.not.is.null,stripe_customer_id.not.is.null')
      .order('email', { ascending: true })
      .range(0, MAX_PROFILES - 1);

    if (profErr) {
      console.error('[STRIPE_RECONCILE] profile fetch failed:', profErr);
      return NextResponse.json(
        { ok: false, error: 'Profile fetch failed', scanned: 0, mismatches: [], summary: { critical_count: 0, medium_count: 0, low_count: 0 } } as ReconcilePreviewResponse,
        { status: 500 },
      );
    }

    const rows = (profiles ?? []) as ProfileRow[];
    const mismatches: Mismatch[] = [];

    for (const p of rows) {
      const profileState = buildProfileState(p);

      // We can only look up Stripe if we have a customer ID.
      if (!p.stripe_customer_id) {
        // Profile has subscription_id but no customer_id — orphan reference
        if (p.subscription_id) {
          mismatches.push({
            profileId: p.id,
            email: p.email,
            fullName: p.full_name,
            memberType: p.member_type,
            severity: 'medium',
            mismatchType: 'subscription_id_orphan',
            explanation: 'Profile has subscription_id but no stripe_customer_id; cannot verify against Stripe.',
            profileState,
            stripeState: null,
            suggestedAction: 'manual_review',
          });
        }
        continue;
      }

      let subs: Stripe.Subscription[] = [];
      try {
        const list = await stripe.subscriptions.list({
          customer: p.stripe_customer_id,
          status: 'all',
          limit: 5,
        });
        subs = list.data;
      } catch (err) {
        console.error('[STRIPE_RECONCILE] Stripe list failed for', p.email, err);
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'medium',
          mismatchType: 'stripe_fetch_failed',
          explanation: 'Failed to fetch subscriptions from Stripe; manual investigation required.',
          profileState,
          stripeState: null,
          suggestedAction: 'manual_review',
        });
        continue;
      }

      const activeSub = pickActiveSub(subs);
      const stripeState = buildStripeState(activeSub);
      const profileSaysCanceled = !p.subscription_status || CANCEL_LIKE_PROFILE_STATUSES.has(p.subscription_status);
      const profileSaysActive = p.subscription_status === 'active';

      // ── CRITICAL: profile says canceled but Stripe is active ───────
      if (profileSaysCanceled && activeSub) {
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'critical',
          mismatchType: 'profile_says_canceled_stripe_says_active',
          explanation: `Profile status is "${p.subscription_status ?? 'null'}" but Stripe sub ${activeSub.id} is "${activeSub.status}". Member is still being billed.`,
          profileState,
          stripeState,
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // ── CRITICAL: profile says active but Stripe has no active sub ─
      if (profileSaysActive && !activeSub) {
        const anyStripeSub = subs[0] ?? null;
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'critical',
          mismatchType: 'profile_says_active_stripe_says_canceled',
          explanation: anyStripeSub
            ? `Profile is "active" but Stripe has no active sub (latest: ${anyStripeSub.id} = "${anyStripeSub.status}"). Member may have free access.`
            : 'Profile is "active" but Stripe has no subscriptions at all for this customer.',
          profileState,
          stripeState: buildStripeState(anyStripeSub),
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // Nothing else to check if there's no active Stripe sub
      if (!activeSub) continue;

      // ── MEDIUM: subscription_id missing while Stripe has an active sub ─
      if (!p.subscription_id) {
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'medium',
          mismatchType: 'subscription_id_missing',
          explanation: `Profile is missing subscription_id but Stripe has active sub ${activeSub.id}.`,
          profileState,
          stripeState,
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // ── MEDIUM: subscription_id orphan (doesn't match any of customer's subs)
      if (!subs.some((s) => s.id === p.subscription_id)) {
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'medium',
          mismatchType: 'subscription_id_orphan',
          explanation: `Profile subscription_id ${p.subscription_id} not found among customer's Stripe subs. Active sub is ${activeSub.id}.`,
          profileState,
          stripeState,
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // ── MEDIUM: cancel_at_period_end mismatch ───────────────────────
      if (!!p.cancel_at_period_end !== !!activeSub.cancel_at_period_end) {
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'medium',
          mismatchType: 'cancel_flag_mismatch',
          explanation: `Profile cancel_at_period_end=${!!p.cancel_at_period_end}, Stripe=${!!activeSub.cancel_at_period_end}.`,
          profileState,
          stripeState,
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // ── MEDIUM: end-date drift > 24h ────────────────────────────────
      const stripePeriodEndIso = stripeState?.currentPeriodEnd ?? null;
      if (p.subscription_ends_at && stripePeriodEndIso) {
        const profileMs = new Date(p.subscription_ends_at).getTime();
        const stripeMs = new Date(stripePeriodEndIso).getTime();
        if (Number.isFinite(profileMs) && Number.isFinite(stripeMs) && Math.abs(profileMs - stripeMs) > END_DATE_DRIFT_MS) {
          mismatches.push({
            profileId: p.id,
            email: p.email,
            fullName: p.full_name,
            memberType: p.member_type,
            severity: 'medium',
            mismatchType: 'end_date_mismatch',
            explanation: `Profile subscription_ends_at (${p.subscription_ends_at}) differs from Stripe current_period_end (${stripePeriodEndIso}) by more than 24h.`,
            profileState,
            stripeState,
            suggestedAction: 'sync_from_stripe',
          });
          continue;
        }
      }

      // ── LOW: Stripe paused but profile is not "paused" ──────────────
      if (activeSub.status === 'paused' && p.subscription_status !== 'paused') {
        mismatches.push({
          profileId: p.id,
          email: p.email,
          fullName: p.full_name,
          memberType: p.member_type,
          severity: 'low',
          mismatchType: 'stripe_paused',
          explanation: `Stripe subscription is paused but profile.subscription_status is "${p.subscription_status ?? 'null'}".`,
          profileState,
          stripeState,
          suggestedAction: 'sync_from_stripe',
        });
        continue;
      }

      // ── LOW: trial_end drift ────────────────────────────────────────
      const subAny = activeSub as unknown as { trial_end?: number | null };
      const stripeTrialEndIso = subAny.trial_end ? new Date(subAny.trial_end * 1000).toISOString() : null;
      if (stripeTrialEndIso && p.subscription_ends_at) {
        // Heuristic: when trialing, subscription_ends_at often mirrors trial_end.
        // Flag drift > 24h only if profile is in a trial-adjacent status.
        if (activeSub.status === 'trialing') {
          const profileMs = new Date(p.subscription_ends_at).getTime();
          const trialMs = new Date(stripeTrialEndIso).getTime();
          if (Number.isFinite(profileMs) && Number.isFinite(trialMs) && Math.abs(profileMs - trialMs) > END_DATE_DRIFT_MS) {
            mismatches.push({
              profileId: p.id,
              email: p.email,
              fullName: p.full_name,
              memberType: p.member_type,
              severity: 'low',
              mismatchType: 'trial_end_drift',
              explanation: `Stripe trial_end (${stripeTrialEndIso}) differs from profile subscription_ends_at (${p.subscription_ends_at}) by more than 24h.`,
              profileState,
              stripeState,
              suggestedAction: 'sync_from_stripe',
            });
            continue;
          }
        }
      }
    }

    // Sort: critical first, then medium, then low; tie-break alphabetical by email
    mismatches.sort((a, b) => {
      const r = severityRank(a.severity) - severityRank(b.severity);
      if (r !== 0) return r;
      return a.email.localeCompare(b.email);
    });

    const summary = {
      critical_count: mismatches.filter((m) => m.severity === 'critical').length,
      medium_count: mismatches.filter((m) => m.severity === 'medium').length,
      low_count: mismatches.filter((m) => m.severity === 'low').length,
    };

    const eligibleTotal = totalEligible ?? rows.length;
    const partial = eligibleTotal > rows.length;

    console.log(
      `[STRIPE_RECONCILE] preview scanned=${rows.length} eligible_total=${eligibleTotal} mismatches=${mismatches.length} (critical=${summary.critical_count} medium=${summary.medium_count} low=${summary.low_count})`,
    );

    const body: ReconcilePreviewResponse = {
      ok: true,
      scanned: rows.length,
      mismatches,
      summary,
    };
    if (partial) {
      body.partial = true;
      body.total_profiles_with_stripe = eligibleTotal;
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error('[STRIPE_RECONCILE] preview unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: 'Server error', scanned: 0, mismatches: [], summary: { critical_count: 0, medium_count: 0, low_count: 0 } } as ReconcilePreviewResponse,
      { status: 500 },
    );
  }
}
