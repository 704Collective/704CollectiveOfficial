import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';

const limiter = createRateLimiter('partner-signup', 5);

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const { success } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  /** Partner signup flow will be implemented in a later batch. */
  return NextResponse.json(
    { error: 'Not implemented', message: 'Partner signup API is not wired yet.' },
    { status: 501 }
  );
}
