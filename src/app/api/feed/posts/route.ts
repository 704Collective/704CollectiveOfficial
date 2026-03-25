import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createRateLimiter } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import { recordRateLimit429 } from '@/lib/rateLimitMetrics';

const limiter = createRateLimiter('feed-post-create', 30);

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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
            /* Server Component / Route Handler cookie edge cases */
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identifier = user?.id ?? getRequestIp(request);
  const { success } = await limiter.limit(identifier);

  if (!success) {
    await recordRateLimit429(request, '/api/feed/posts');
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  /**
   * Batch 1: rate-limit envelope for feed post creation. The portal still inserts
   * rows via Supabase; callers can hit this route first or migrate to a single API later.
   */
  return NextResponse.json(
    {
      ok: true,
      message: 'Rate limit passed. Persist posts via Supabase or a future dedicated endpoint.',
    },
    { status: 200 }
  );
}
