import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const CANONICAL_ORIGIN = 'https://704collective.com';

/**
 * Production-only bounce off the raw Vercel deployment host.
 * Preview (`VERCEL_ENV=preview`) and every non-*.vercel.app host are untouched.
 * The canonical host never ends in `.vercel.app`, so this cannot loop.
 */
function productionVercelAppRedirect(request: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== 'production') return null;

  const hostHeader = request.headers.get('host') ?? request.nextUrl.host;
  const hostname = hostHeader.split(':')[0].toLowerCase();
  if (!hostname.endsWith('.vercel.app')) return null;

  return NextResponse.redirect(
    `${CANONICAL_ORIGIN}${request.nextUrl.pathname}${request.nextUrl.search}`,
    308,
  );
}

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
  const hostBounce = productionVercelAppRedirect(request);
  if (hostBounce) return hostBounce;

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
