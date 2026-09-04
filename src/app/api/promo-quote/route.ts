import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { PromoDuration } from '@/lib/promoQuote';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Display-only. Reads an active promotion code + coupon. Never creates a
// Checkout Session, customer, or any other Stripe object. create-checkout
// remains the authority that attaches the code at pay time.

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const INVALID = NextResponse.json(
  { valid: false, reason: 'invalid_promo_code' },
  { headers: NO_STORE },
);
const UNAVAILABLE = NextResponse.json({ valid: false, error: 'unavailable' }, { status: 503, headers: NO_STORE });

function asDuration(value: string | undefined): PromoDuration | null {
  if (value === 'once' || value === 'repeating' || value === 'forever') return value;
  return null;
}

async function quote(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return INVALID;

  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!key) return UNAVAILABLE;

  try {
    const stripe = new Stripe(key, {
      apiVersion: '2026-02-25.clover',
      timeout: 8000,
      maxNetworkRetries: 0,
    });

    // Stripe matches `code` case-insensitively. active:true skips expired/disabled.
    const promoList = await stripe.promotionCodes.list({
      code: trimmed,
      active: true,
      limit: 1,
      expand: ['data.promotion.coupon'],
    });
    const found = promoList.data[0];
    if (!found) return INVALID;

    const coupon = found.promotion?.coupon;
    if (!coupon || typeof coupon === 'string') return UNAVAILABLE;

    const duration = asDuration(coupon.duration);
    if (!duration) return UNAVAILABLE;

    return NextResponse.json(
      {
        valid: true,
        percent_off: coupon.percent_off ?? null,
        amount_off: coupon.amount_off ?? null,
        duration,
        duration_in_months: coupon.duration_in_months ?? null,
      },
      { headers: NO_STORE },
    );
  } catch {
    return UNAVAILABLE;
  }
}

export async function GET(request: NextRequest) {
  return quote(request.nextUrl.searchParams.get('code') ?? '');
}

export async function POST(request: NextRequest) {
  let code = '';
  try {
    const body = (await request.json()) as { code?: string };
    code = body?.code ?? '';
  } catch {
    code = '';
  }
  return quote(code);
}
