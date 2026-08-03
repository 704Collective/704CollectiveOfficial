import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type {
  BillingDiscount,
  MemberBillingResponse,
} from '@/lib/admin/member-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type { BillingDiscount, MemberBillingResponse } from '@/lib/admin/member-billing';

type RouteContext = { params: Promise<{ id: string }> };

async function requireAdmin(opts?: { superAdminOnly?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = me?.role;
  if (opts?.superAdminOnly) {
    if (role !== 'super_admin') {
      return { error: NextResponse.json({ ok: false, error: 'Super admin required' }, { status: 403 }) };
    }
  } else if (role !== 'admin' && role !== 'super_admin') {
    return { error: NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 }) };
  }
  return { supabase, user, role };
}

function extractDiscount(subscription: Stripe.Subscription): BillingDiscount | null {
  const subDiscount = (
    subscription as unknown as {
      discount?: {
        coupon?: {
          id: string;
          name?: string | null;
          percent_off?: number | null;
          amount_off?: number | null;
          duration_in_months?: number | null;
        } | null;
        promotion_code?: string | { code: string } | null;
      } | null;
    }
  ).discount;
  if (!subDiscount?.coupon) return null;
  const coupon = subDiscount.coupon;
  const promoCode = subDiscount.promotion_code;
  return {
    couponName: coupon.name || coupon.id,
    couponCode: promoCode
      ? typeof promoCode === 'string'
        ? promoCode
        : promoCode.code
      : null,
    percentOff: coupon.percent_off ?? null,
    amountOffCents: coupon.amount_off ?? null,
    durationInMonths: coupon.duration_in_months ?? null,
  };
}

async function loadStripeBilling(profile: {
  subscription_id: string | null;
  stripe_customer_id: string | null;
}): Promise<MemberBillingResponse['stripe']> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      found: false,
      subscriptionId: null,
      status: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      trialEnd: null,
      priceId: null,
      priceCents: null,
      priceDisplay: null,
      interval: null,
      productName: null,
      discount: null,
    };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' });

  let subscription: Stripe.Subscription | null = null;
  if (profile.subscription_id) {
    try {
      subscription = await stripe.subscriptions.retrieve(profile.subscription_id, {
        expand: ['items.data.price.product', 'discount.coupon'],
      });
    } catch (err) {
      console.error('[admin/members/billing] retrieve sub failed:', err);
    }
  }

  if (!subscription && profile.stripe_customer_id) {
    try {
      const list = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'all',
        limit: 5,
        expand: ['data.items.data.price.product', 'data.discount.coupon'],
      });
      subscription =
        list.data.find((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due') ??
        list.data[0] ??
        null;
    } catch (err) {
      console.error('[admin/members/billing] list subs failed:', err);
    }
  }

  if (!subscription) {
    return {
      found: false,
      subscriptionId: null,
      status: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      trialEnd: null,
      priceId: null,
      priceCents: null,
      priceDisplay: null,
      interval: null,
      productName: null,
      discount: null,
    };
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const product = price?.product && typeof price.product === 'object' ? price.product : null;
  const productName =
    product && !('deleted' in product && product.deleted) && 'name' in product
      ? (product.name ?? null)
      : null;
  const priceCents = price?.unit_amount ?? null;
  const intervalRaw = price?.recurring?.interval ?? null;
  const intervalDisplay = intervalRaw === 'year' ? 'year' : intervalRaw === 'month' ? 'month' : intervalRaw;
  const priceDisplay =
    priceCents == null
      ? null
      : priceCents === 0
        ? 'Free'
        : `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}${intervalDisplay ? `/${intervalDisplay}` : ''}`;

  const subAny = subscription as unknown as {
    current_period_end?: number | null;
    trial_end?: number | null;
  };
  const itemPeriodEnd = (item as unknown as { current_period_end?: number | null } | undefined)
    ?.current_period_end;
  const periodEndSec = subAny.current_period_end ?? itemPeriodEnd ?? null;
  const trialEndSec = subAny.trial_end ?? null;

  return {
    found: true,
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
    trialEnd: trialEndSec ? new Date(trialEndSec * 1000).toISOString() : null,
    priceId: price?.id ?? null,
    priceCents,
    priceDisplay,
    interval: intervalDisplay,
    productName,
    discount: extractDiscount(subscription),
  };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing member id' }, { status: 400 });
    }

    const { data: profile, error } = await auth.supabase!
      .from('profiles')
      .select(
        'id, email, full_name, member_type, subscription_status, membership_override, is_founding_member, is_locked_in_pricing, stripe_customer_id, subscription_id, subscription_ends_at, cancel_at_period_end, member_since, canceled_at, comp_reason, external_paid_through, external_payment_note',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[admin/members/billing] profile fetch:', error);
      return NextResponse.json({ ok: false, error: 'Failed to load profile' }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 });
    }

    const stripe = await loadStripeBilling(profile);

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        member_type: profile.member_type,
        subscription_status: profile.subscription_status,
        membership_override: !!profile.membership_override,
        is_founding_member: !!profile.is_founding_member,
        is_locked_in_pricing: !!profile.is_locked_in_pricing,
        stripe_customer_id: profile.stripe_customer_id,
        subscription_id: profile.subscription_id,
        subscription_ends_at: profile.subscription_ends_at,
        cancel_at_period_end: !!profile.cancel_at_period_end,
        member_since: profile.member_since,
        canceled_at: profile.canceled_at ?? null,
        comp_reason: profile.comp_reason,
        external_paid_through: profile.external_paid_through,
        external_payment_note: profile.external_payment_note,
      },
      stripe,
    } satisfies MemberBillingResponse);
  } catch (err) {
    console.error('[admin/members/billing] GET unexpected:', err);
    return NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin({ superAdminOnly: true });
    if ('error' in auth && auth.error) return auth.error;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing member id' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const updates: {
      comp_reason?: string | null;
      external_paid_through?: string | null;
      external_payment_note?: string | null;
      updated_at?: string;
    } = {};

    if ('comp_reason' in body) {
      if (body.comp_reason !== null && typeof body.comp_reason !== 'string') {
        return NextResponse.json({ ok: false, error: 'comp_reason must be string or null' }, { status: 400 });
      }
      const v = body.comp_reason === null ? null : String(body.comp_reason).trim();
      updates.comp_reason = v === '' ? null : v;
    }

    if ('external_payment_note' in body) {
      if (body.external_payment_note !== null && typeof body.external_payment_note !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'external_payment_note must be string or null' },
          { status: 400 },
        );
      }
      const v =
        body.external_payment_note === null ? null : String(body.external_payment_note).trim();
      updates.external_payment_note = v === '' ? null : v;
    }

    if ('external_paid_through' in body) {
      if (body.external_paid_through !== null && typeof body.external_paid_through !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'external_paid_through must be ISO date string or null' },
          { status: 400 },
        );
      }
      if (body.external_paid_through === null || body.external_paid_through === '') {
        updates.external_paid_through = null;
      } else {
        const d = new Date(String(body.external_paid_through));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { ok: false, error: 'external_paid_through is not a valid date' },
            { status: 400 },
          );
        }
        updates.external_paid_through = d.toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No editable fields provided (comp_reason, external_paid_through, external_payment_note)' },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
    }
    const admin = createServiceClient(serviceUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: updated, error } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select(
        'id, email, full_name, member_type, subscription_status, membership_override, is_founding_member, is_locked_in_pricing, stripe_customer_id, subscription_id, subscription_ends_at, cancel_at_period_end, member_since, canceled_at, comp_reason, external_paid_through, external_payment_note',
      )
      .maybeSingle();

    if (error) {
      console.error('[admin/members/billing] PATCH failed:', error);
      return NextResponse.json({ ok: false, error: 'Failed to update profile' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        member_type: updated.member_type,
        subscription_status: updated.subscription_status,
        membership_override: !!updated.membership_override,
        is_founding_member: !!updated.is_founding_member,
        is_locked_in_pricing: !!updated.is_locked_in_pricing,
        stripe_customer_id: updated.stripe_customer_id,
        subscription_id: updated.subscription_id,
        subscription_ends_at: updated.subscription_ends_at,
        cancel_at_period_end: !!updated.cancel_at_period_end,
        member_since: updated.member_since,
        canceled_at: updated.canceled_at ?? null,
        comp_reason: updated.comp_reason,
        external_paid_through: updated.external_paid_through,
        external_payment_note: updated.external_payment_note,
      },
    } satisfies Pick<MemberBillingResponse, 'ok' | 'profile'>);
  } catch (err) {
    console.error('[admin/members/billing] PATCH unexpected:', err);
    return NextResponse.json({ ok: false, error: 'Unexpected error' }, { status: 500 });
  }
}
