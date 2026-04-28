'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const admin = serviceClient();
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin' && prof?.role !== 'super_admin') {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, userId: user.id, admin };
}

// Referral codes: 3–32 chars, uppercase letters and digits only.
const CODE_RE = /^[A-Z0-9]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeInput(input: {
  full_name: string;
  email: string;
  phone?: string | null;
  referral_code: string;
  social_reward_cents: number;
  business_reward_cents: number;
  notes?: string | null;
}): { ok: true; values: {
    full_name: string;
    email: string;
    phone: string | null;
    referral_code: string;
    social_reward_cents: number;
    business_reward_cents: number;
    notes: string | null;
  } } | { ok: false; error: string } {
  const fullName = (input.full_name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  const phone = (input.phone ?? '').trim() || null;
  const code = (input.referral_code ?? '').trim().toUpperCase();
  const social = Math.round(Number(input.social_reward_cents));
  const business = Math.round(Number(input.business_reward_cents));
  const notes = (input.notes ?? '').trim() || null;

  if (!fullName) return { ok: false, error: 'Full name is required' };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Valid email is required' };
  if (!code || !CODE_RE.test(code)) {
    return { ok: false, error: 'Referral code must be 3–32 uppercase letters or digits' };
  }
  if (!Number.isFinite(social) || social < 0) return { ok: false, error: 'Invalid social reward' };
  if (!Number.isFinite(business) || business < 0) return { ok: false, error: 'Invalid business reward' };

  return {
    ok: true,
    values: {
      full_name: fullName,
      email,
      phone,
      referral_code: code,
      social_reward_cents: social,
      business_reward_cents: business,
      notes,
    },
  };
}

export async function createAmbassador(input: {
  full_name: string;
  email: string;
  phone?: string | null;
  referral_code: string;
  social_reward_cents: number;
  business_reward_cents: number;
  notes?: string | null;
}): Promise<{ ok: true; ambassador_id: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const v = normalizeInput(input);
  if (!v.ok) return v;

  const { data: existing } = await gate.admin
    .from('ambassadors')
    .select('id')
    .ilike('referral_code', v.values.referral_code)
    .maybeSingle();
  if (existing) return { ok: false, error: `Code "${v.values.referral_code}" is already in use` };

  const { data, error } = await gate.admin
    .from('ambassadors')
    .insert({
      ...v.values,
      stripe_account_status: 'pending',
      is_active: true,
      created_by: gate.userId,
    })
    .select('id')
    .single();
  if (error || !data?.id) return { ok: false, error: error?.message ?? 'Insert failed' };
  return { ok: true, ambassador_id: data.id as string };
}

export async function updateAmbassador(
  id: string,
  input: {
    full_name: string;
    email: string;
    phone?: string | null;
    referral_code: string;
    social_reward_cents: number;
    business_reward_cents: number;
    is_active: boolean;
    notes?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: 'Missing ambassador id' };

  const v = normalizeInput(input);
  if (!v.ok) return v;

  const { data: dup } = await gate.admin
    .from('ambassadors')
    .select('id')
    .ilike('referral_code', v.values.referral_code)
    .neq('id', id)
    .maybeSingle();
  if (dup) return { ok: false, error: `Code "${v.values.referral_code}" is already in use` };

  const { error } = await gate.admin
    .from('ambassadors')
    .update({
      ...v.values,
      is_active: input.is_active,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function approveReferral(referralId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!referralId) return { ok: false, error: 'Missing referral id' };

  const { data: ref, error: fetchErr } = await gate.admin
    .from('ambassador_referrals')
    .select('id, status, tier, ambassador_id')
    .eq('id', referralId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!ref) return { ok: false, error: 'Referral not found' };

  const status = String(ref.status);
  if (status !== 'pending' && !status.startsWith('flagged_')) {
    return { ok: false, error: `Cannot approve referral with status "${status}"` };
  }

  const { error: upErr } = await gate.admin
    .from('ambassador_referrals')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: gate.userId,
    })
    .eq('id', referralId);
  if (upErr) return { ok: false, error: upErr.message };

  // Bump the social-tier counter so we don't have to recompute it on every read.
  // Read-modify-write is fine for an admin-only manual approval flow; a Postgres
  // trigger or RPC can replace this once Stripe payout firing is wired up.
  if (ref.tier === 'social') {
    const { data: amb } = await gate.admin
      .from('ambassadors')
      .select('approved_social_referrals_count')
      .eq('id', ref.ambassador_id)
      .maybeSingle();
    const current = (amb?.approved_social_referrals_count as number | undefined) ?? 0;
    await gate.admin
      .from('ambassadors')
      .update({ approved_social_referrals_count: current + 1 })
      .eq('id', ref.ambassador_id);
  }
  return { ok: true };
}

export async function denyReferral(
  referralId: string,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!referralId) return { ok: false, error: 'Missing referral id' };
  const cleanReason = (reason ?? '').trim();
  if (!cleanReason) return { ok: false, error: 'A denial reason is required' };

  const { data: ref, error: fetchErr } = await gate.admin
    .from('ambassador_referrals')
    .select('id, status')
    .eq('id', referralId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!ref) return { ok: false, error: 'Referral not found' };

  const status = String(ref.status);
  if (status !== 'pending' && !status.startsWith('flagged_')) {
    return { ok: false, error: `Cannot deny referral with status "${status}"` };
  }

  const { error } = await gate.admin
    .from('ambassador_referrals')
    .update({
      status: 'denied',
      denied_at: new Date().toISOString(),
      denied_reason: cleanReason,
    })
    .eq('id', referralId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deactivateAmbassador(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: 'Missing ambassador id' };

  const { error } = await gate.admin
    .from('ambassadors')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createAmbassadorOnboardingLink(
  ambassadorId: string
): Promise<{ url: string; expiresAt: number }> {
  const gate = await assertAdmin();
  if (!gate.ok) throw new Error(gate.error);

  const supabase = serviceClient();
  const { data: ambassador, error: fetchErr } = await supabase
    .from('ambassadors')
    .select('id, full_name, email, stripe_account_id, stripe_account_status')
    .eq('id', ambassadorId)
    .maybeSingle();
  if (fetchErr || !ambassador) throw new Error('Ambassador not found');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });

  let accountId: string = (ambassador as { stripe_account_id: string | null }).stripe_account_id ?? '';

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: (ambassador as { email: string }).email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: {
        ambassador_id: (ambassador as { id: string }).id,
        platform_source: '704_collective',
      },
    });
    accountId = account.id;
    await supabase
      .from('ambassadors')
      .update({ stripe_account_id: accountId, stripe_account_status: 'onboarding' })
      .eq('id', (ambassador as { id: string }).id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const ambId = (ambassador as { id: string }).id;
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: siteUrl + '/admin/ambassadors/' + ambId + '?onboarding=refresh',
    return_url: siteUrl + '/admin/ambassadors/' + ambId + '?onboarding=complete',
    type: 'account_onboarding',
  });

  return { url: accountLink.url, expiresAt: accountLink.expires_at };
}

export async function fireAmbassadorPayout(
  referralId: string
): Promise<{ payout_id: string; transfer_id: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) throw new Error(gate.error);

  const supabase = serviceClient();
  const { data: ref, error: refErr } = await supabase
    .from('ambassador_referrals')
    .select('id, ambassador_id, reward_cents, status, paid_out_at, ambassador:ambassadors!ambassador_id (id, full_name, email, stripe_account_id, stripe_account_status)')
    .eq('id', referralId)
    .maybeSingle();
  if (refErr || !ref) throw new Error('Referral not found');

  if (ref.status !== 'approved' && ref.status !== 'auto_approved') {
    throw new Error('Referral must be approved before payout');
  }
  if (ref.paid_out_at) throw new Error('Payout already fired for this referral');

  const amb = (ref.ambassador as unknown) as {
    id: string;
    full_name: string;
    email: string | null;
    stripe_account_id: string | null;
    stripe_account_status: string | null;
  };

  if (!amb.stripe_account_id) {
    throw new Error('Ambassador has no Stripe account \u2014 they need to complete onboarding first');
  }
  if (amb.stripe_account_status !== 'active') {
    throw new Error('Ambassador Stripe account is ' + amb.stripe_account_status + ', not active');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });

  const transfer = await stripe.transfers.create({
    amount: ref.reward_cents as number,
    currency: 'usd',
    destination: amb.stripe_account_id,
    description: '704 Collective ambassador referral reward \u2014 ' + amb.full_name,
    metadata: {
      ambassador_id: amb.id,
      referral_id: ref.id as string,
    },
  });

  const { data: payoutRow, error: payoutErr } = await supabase
    .from('ambassador_payouts')
    .insert({
      ambassador_id: amb.id,
      referral_id: ref.id,
      amount_cents: ref.reward_cents,
      stripe_transfer_id: transfer.id,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (payoutErr) {
    // Transfer already happened in Stripe -- log loudly but don't throw.
    console.error('Transfer succeeded but payout log insert failed:', payoutErr);
  }

  await supabase
    .from('ambassador_referrals')
    .update({ paid_out_at: new Date().toISOString(), stripe_payout_id: transfer.id })
    .eq('id', ref.id);

  // ── Send payout email (non-blocking) ──
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const { data: totalPaidRows } = await supabase
      .from('ambassador_payouts')
      .select('amount_cents')
      .eq('ambassador_id', amb.id)
      .eq('status', 'sent');
    const totalPaidCents = (totalPaidRows ?? []).reduce(
      (sum: number, r: { amount_cents: number | null }) => sum + (r.amount_cents || 0),
      0
    );
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: amb.email ?? '',
        template: 'ambassador-payout-sent',
        skipCc: true,
        data: {
          ambassadorName: amb.full_name,
          amountDollars: ((ref.reward_cents as number) / 100).toFixed(2),
          transferId: transfer.id,
          totalPaidDollars: (totalPaidCents / 100).toFixed(2),
        },
      }),
    });
  } catch (emailErr) {
    console.error('Payout email failed (non-blocking):', emailErr);
  }

  return { payout_id: payoutRow?.id ?? '', transfer_id: transfer.id };
}

export async function fireAllPendingPayouts(): Promise<{
  total: number;
  success: number;
  failed: { id: string; error: string }[];
}> {
  const gate = await assertAdmin();
  if (!gate.ok) throw new Error(gate.error);

  const supabase = serviceClient();
  const { data: refs, error } = await supabase
    .from('ambassador_referrals')
    .select('id, ambassador:ambassadors!ambassador_id (stripe_account_status)')
    .in('status', ['approved', 'auto_approved'])
    .is('paid_out_at', null);

  if (error) throw new Error(error.message);

  const eligible = (refs ?? []).filter(
    (r) => ((r.ambassador as unknown) as { stripe_account_status: string | null } | null)?.stripe_account_status === 'active'
  );

  const result = { total: eligible.length, success: 0, failed: [] as { id: string; error: string }[] };

  for (const ref of eligible) {
    try {
      await fireAmbassadorPayout(ref.id as string);
      result.success += 1;
    } catch (err) {
      result.failed.push({
        id: ref.id as string,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
