import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
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
  const path = request.nextUrl.pathname;

  // ── Route categories ────────────────────────────────────────────────────────
  const protectedPaths = ['/dashboard', '/admin', '/events/manage', '/business-portal'];
  const openAuthPaths    = ['/join/checkout', '/welcome'];        // exempt from subscription gate
  const authPaths        = ['/login'];
  const signupPaths      = ['/signup'];                           // non-paying users allowed

  const isProtectedRoute = protectedPaths.some((p) => path.startsWith(p));
  const isAuthRoute      = authPaths.some((p) => path.startsWith(p));
  const isOpenAuthRoute  = openAuthPaths.some((p) => path.startsWith(p));
  const isSignupRoute    = signupPaths.some((p) => path.startsWith(p));

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
    const isBanned        = profile?.banned === true;
    const isPending       = profile?.application_status === 'pending';

    // ── Banned users → login with error ──────────────────────────────────────
    if (isBanned) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'account_banned');
      return NextResponse.redirect(url);
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
    if (path.startsWith('/dashboard') && !isActive && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/join/checkout';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}