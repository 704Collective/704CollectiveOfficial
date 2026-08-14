import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Canonical path for the /exchange intake routes, or null to leave the request alone.
 *
 * Printed and word-of-mouth links arrive with the wrong casing or truncated, and Next
 * routing is case-sensitive, so those all 404 today. This only ever fires when the first
 * segment is 'exchange'. Invite tokens are returned byte-for-byte: they are uppercase
 * EX-... by design, so only the 'exchange' and 'i' segments are ever lowercased.
 */
function canonicalExchangePath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments[0].toLowerCase() !== 'exchange') return null;

  // '/exchange' or '/exchange/' → the public form
  if (segments.length === 1) return '/exchange/rsvp';

  const second = segments[1].toLowerCase();
  if (segments.length === 2 && (second === 'rsvp' || second === 'commonwealth')) {
    return `/exchange/${second}`;
  }
  if (segments.length === 3 && second === 'i') {
    return `/exchange/i/${segments[2]}`;
  }

  // Anything else under /exchange falls through to the normal 404.
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/')
  ) {
    return NextResponse.next();
  }

  const canonical = canonicalExchangePath(pathname);
  if (canonical && canonical !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
