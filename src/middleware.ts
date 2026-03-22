import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Positive allowlist: middleware only runs on routes that require auth checks.
// Everything else — manifest.json, static assets, public marketing pages — is
// completely excluded, eliminating the 401 errors on public resources.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/:path*',
    '/auth/callback',
  ],
};