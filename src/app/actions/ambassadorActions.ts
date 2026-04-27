'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

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
