import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 200;

interface ApplyRequestBody {
  profileIds?: unknown;
}

export interface AppliedRow {
  profileId: string;
  email: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export interface ReconcileApplyResponse {
  ok: boolean;
  applied: AppliedRow[];
  successCount: number;
  failCount: number;
  error?: string;
}

interface ProfileRow {
  id: string;
  email: string;
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

function periodEndSeconds(
  sub: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
): number | null {
  const subAny = sub as unknown as { current_period_end?: number | null };
  const itemAny = item as unknown as { current_period_end?: number | null } | undefined;
  return subAny.current_period_end ?? itemAny?.current_period_end ?? null;
}

function pickActiveSub(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  const candidates = subs.filter((s) => ACTIVE_STRIPE_STATUSES.has(s.status));
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => b.created - a.created)[0]!;
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      out[k] = { from: before[k], to: after[k] };
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Unauthorized',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
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
        {
          ok: false,
          error: 'Forbidden',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 403 },
      );
    }

    let body: ApplyRequestBody;
    try {
      body = (await req.json()) as ApplyRequestBody;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid JSON body',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 400 },
      );
    }

    const rawIds = body.profileIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'profileIds must be a non-empty array',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 400 },
      );
    }

    const profileIds = Array.from(
      new Set(rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0)),
    ).slice(0, MAX_BATCH);

    if (profileIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No valid profileIds in body',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 400 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Stripe not configured',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' });

    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select(
        'id, email, member_type, subscription_status, subscription_id, stripe_customer_id, subscription_ends_at, cancel_at_period_end, membership_override, deleted_at',
      )
      .in('id', profileIds);

    if (profErr) {
      console.error('[STRIPE_RECONCILE] apply profile fetch failed:', profErr);
      return NextResponse.json(
        {
          ok: false,
          error: 'Profile fetch failed',
          applied: [],
          successCount: 0,
          failCount: 0,
        } as ReconcileApplyResponse,
        { status: 500 },
      );
    }

    const rows = (profiles ?? []) as ProfileRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const applied: AppliedRow[] = [];

    for (const id of profileIds) {
      const p = byId.get(id);

      if (!p) {
        applied.push({
          profileId: id,
          email: '(not found)',
          before: {},
          after: {},
          success: false,
          error: 'Profile not found',
        });
        continue;
      }

      // Guardrails: never sync these via this endpoint.
      if (p.deleted_at) {
        applied.push({
          profileId: id,
          email: p.email,
          before: {},
          after: {},
          success: false,
          error: 'Profile is soft-deleted; refusing to sync.',
        });
        continue;
      }

      if (p.membership_override === true) {
        applied.push({
          profileId: id,
          email: p.email,
          before: {},
          after: {},
          success: false,
          error: 'Profile has membership_override=true; refusing to overwrite admin-comped state.',
        });
        continue;
      }

      if (p.member_type === 'partner') {
        applied.push({
          profileId: id,
          email: p.email,
          before: {},
          after: {},
          success: false,
          error: 'Profile is a partner; no Stripe sync expected.',
        });
        continue;
      }

      if (!p.stripe_customer_id) {
        applied.push({
          profileId: id,
          email: p.email,
          before: {},
          after: {},
          success: false,
          error: 'Profile has no stripe_customer_id; cannot fetch Stripe state.',
        });
        continue;
      }

      const before: Record<string, unknown> = {
        subscription_status: p.subscription_status,
        subscription_id: p.subscription_id,
        subscription_ends_at: p.subscription_ends_at,
        cancel_at_period_end: !!p.cancel_at_period_end,
      };

      // Always re-fetch live Stripe state before writing.
      let subs: Stripe.Subscription[];
      try {
        const list = await stripe.subscriptions.list({
          customer: p.stripe_customer_id,
          status: 'all',
          limit: 5,
        });
        subs = list.data;
      } catch (err) {
        console.error('[STRIPE_RECONCILE] apply Stripe list failed for', p.email, err);
        applied.push({
          profileId: id,
          email: p.email,
          before,
          after: {},
          success: false,
          error: 'Stripe fetch failed; profile NOT updated.',
        });
        continue;
      }

      const activeSub = pickActiveSub(subs);
      const item = activeSub?.items.data[0];
      const periodEndSec = activeSub ? periodEndSeconds(activeSub, item) : null;

      let after: Record<string, unknown>;

      if (activeSub) {
        // Stripe has an active/trialing/past_due subscription: sync its state.
        after = {
          subscription_status: activeSub.status,
          subscription_id: activeSub.id,
          subscription_ends_at: periodEndSec
            ? new Date(periodEndSec * 1000).toISOString()
            : null,
          cancel_at_period_end: !!activeSub.cancel_at_period_end,
        };
      } else if (subs.length > 0) {
        // Stripe has subs but none are active: mark canceled.
        after = {
          subscription_status: 'canceled',
          subscription_id: null,
          subscription_ends_at: null,
          cancel_at_period_end: false,
        };
      } else {
        // Stripe has no subs at all for this customer.
        after = {
          subscription_status: 'inactive',
          subscription_id: null,
          subscription_ends_at: null,
          cancel_at_period_end: false,
        };
      }

      const changeDiff = computeDiff(before, after);

      if (Object.keys(changeDiff).length === 0) {
        console.log('[STRIPE_RECONCILE] apply noop', p.email, '(already in sync)');
        applied.push({ profileId: id, email: p.email, before, after, success: true });
        continue;
      }

      const { error: updErr } = await supabase
        .from('profiles')
        .update(after)
        .eq('id', id);

      if (updErr) {
        console.error('[STRIPE_RECONCILE] apply update failed', p.email, updErr);
        applied.push({
          profileId: id,
          email: p.email,
          before,
          after,
          success: false,
          error: updErr.message || 'Update failed',
        });
        continue;
      }

      console.log(
        '[STRIPE_RECONCILE] apply wrote',
        p.email,
        'diff=' + JSON.stringify(changeDiff),
      );
      applied.push({ profileId: id, email: p.email, before, after, success: true });
    }

    const successCount = applied.filter((a) => a.success).length;
    const failCount = applied.length - successCount;

    console.log(
      '[STRIPE_RECONCILE] apply batch complete requested=' +
        profileIds.length +
        ' success=' +
        successCount +
        ' fail=' +
        failCount,
    );

    return NextResponse.json({
      ok: true,
      applied,
      successCount,
      failCount,
    } as ReconcileApplyResponse);
  } catch (err) {
    console.error('[STRIPE_RECONCILE] apply unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'Server error',
        applied: [],
        successCount: 0,
        failCount: 0,
      } as ReconcileApplyResponse,
      { status: 500 },
    );
  }
}
