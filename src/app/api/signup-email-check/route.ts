import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';
import {
  JOIN_BLOCKED_EMAIL_MESSAGE,
  isEmailBlocked,
  normalizeJoinEmail,
} from '@/lib/blockedEmail';

const limiter = createRateLimiter('signup-email-check', 20);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const identifier = getRequestIp(request);
  const { success } = await limiter.limit(identifier);
  if (!success) {
    await recordRateLimit429(request, '/api/signup-email-check');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let email = '';
  try {
    const body = (await request.json()) as { email?: string };
    email = normalizeJoinEmail(body?.email ?? '');
  } catch {
    email = '';
  }
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const blocked = await isEmailBlocked(email);
    if (blocked) {
      return NextResponse.json(
        { blocked: true, error: JOIN_BLOCKED_EMAIL_MESSAGE },
        { status: 403 }
      );
    }
    return NextResponse.json({ blocked: false });
  } catch (err) {
    console.error('signup-email-check failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Unable to verify this email.' }, { status: 503 });
  }
}
