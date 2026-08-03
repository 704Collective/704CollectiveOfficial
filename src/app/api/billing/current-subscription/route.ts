import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SubscriptionTierResponse {
  ok: boolean;
  // The fields below are only populated when ok === true
  tier?: 'social' | 'business' | 'partner' | 'unknown';
  tierLabel?: string;
  priceCents?: number;
  priceDisplay?: string;
  interval?: 'month' | 'year' | string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  isAmbassadorPrice?: boolean;
  discount?: {
    couponName: string;
    couponCode: string | null;
    percentOff: number | null;
    amountOffCents: number | null;
    durationInMonths: number | null;
  } | null;
  membershipOverride?: boolean;
  /** ISO date when set — external annual payer (not a Stripe sub). Additive; older clients ignore. */
  paidThrough?: string | null;
  error?: string;
}

const FALLBACK_RESPONSE: SubscriptionTierResponse = { ok: false };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' } as SubscriptionTierResponse,
        { status: 401 },
      );
    }

    // Pull profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select(
        'stripe_customer_id, subscription_id, subscription_status, member_type, membership_override, subscription_ends_at, cancel_at_period_end, external_paid_through',
      )
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { ok: false, error: 'Profile not found' } as SubscriptionTierResponse,
        { status: 404 },
      );
    }

    // Override short-circuit (access without Stripe). External payers first —
    // membership_override is only the access mechanism; external_paid_through
    // means they paid outside Stripe, not a comp.
    if (profile.membership_override === true) {
      const tier =
        profile.member_type === 'business'
          ? 'business'
          : profile.member_type === 'partner'
            ? 'partner'
            : 'social';
      const tierLabel =
        profile.member_type === 'business'
          ? 'Business Membership'
          : profile.member_type === 'partner'
            ? 'Partner'
            : 'Social Membership';

      if (profile.external_paid_through) {
        const paidThrough = new Date(profile.external_paid_through).toISOString();
        return NextResponse.json({
          ok: true,
          tier,
          tierLabel,
          priceCents: 0,
          priceDisplay: 'Annual member',
          interval: 'year',
          status: 'active',
          cancelAtPeriodEnd: false,
          trialEnd: null,
          currentPeriodEnd: null,
          isAmbassadorPrice: false,
          discount: null,
          membershipOverride: true,
          paidThrough,
        } as SubscriptionTierResponse);
      }

      return NextResponse.json({
        ok: true,
        tier,
        tierLabel,
        priceCents: 0,
        priceDisplay: 'Comped',
        interval: 'month',
        status: 'active',
        cancelAtPeriodEnd: false,
        trialEnd: null,
        currentPeriodEnd: null,
        isAmbassadorPrice: false,
        discount: null,
        membershipOverride: true,
        paidThrough: null,
      } as SubscriptionTierResponse);
    }

    // Partners get a no-billing path
    if (profile.member_type === 'partner') {
      return NextResponse.json({
        ok: true,
        tier: 'partner',
        tierLabel: 'Partner',
        priceCents: 0,
        priceDisplay: '-',
        interval: 'month',
        status: profile.subscription_status ?? 'active',
        cancelAtPeriodEnd: false,
        trialEnd: null,
        currentPeriodEnd: null,
        isAmbassadorPrice: false,
        discount: null,
      } as SubscriptionTierResponse);
    }

    // Need Stripe data for everyone else
    if (!profile.subscription_id) {
      // No Stripe sub - return a minimal response derived from profile
      return NextResponse.json({
        ok: true,
        tier: 'unknown',
        tierLabel:
          profile.member_type === 'business'
            ? 'Business Membership'
            : 'Social Membership',
        priceCents: 0,
        priceDisplay: '-',
        interval: 'month',
        status: profile.subscription_status ?? 'inactive',
        cancelAtPeriodEnd: !!profile.cancel_at_period_end,
        trialEnd: null,
        currentPeriodEnd: profile.subscription_ends_at,
        isAmbassadorPrice: false,
        discount: null,
      } as SubscriptionTierResponse);
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { ok: false, error: 'Stripe not configured' } as SubscriptionTierResponse,
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-02-25.clover' });

    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(profile.subscription_id, {
        expand: ['items.data.price.product', 'discount.coupon'],
      });
    } catch (err) {
      console.error('[api/billing/current-subscription] Stripe fetch failed:', err);
      // Tier from profile only — never invent a dollar amount when Stripe is unavailable.
      return NextResponse.json({
        ok: true,
        tier: profile.member_type === 'business' ? 'business' : 'social',
        tierLabel:
          profile.member_type === 'business'
            ? 'Business Membership'
            : 'Social Membership',
        priceCents: undefined,
        priceDisplay: undefined,
        interval: 'month',
        status: profile.subscription_status ?? 'unknown',
        cancelAtPeriodEnd: !!profile.cancel_at_period_end,
        trialEnd: null,
        currentPeriodEnd: profile.subscription_ends_at,
        isAmbassadorPrice: false,
        discount: null,
      } as SubscriptionTierResponse);
    }

    const item = subscription.items.data[0];
    if (!item) {
      return NextResponse.json(
        { ok: false, error: 'No subscription items' } as SubscriptionTierResponse,
        { status: 500 },
      );
    }

    const price = item.price;
    const product = typeof price.product === 'object' ? price.product : null;
    const productName = product && 'name' in product ? (product.name ?? '') : '';

    // Determine tier from price IDs and product names
    const businessPriceIds = [
      process.env.STRIPE_BUSINESS_PRICE_ID,
      process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    ].filter(Boolean) as string[];
    const socialPriceId = process.env.STRIPE_SOCIAL_PRICE_ID;
    const ambassadorPriceId = process.env.STRIPE_AMBASSADOR_SOCIAL_PRICE_ID; // may be undefined

    let tier: 'social' | 'business' | 'unknown' = 'unknown';
    let tierLabel = productName || 'Membership';
    let isAmbassadorPrice = false;

    if (businessPriceIds.includes(price.id)) {
      tier = 'business';
      tierLabel = 'Business Membership';
    } else if (price.id === socialPriceId) {
      tier = 'social';
      tierLabel = 'Social Membership';
    } else if (ambassadorPriceId && price.id === ambassadorPriceId) {
      tier = 'social';
      tierLabel = 'Social Membership (Ambassador)';
      isAmbassadorPrice = true;
    } else {
      // Fall back to product name
      const lower = productName.toLowerCase();
      if (lower.includes('business')) {
        tier = 'business';
        tierLabel = 'Business Membership';
      } else if (lower.includes('social')) {
        tier = 'social';
        tierLabel = 'Social Membership';
      }
    }

    // Build price display string
    const priceCents = price.unit_amount ?? 0;
    const priceDollars = (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
    const intervalRaw = price.recurring?.interval ?? 'month';
    const intervalDisplay = intervalRaw === 'year' ? 'year' : 'month';
    const priceDisplay = priceCents === 0 ? 'Free' : `$${priceDollars}/${intervalDisplay}`;

    // Surface active discount if present
    let discount: SubscriptionTierResponse['discount'] = null;
    const subDiscount = (subscription as unknown as { discount?: { coupon?: { id: string; name?: string | null; percent_off?: number | null; amount_off?: number | null; duration_in_months?: number | null } | null; promotion_code?: string | { code: string } | null } | null }).discount;
    if (subDiscount?.coupon) {
      const coupon = subDiscount.coupon;
      const promoCode = subDiscount.promotion_code;
      discount = {
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

    const subAny = subscription as unknown as {
      current_period_end?: number | null;
      trial_end?: number | null;
    };
    const itemPeriodEnd = (item as unknown as { current_period_end?: number | null }).current_period_end;
    const periodEndSec = subAny.current_period_end ?? itemPeriodEnd ?? null;
    const trialEndSec = subAny.trial_end ?? null;

    return NextResponse.json({
      ok: true,
      tier,
      tierLabel,
      priceCents,
      priceDisplay,
      interval: intervalDisplay,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: trialEndSec ? new Date(trialEndSec * 1000).toISOString() : null,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
      isAmbassadorPrice,
      discount,
    } as SubscriptionTierResponse);
  } catch (err) {
    console.error('[api/billing/current-subscription] Unexpected error:', err);
    return NextResponse.json(FALLBACK_RESPONSE, { status: 500 });
  }
}
