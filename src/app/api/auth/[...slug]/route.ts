import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';

const limiter = createRateLimiter('api-auth', 10);

async function rateLimitOrContinue(request: NextRequest): Promise<NextResponse | null> {
  const ip = getRequestIp(request);
  const { success } = await limiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const blocked = await rateLimitOrContinue(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const blocked = await rateLimitOrContinue(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PUT(request: NextRequest) {
  const blocked = await rateLimitOrContinue(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PATCH(request: NextRequest) {
  const blocked = await rateLimitOrContinue(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(request: NextRequest) {
  const blocked = await rateLimitOrContinue(request);
  if (blocked) return blocked;
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
