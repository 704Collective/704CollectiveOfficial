import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that must bypass all authentication checks entirely.
// Keeps static/public assets from triggering Supabase getUser() calls,
// which would otherwise return 401 for unauthenticated requests.
const ALWAYS_PUBLIC = [
  '/manifest.json',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Hard bypass — return immediately without any Supabase auth work.
  if (ALWAYS_PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── Route categories ────────────────────────────────────────────────────────
  const protectedPaths = ['/dashboard', '/admin', '/events/manage', '/business-portal'];
  const openAuthPaths    = ['/join/checkout', '/welcome', '/apply/business', '/signup'];  // exempt from subscription gate
  const authPaths        = ['/login'];
  const signupPaths: string[] = [];                               // folded into openAuthPaths

  const isProtectedRoute = protectedPaths.some((p) => path.startsWith(p));
  const isAuthRoute      = authPaths.some((p) => path.startsWith(p));
  const isOpenAuthRoute  = openAuthPaths.some((p) => path.startsWith(p));
  const isSignupRoute    = signupPaths.some((p) => path.startsWith(p));

  // ── 0. Banned user check — applies to all authenticated users ─────────────
  if (user && !isAuthRoute) {
    const { data: banCheck } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (banCheck?.is_banned === true) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'banned');
      const bannedRedirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach(cookie => {
        bannedRedirect.cookies.set(cookie.name, cookie.value);
      });
      return bannedRedirect;
    }
  }

  // ── 1. Not logged in → redirect to login ───────────────────────────────────
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // ── 2. Logged in hitting login page → dashboard ────────────────────────────
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // ── 3. Exempt routes — no further checks ───────────────────────────────────
  if (isOpenAuthRoute || isSignupRoute) {
    return supabaseResponse;
  }

  // ── 4. Logged-in protected route checks ────────────────────────────────────
  if (user && isProtectedRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, member_type, subscription_status, membership_override, banned, application_status')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    const role            = profile?.role ?? 'lead';
    const isSuperAdmin    = role === 'super_admin';
    const isAdmin         = role === 'admin' || isSuperAdmin;
    const isActive        =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing' ||
      profile?.membership_override === true;
    const isNonMember     =
      profile?.member_type === 'social_non_member' ||
      profile?.member_type === 'business_non_member' ||
      profile?.member_type === 'non_member';
    const isBanned        = profile?.banned === true;
    const isPending       = profile?.application_status === 'pending';

    // ── Banned users → login with error (fallback check) ─────────────────────
    if (isBanned) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'banned');
      const bannedRedirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach(cookie => {
        bannedRedirect.cookies.set(cookie.name, cookie.value);
      });
      return bannedRedirect;
    }

    // ── Pending business applicants → holding page ────────────────────────────
    if (isPending && !isAdmin) {
      if (!path.startsWith('/pending-review')) {
        const url = request.nextUrl.clone();
        url.pathname = '/pending-review';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // ── Admin-only routes ─────────────────────────────────────────────────────
    if (path.startsWith('/admin') && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // ── Subscription gate for dashboard ──────────────────────────────────────
    // Non-members (social/business applicants) land on NonMemberDashboard — let them through
    if (path.startsWith('/dashboard') && !isActive && !isAdmin && !isNonMember) {
      const url = request.nextUrl.clone();
      url.pathname = '/signup';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}