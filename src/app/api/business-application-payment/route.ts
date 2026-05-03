import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Stripe from 'stripe';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';

const limiter = createRateLimiter('business-application-payment', 20);

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

// GET -- check whether the authenticated user already has a saved card on Stripe
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  const identifier = user?.id ?? getRequestIp(request);
  const { success } = await limiter.limit(identifier);
  if (!success) {
    await recordRateLimit429(request, '/api/business-application-payment');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const stripeCustomerId = profile?.stripe_customer_id as string | null | undefined;

    if (!stripeCustomerId) {
      return NextResponse.json({ hasPaymentMethod: false });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    });

    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
    });

    return NextResponse.json({
      hasPaymentMethod: paymentMethods.data.length > 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('business-application-payment GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST -- create (or reuse) a Stripe Customer and return a SetupIntent client secret
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  const identifier = user?.id ?? getRequestIp(request);
  const { success } = await limiter.limit(identifier);
  if (!success) {
    await recordRateLimit429(request, '/api/business-application-payment');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    });

    // Fetch the most recent business application for this user
    const { data: application, error: appError } = await supabase
      .from('business_applications')
      .select('id, stripe_customer_id, stripe_setup_intent_id')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appError) throw appError;

    if (!application) {
      return NextResponse.json(
        { error: 'No application to attach payment to' },
        { status: 400 }
      );
    }

    // Look up existing Stripe customer ID from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name, email, phone')
      .eq('id', user.id)
      .maybeSingle();

    let stripeCustomerId = profile?.stripe_customer_id as string | null | undefined;

    // Create a new Stripe customer if one does not exist yet
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        phone: profile?.phone ?? undefined,
        metadata: { supabase_user_id: user.id },
      });

      stripeCustomerId = customer.id;

      // Persist the new customer ID back to the profile
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);

      if (profileUpdateError) {
        console.error(
          'Failed to save stripe_customer_id to profile:',
          profileUpdateError.message
        );
      }
    }

    // Create a SetupIntent so the applicant can save a card without being charged.
    // usage: 'off_session' allows the card to be charged later (on admin approval).
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    // Record the customer ID and SetupIntent ID on the application row
    const { error: appUpdateError } = await supabase
      .from('business_applications')
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_setup_intent_id: setupIntent.id,
      })
      .eq('id', application.id);

    if (appUpdateError) {
      console.error(
        'Failed to save Stripe IDs to business_application:',
        appUpdateError.message
      );
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
      setupIntentId: setupIntent.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('business-application-payment POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}