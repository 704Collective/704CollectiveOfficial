import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Stripe from 'stripe';
import { createRateLimiter } from '@/lib/upstash';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';

const limiter = createRateLimiter('create-checkout-session', 10);

function buildSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* Route Handler cookie edge cases */
          }
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success } = await limiter.limit(user.id);

  if (!success) {
    await recordRateLimit429(request, '/api/create-checkout-session');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    });

    // Price IDs are environment-specific. The STRIPE_SOCIAL_PRICE_ID env var
    // must be set to the current public price
    // (e.g. price_1TS9EJRzSIH3EgWLjM6zx5p4 for the $49 monthly tier).
    const standardPriceId = process.env.STRIPE_SOCIAL_PRICE_ID;
    if (!standardPriceId) {
      return NextResponse.json(
        { error: 'Price not configured', message: 'Price not configured' },
        { status: 500 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://704collective.com';

    // The embedded door sent no body until promo codes arrived; tolerate both.
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const rawPromoCode = typeof body.promoCode === 'string' ? body.promoCode.trim() : '';

    // ── Attribution, read from the member's OWN profile ─────────────────
    // Deliberately NOT from the request body. This door is reached from the
    // dashboard, where there is no ref link to carry a claim, so the only
    // trustworthy source is what was stamped on the profile when they first
    // arrived. Anything posted in the body is ignored outright.
    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by_code, referred_by_ambassador_id')
      .eq('id', user.id)
      .maybeSingle();

    const storedReferralCode =
      typeof profile?.referred_by_code === 'string' ? profile.referred_by_code.trim() : '';
    const storedAmbassadorId =
      typeof profile?.referred_by_ambassador_id === 'string' ? profile.referred_by_ambassador_id : '';

    // Re-validate live, mirroring create-checkout: the row must still exist,
    // still be active, and its code must still match what we stored. Stored
    // attribution is a claim, not a licence.
    let validatedAmbassadorId: string | null = null;
    let validatedReferralCode: string | null = null;
    if (storedAmbassadorId && storedReferralCode) {
      const { data: amb } = await supabase
        .from('ambassadors')
        .select('id, referral_code, is_active')
        .eq('id', storedAmbassadorId)
        .eq('is_active', true)
        .maybeSingle();
      if (amb && typeof amb.referral_code === 'string'
        && amb.referral_code.toLowerCase() === storedReferralCode.toLowerCase()) {
        validatedAmbassadorId = amb.id;
        validatedReferralCode = amb.referral_code;
      }
    }

    // A validated referral with no price configured must not show $35 and then
    // charge $49. Falling back keeps the door open at the standard rate, and
    // referralApplies is what the page renders from, so what is shown and what
    // is charged come from the same decision.
    const ambassadorPriceId = process.env.STRIPE_AMBASSADOR_SOCIAL_PRICE_ID;
    if (validatedAmbassadorId && !ambassadorPriceId) {
      console.warn('[CREATE-CHECKOUT-SESSION] AMBASSADOR_PRICE_UNCONFIGURED', {
        ambassador_id: validatedAmbassadorId,
      });
    }
    const referralApplies = Boolean(validatedAmbassadorId && ambassadorPriceId);
    const priceId = referralApplies ? ambassadorPriceId! : standardPriceId;

    // Optional server-side promo attach. Native Stripe Checkout promo box is
    // broken account-wide, so codes are resolved here and attached by id.
    // No allow_promotion_codes. Referral wins: ambassador + promo → ignore promo.
    let resolvedPromoId: string | null = null;
    if (rawPromoCode && referralApplies) {
      console.log('[CREATE-CHECKOUT-SESSION] PROMO_IGNORED_AMBASSADOR', {
        code: rawPromoCode,
        ambassador_id: validatedAmbassadorId,
      });
    } else if (rawPromoCode) {
      const promoList = await stripe.promotionCodes.list({
        code: rawPromoCode,
        active: true,
        limit: 1,
      });
      const found = promoList.data[0];
      if (!found) {
        return NextResponse.json(
          { error: 'invalid_promo_code', message: 'invalid_promo_code' },
          { status: 400 }
        );
      }
      resolvedPromoId = found.id;
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: user.email,
      client_reference_id: user.id,
      // The webhook keys the ambassador credit off these three, reading
      // session.metadata.ambassador_id / referral_code / ambassador_tier
      // (supabase/functions/stripe-webhook/index.ts:644-646).
      metadata: {
        user_id: user.id,
        source: 'join_checkout',
        ...(referralApplies
          ? {
              ambassador_id: validatedAmbassadorId!,
              referral_code: validatedReferralCode ?? '',
              ambassador_tier: 'social',
            }
          : {}),
      },
      ...(resolvedPromoId ? { discounts: [{ promotion_code: resolvedPromoId }] } : {}),
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      referral: { applied: referralApplies, code: referralApplies ? validatedReferralCode : null },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe checkout session error');
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
