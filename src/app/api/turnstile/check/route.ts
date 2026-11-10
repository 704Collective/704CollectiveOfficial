import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';
import {
  gateTurnstile,
  normalizeTurnstileForm,
  readCaptchaToken,
} from '@/lib/turnstile/verify';

const limiter = createRateLimiter('turnstile-check', 40);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const identifier = getRequestIp(request);
  const { success } = await limiter.limit(identifier);
  if (!success) {
    await recordRateLimit429(request, '/api/turnstile/check');
    return NextResponse.json(
      { error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const form = normalizeTurnstileForm(
    body && typeof body === 'object' ? String((body as { form?: unknown }).form ?? '') : '',
  );
  const token = readCaptchaToken(body);
  const denied = await gateTurnstile(request, form, token);
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
