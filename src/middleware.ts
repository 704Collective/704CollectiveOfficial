import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Hard-bypass for manifest and other static resources — must be the very
  // first check so no auth logic runs for these paths regardless of matcher.
  const { pathname } = request.nextUrl;
  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    return NextResponse.next();
  }

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
    '/partners',
    '/partners/:path*',
    '/partner-portal',
    '/partner-portal/:path*',
    '/business-portal/:path*',
    '/settings',
    '/settings/:path*',
    '/pending-review',
  ],
};