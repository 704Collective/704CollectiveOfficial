import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';

const limiter = createRateLimiter('create-checkout-session', 10);

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const { success } = await limiter.limit(ip);

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

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://704collective.com';

    const prices = await stripe.prices.list({
      product: process.env.STRIPE_SOCIAL_PRODUCT_ID!,
      active: true,
      limit: 1,
    });

    if (!prices.data.length) {
      return NextResponse.json(
        { error: 'No active price found', message: 'No active price found' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      return_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe checkout session error');
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
