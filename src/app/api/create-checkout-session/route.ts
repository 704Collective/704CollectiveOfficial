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
    const priceId = process.env.STRIPE_SOCIAL_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: 'Price not configured', message: 'Price not configured' },
        { status: 500 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://704collective.com';

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { user_id: user.id, source: 'join_checkout' },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe checkout session error');
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
