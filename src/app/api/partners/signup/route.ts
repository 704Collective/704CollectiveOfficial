import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { runPartnerSignupFromFormData } from '@/lib/partnerSignupCore';

const limiter = createRateLimiter('partner-signup', 5);

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const { success } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests', message: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Server configuration error', message: 'Server configuration error' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid form data', message: 'Invalid form data' },
      { status: 400 }
    );
  }

  const result = await runPartnerSignupFromFormData(formData);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
