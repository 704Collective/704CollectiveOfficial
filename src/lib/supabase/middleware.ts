import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { postAuthDestination } from '@/lib/postAuthRedirect';

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

const HIDE_CRM_AND_PARTNERS = true; // reversible: set false to restore CRM + Partner Portal access

function getHiddenSectionRedirect(pathname: string, search: string): string | null {
  // CARVE-OUT FIRST: keep the live email/campaigns tool reachable
  if (pathname === '/admin/crm/campaigns' || pathname.startsWith('/admin/crm/campaigns/')) return null;
  // MEMBER / PARTNER-PORTAL → /dashboard
  if (pathname === '/partner-portal' || pathname.startsWith('/partner-portal/')) return '/dashboard';
  if (pathname === '/dashboard/partners' || pathname.startsWith('/dashboard/partners/')) return '/dashboard';
  // ADMIN CRM/PARTNER → /admin
  if (pathname === '/admin/crm' || pathname.startsWith('/admin/crm/')) return '/admin';
  if (pathname === '/admin/partners' || pathname.startsWith('/admin/partners/')) return '/admin';
  if (pathname === '/admin/invoices' || pathname.startsWith('/admin/invoices/')) return '/admin';
  if (pathname === '/partners/admin' || pathname.startsWith('/partners/admin/')) return '/admin';
  // INQUIRIES oddball (query param on /admin) — option B: block it too
  if (pathname === '/admin' && new URLSearchParams(search).get('section') === 'inquiries') return '/admin';
  return null;
}

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
      auth: {
        flowType: 'pkce',
      },
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── Route categories ────────────────────────────────────────────────────────
  const protectedPaths = [
    '/dashboard',
    '/admin',
    '/events/manage',
    '/business-portal',
    '/partner-portal',
    '/partners/dashboard',
    '/partners/admin',
    '/settings',
    '/pending-review',
  ];
  /** Public partner marketing + auth flows only (not /partners/dashboard). */
  const isPartnerPublicPath = (p: string) =>
    p === '/partners' ||
    p === '/partners/' ||
    p.startsWith('/partners/apply') ||
    p.startsWith('/partners/login') ||
    p.startsWith('/partners/signup');

  const openAuthPrefixes = ['/join', '/welcome', '/apply/business', '/signup'];
  const authPaths = ['/login'];
  const signupPaths: string[] = [];

  const isProtectedRoute = protectedPaths.some((p) => path.startsWith(p));
  const isAuthRoute = authPaths.some((p) => path.startsWith(p));
  const isOpenAuthRoute =
    openAuthPrefixes.some((p) => path.startsWith(p)) || isPartnerPublicPath(path);
  const isSignupRoute = signupPaths.some((p) => path.startsWith(p));

  // ── 0. Banned user check — scoped to meaningful routes to avoid a DB hit on every page load ──
  if (user && (isProtectedRoute || isOpenAuthRoute)) {
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
    const isPublicAdminAuth =
      path === '/admin/login' ||
      path === '/admin/login/' ||
      path === '/admin/request-access' ||
      path === '/admin/request-access/';
    if (isPublicAdminAuth) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    if (path.startsWith('/partners/dashboard')) {
      url.pathname = '/partners/login';
      url.searchParams.set('redirect', path);
    } else {
      url.pathname = '/login';
      url.searchParams.set('redirect', path);
    }
    return NextResponse.redirect(url);
  }

  // ── 2. Logged in hitting /login → role-appropriate home ────────────────────
  if (isAuthRoute && user) {
    const { data: loginProfile } = await supabase
      .from('profiles')
      .select('role, member_type, subscription_status, membership_override')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    // No profile means a "ghost" OAuth session with no 704 account.
    // Let the request reach /login so the page can sign them out cleanly
    // and they can start registration from scratch.
    if (!loginProfile) {
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = postAuthDestination(loginProfile);
    return NextResponse.redirect(url);
  }

  // ── 3. Exempt routes — no further checks ───────────────────────────────────
  if (isOpenAuthRoute || isSignupRoute) {
    return supabaseResponse;
  }

  if (HIDE_CRM_AND_PARTNERS) {
    const target = getHiddenSectionRedirect(path, request.nextUrl.search);
    const stripInquiriesQuery =
      path === '/admin' &&
      new URLSearchParams(request.nextUrl.search).get('section') === 'inquiries';
    if (target && (path !== target || stripInquiriesQuery)) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      url.search = ''; // strip any query (e.g. ?section=inquiries) so the redirect target is clean
      return NextResponse.redirect(url);
    }
  }

  // ── 4. Logged-in protected route checks ────────────────────────────────────
  if (user && isProtectedRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'role, member_type, subscription_status, membership_override, is_banned, application_status, partner_status'
      )
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    const role = profile?.role ?? 'lead';
    const isSuperAdmin = role === 'super_admin';
    const isAdmin = role === 'admin' || isSuperAdmin;
    const isActive =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing' ||
      profile?.membership_override === true;
    const isNonMember =
      profile?.member_type === 'social_non_member' ||
      profile?.member_type === 'business_non_member' ||
      profile?.member_type === 'non_member';
    const isBanned = profile?.is_banned === true;
    const isPending       = profile?.application_status === 'pending';
    const isPartner       = profile?.member_type === 'partner';

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

    // ── Admin-only routes (/admin includes /admin/crm/*) ─────────────────────
    if (path.startsWith('/admin') && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // ── Partner program /partners/admin — 704 admin or super_admin only ────────
    if (path.startsWith('/partners/admin') && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }

    // ── Partner portal — partner accounts only ────────────────────────────────
    if (path.startsWith('/partner-portal') && !isPartner) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // ── Subscription gate for member-only routes ─────────────────────────────
    // Non-members (social/business applicants) land on NonMemberDashboard — let through.
    // Canceled members are allowed into /dashboard (they see NonMemberDashboard there),
    // but blocked from /dashboard/settings and other portals.
    // Never-members (null / 'inactive' subscription, no override) also reach /dashboard.
    // past_due members keep dashboard + /settings so they can update billing.
    // Other bad states (unpaid, etc.) → /signup.
    const isCanceled =
      profile?.subscription_status === 'canceled' ||
      profile?.subscription_status === 'cancelled';
    const isPastDue = profile?.subscription_status === 'past_due';

    // Never had a membership — null or 'inactive' status with no override.
    const isNeverMember =
      (!profile?.subscription_status || profile?.subscription_status === 'inactive') &&
      !profile?.membership_override;

    // Routes that require an active membership even for canceled / never-members.
    const isHardGatedPath =
      path.startsWith('/partner-portal') ||
      path.startsWith('/business-portal') ||
      path.startsWith('/settings');

    // /dashboard (root and sub-pages) — canceled + never-members + past_due allowed through.
    const isDashboardOnly = path.startsWith('/dashboard');

    if (!isActive && !isAdmin && !isNonMember && !isPartner) {
      if (isHardGatedPath) {
        // past_due may use legacy /settings to update a card; other hard gates stay closed.
        if (!(isPastDue && path.startsWith('/settings'))) {
          // Canceled → membership-ended; never-members and others → signup.
          const url = request.nextUrl.clone();
          url.pathname = isCanceled ? '/membership-ended' : '/signup';
          return NextResponse.redirect(url);
        }
      }
      if (isDashboardOnly && !isCanceled && !isNeverMember && !isPastDue) {
        // Users with actively bad states (unpaid, etc.) → signup.
        const url = request.nextUrl.clone();
        url.pathname = '/signup';
        return NextResponse.redirect(url);
      }
      // Canceled, never-members, and past_due hitting /dashboard are let through.
    }
  }

  return supabaseResponse;
}