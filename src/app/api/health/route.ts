import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const result: {
    status: 'ok' | 'degraded';
    db: 'ok' | 'down';
    stripe: 'ok' | 'down';
    timestamp: string;
    durationMs?: number;
  } = { status: 'ok', db: 'ok', stripe: 'ok', timestamp: new Date().toISOString() };

  // DB reachability: trivial, RLS-free count probe (no data returned)
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
  } catch {
    result.db = 'down';
  }

  // Stripe reachability: one lightweight live call
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('no key');
    const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
    await stripe.prices.list({ limit: 1 });
  } catch {
    result.stripe = 'down';
  }

  if (result.db === 'down' || result.stripe === 'down') result.status = 'degraded';
  result.durationMs = Date.now() - started;

  return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 503 });
}
