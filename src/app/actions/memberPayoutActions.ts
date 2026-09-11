'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

/**
 * Member referral payout tail (Phase 2). Mirrors the ambassador Connect flow in
 * ambassadorActions.ts, keyed to the member's profile instead of an ambassadors
 * row. Everything here is scoped to auth.uid(); the service role is used only to
 * read tables the browser cannot (ambassadors) and to write member_payout_accounts.
 *
 * Destination resolution order (same as supabase/functions/_shared/memberPayoutDestination.ts):
 *   1. member_payout_accounts (own, active)
 *   2. ambassadors row for this profile (active)  <- reuse rule, never onboard twice
 *   3. none -> the "Set up payouts" CTA
 */

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

export type PayoutDestination =
  | { source: 'member' | 'ambassador'; accountId: string; status: 'active' }
  | { source: null; memberStatus: string | null; ambassadorStatus: string | null };

async function resolveDestination(admin: ReturnType<typeof serviceClient>, profileId: string): Promise<PayoutDestination> {
  const { data: own } = await admin
    .from('member_payout_accounts')
    .select('stripe_account_id, stripe_account_status')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (own?.stripe_account_id && own.stripe_account_status === 'active') {
    return { source: 'member', accountId: own.stripe_account_id as string, status: 'active' };
  }
  const { data: amb } = await admin
    .from('ambassadors')
    .select('stripe_account_id, stripe_account_status')
    .eq('profile_id', profileId)
    .not('stripe_account_id', 'is', null)
    .order('stripe_onboarding_completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (amb?.stripe_account_id && amb.stripe_account_status === 'active') {
    return { source: 'ambassador', accountId: amb.stripe_account_id as string, status: 'active' };
  }
  return {
    source: null,
    memberStatus: (own?.stripe_account_status as string | null) ?? null,
    ambassadorStatus: (amb?.stripe_account_status as string | null) ?? null,
  };
}

export interface ReferralRowView {
  id: string;
  referred_name: string | null;
  amount_cents: number;
  status: string;
  payout_status: string;
  created_at: string;
  converted_at: string | null;
  payout_sent_at: string | null;
}

export interface ReferralPayoutState {
  referrals: ReferralRowView[];
  owedCents: number;
  destination: PayoutDestination;
  /** True when at least one row is owed and no usable Connect account exists. */
  needsSetup: boolean;
}

export async function getMyReferralPayoutState(): Promise<{ ok: true; state: ReferralPayoutState } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const admin = serviceClient();
  const { data: rows, error } = await admin
    .from('referrals')
    .select('id, referred_name, amount_cents, status, payout_status, created_at, converted_at, payout_sent_at')
    .eq('referrer_profile_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };

  const referrals = (rows ?? []) as ReferralRowView[];
  const owedCents = referrals
    .filter((r) => r.payout_status === 'owed' && r.status === 'converted')
    .reduce((s, r) => s + (r.amount_cents || 0), 0);
  const destination = await resolveDestination(admin, user.id);
  return {
    ok: true,
    state: { referrals, owedCents, destination, needsSetup: owedCents > 0 && destination.source === null },
  };
}

/**
 * Creates (once) the member's Express account and returns a fresh onboarding
 * link. Refuses unless money is actually owed and no usable account exists —
 * the CTA is never shown otherwise, and this is the server-side twin of that gate.
 */
export async function createMemberPayoutOnboardingLink(): Promise<
  { ok: true; url: string; expiresAt: number; accountId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const admin = serviceClient();

  const { data: owed } = await admin
    .from('referrals')
    .select('id')
    .eq('referrer_profile_id', user.id)
    .eq('status', 'converted')
    .eq('payout_status', 'owed')
    .limit(1);
  if (!owed || owed.length === 0) return { ok: false, error: 'nothing_owed' };

  const dest = await resolveDestination(admin, user.id);
  if (dest.source !== null) return { ok: false, error: `already_has_account:${dest.source}` };

  const { data: prof } = await admin.from('profiles').select('email, full_name').eq('id', user.id).maybeSingle();
  const stripe = stripeClient();

  const { data: existing } = await admin
    .from('member_payout_accounts')
    .select('stripe_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  let accountId = (existing?.stripe_account_id as string | null) ?? '';
  if (!accountId) {
    // Same capability pair as the ambassador flow: Stripe rejects `transfers`
    // without `card_payments` for platforms without special approval.
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: prof?.email ?? user.email ?? undefined,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { referrer_profile_id: user.id, platform_source: '704_collective', ledger: 'referrals' },
    });
    accountId = account.id;
    const { error: upErr } = await admin
      .from('member_payout_accounts')
      .upsert({ profile_id: user.id, stripe_account_id: accountId, stripe_account_status: 'onboarding' }, { onConflict: 'profile_id' });
    if (upErr) return { ok: false, error: upErr.message };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/dashboard?payout_setup=refresh`,
    return_url: `${siteUrl}/dashboard?payout_setup=complete`,
    type: 'account_onboarding',
  });

  await admin
    .from('member_payout_accounts')
    .update({ stripe_account_status: 'onboarding' })
    .eq('profile_id', user.id)
    .neq('stripe_account_status', 'active');

  return { ok: true, url: link.url, expiresAt: link.expires_at, accountId };
}

/**
 * Pull-sync of the member's Connect status (accounts.retrieve). This is the path
 * that actually works today; the account.updated webhook branch only fires once
 * the Stripe endpoint is subscribed to Connect events.
 */
export async function syncMyPayoutAccountStatus(): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const admin = serviceClient();
  const { data: row } = await admin
    .from('member_payout_accounts')
    .select('stripe_account_id, stripe_account_status, stripe_onboarding_completed_at')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!row?.stripe_account_id) return { ok: false, error: 'no_account' };

  const stripe = stripeClient();
  const account = await stripe.accounts.retrieve(row.stripe_account_id as string);
  let status: string;
  if (account.details_submitted && account.charges_enabled && account.payouts_enabled) status = 'active';
  else if (account.requirements?.disabled_reason) status = 'restricted';
  else status = 'onboarding';

  if (status !== row.stripe_account_status) {
    const updates: Record<string, unknown> = { stripe_account_status: status };
    if (status === 'active' && !row.stripe_onboarding_completed_at) updates.stripe_onboarding_completed_at = new Date().toISOString();
    await admin.from('member_payout_accounts').update(updates).eq('profile_id', user.id);
  }
  return { ok: true, status };
}
