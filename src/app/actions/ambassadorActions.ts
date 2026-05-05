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

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const admin = serviceClient();
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'super_admin') {
    return { ok: false as const, error: 'Forbidden: super_admin required' };
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

function generateTempPassword(): string {
  // Avoids visually confusing chars (0/O, 1/l/I)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 12; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function getOrCreateAuthUser(
  admin: ReturnType<typeof serviceClient>,
  email: string,
  fullName: string,
  phone: string | null
): Promise<{ userId: string; isNewUser: boolean; tempPassword?: string }> {
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (existingProfile) return { userId: (existingProfile as { id: string }).id, isNewUser: false };

  const tempPassword = generateTempPassword();
  const { data: newAuthUser, error: authErr } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone ?? '', member_type: 'ambassador' },
  });
  if (authErr || !newAuthUser?.user) {
    throw new Error(`Failed to create Auth user: ${authErr?.message ?? 'unknown'}`);
  }
  return { userId: newAuthUser.user.id, isNewUser: true, tempPassword };
}

export async function createAmbassador(input: {
  full_name: string;
  email: string;
  referral_code: string;
  type?: string | null;
}): Promise<{ ok: true; ambassador_id: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const email = (input.email ?? '').trim().toLowerCase();
  const code = (input.referral_code ?? '').trim().toUpperCase();
  const ALLOWED_TYPES = ['locator', 'member', 'partner'] as const;
  const type: typeof ALLOWED_TYPES[number] = ALLOWED_TYPES.includes(input.type as typeof ALLOWED_TYPES[number])
    ? (input.type as typeof ALLOWED_TYPES[number])
    : 'locator';

  const fullName = (input.full_name ?? '').trim();
  if (!fullName) {
    console.error('[createAmbassador] FAILED at validation: full_name is empty', { input });
    return { ok: false, error: 'Full name is required' };
  }
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Valid email is required' };
  if (!code || !CODE_RE.test(code)) {
    return { ok: false, error: 'Referral code must be 3-32 uppercase letters or digits' };
  }

  const { data: existing } = await gate.admin
    .from('ambassadors')
    .select('id')
    .ilike('referral_code', code)
    .maybeSingle();
  if (existing) {
    console.error('[createAmbassador] FAILED at uniqueness check: code already in use', { code, existing });
    return { ok: false, error: `Code "${code}" is already in use` };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';

  let profileId: string;
  let inviteUrl: string | null = null;
  let isNewUser = false;

  // generateLink creates the auth user and returns the invite URL without sending
  // Supabase's default invitation email, so we can send our own branded email.
  const { data: linkData, error: linkError } = await gate.admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `/ambassadors/welcome`,
      data: {
        full_name: '',
        phone: '',
        member_type: 'ambassador',
        referral_code: code,
        ambassador_type: type,
      },
    },
  });

  if (linkError) {
    // User already exists — link to their existing profile
    const { data: existingProfile } = await gate.admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!existingProfile) {
      return { ok: false, error: `Could not create invite: ` };
    }
    profileId = (existingProfile as { id: string }).id;
    isNewUser = false;
  } else {
    profileId = linkData.user.id;
    inviteUrl = linkData.properties.action_link;
    isNewUser = true;
  }

  // Insert ambassador row. full_name is '(Pending Setup)' until the ambassador
  // completes account setup via the invite link.
  const { data, error } = await gate.admin
    .from('ambassadors')
    .insert({
      email,
      full_name: fullName,
      phone: null,
      referral_code: code,
      type,
      social_reward_cents: 2000,
      business_reward_cents: 12500,
      profile_id: profileId,
      stripe_account_status: 'pending',
      is_active: true,
      created_by: gate.userId,
    })
    .select('id')
    .single();
  if (error || !data?.id) {
    console.error('[createAmbassador] FAILED at ambassador INSERT:', { error, email, code });
    return { ok: false, error: error?.message ?? 'Insert failed' };
  }

  // Send branded invite email (non-blocking)
  try {
    const firstName = fullName.split(' ')[0] || 'there';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const loginUrl = `/ambassadors/login`;
    if (isNewUser && inviteUrl) {
      await fetch(`/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ` },
        body: JSON.stringify({
          to: email,
          template: 'ambassador-invite',
          skipCc: true,
          data: { name: firstName, email, referralCode: code, inviteUrl },
        }),
      });
    } else {
      await fetch(`/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ` },
        body: JSON.stringify({
          to: email,
          template: 'ambassador-welcome-existing',
          skipCc: true,
          data: { name: firstName, loginUrl },
        }),
      });
    }
  } catch (emailErr) {
    console.error('Invite email failed (non-blocking):', emailErr);
  }

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
  if (status !== 'pending' && status !== 'signed_up' && !status.startsWith('flagged_')) {
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
  if (status !== 'pending' && status !== 'signed_up' && !status.startsWith('flagged_')) {
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

export async function churnReferral(
  referralId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!referralId) return { ok: false, error: 'Missing referral id' };

  const { data: ref, error: fetchErr } = await gate.admin
    .from('ambassador_referrals')
    .select('id, status, paid_out_at')
    .eq('id', referralId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!ref) return { ok: false, error: 'Referral not found' };

  if (ref.paid_out_at) {
    return { ok: false, error: 'Cannot churn a referral that has already been paid out' };
  }

  if (ref.status === 'churned') {
    return { ok: false, error: 'Referral is already churned' };
  }

  const { error } = await gate.admin
    .from('ambassador_referrals')
    .update({
      status: 'churned',
      denied_at: new Date().toISOString(),
      denied_reason: reason || 'Manually churned by admin',
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
): Promise<{ url: string; expiresAt: number; emailSent: boolean }> {
  const gate = await assertSuperAdmin();
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


  // Send onboarding email (non-blocking — link generation already succeeded)
  let emailSent = false;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const firstName = (ambassador as { full_name: string }).full_name.split(' ')[0] || 'Ambassador';
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: (ambassador as { email: string }).email,
        template: 'ambassador-onboarding-invite',
        skipCc: true,
        data: { name: firstName, onboardingUrl: accountLink.url },
      }),
    });
    emailSent = emailRes.ok;
    if (!emailRes.ok) console.error('Ambassador onboarding email failed:', await emailRes.text());
  } catch (emailErr) {
    console.error('Ambassador onboarding email error (non-blocking):', emailErr);
  }

  return { url: accountLink.url, expiresAt: accountLink.expires_at, emailSent };
}

export async function createMyOnboardingLink(): Promise<
  { ok: true; url: string; expiresAt: number } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const admin = serviceClient();
  const { data: amb, error: ambErr } = await admin
    .from('ambassadors')
    .select('id, full_name, email, stripe_account_id, stripe_account_status, profile_id')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (ambErr || !amb) return { ok: false, error: 'No ambassador account found for this user' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });

  let accountId: string = (amb as { stripe_account_id: string | null }).stripe_account_id ?? '';

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: (amb as { email: string }).email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: {
        ambassador_id: (amb as { id: string }).id,
        platform_source: '704_collective',
      },
    });
    accountId = account.id;
    await admin
      .from('ambassadors')
      .update({ stripe_account_id: accountId, stripe_account_status: 'onboarding' })
      .eq('id', (amb as { id: string }).id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: siteUrl + '/ambassadors/onboard?status=refresh',
    return_url: siteUrl + '/ambassadors/dashboard?onboarding=complete',
    type: 'account_onboarding',
  });

  // Update status to onboarding if it was not already set
  await admin
    .from('ambassadors')
    .update({ stripe_account_status: 'onboarding' })
    .eq('id', (amb as { id: string }).id)
    .neq('stripe_account_status', 'active');

  return { ok: true, url: accountLink.url, expiresAt: accountLink.expires_at };
}

export async function fireAmbassadorPayout(
  referralId: string
): Promise<{ payout_id: string; transfer_id: string }> {
  const gate = await assertSuperAdmin();
  if (!gate.ok) throw new Error(gate.error);

  const supabase = serviceClient();
  const { data: ref, error: refErr } = await supabase
    .from('ambassador_referrals')
    .select('id, ambassador_id, reward_cents, status, paid_out_at, ambassador:ambassadors!ambassador_id (id, full_name, email, stripe_account_id, stripe_account_status)')
    .eq('id', referralId)
    .maybeSingle();
  if (refErr || !ref) throw new Error('Referral not found');

  if (ref.status !== 'approved' && ref.status !== 'auto_approved' && ref.status !== 'converted') {
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
    .update({ paid_out_at: new Date().toISOString(), stripe_transfer_id: transfer.id })
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
  const gate = await assertSuperAdmin();
  if (!gate.ok) throw new Error(gate.error);

  const supabase = serviceClient();
  const { data: refs, error } = await supabase
    .from('ambassador_referrals')
    .select('id, ambassador:ambassadors!ambassador_id (stripe_account_status)')
    .in('status', ['approved', 'auto_approved', 'converted'])
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
