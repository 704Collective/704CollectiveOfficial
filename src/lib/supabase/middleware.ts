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

  const protectedPaths = ['/dashboard', '/admin', '/events/manage'];
  const authPaths = ['/login'];
  const isProtectedRoute = protectedPaths.some((p) => path.startsWith(p));
  const isAuthRoute = authPaths.some((p) => path.startsWith(p));

  // Not logged in trying to access protected route → login
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Logged in trying to access auth routes → dashboard
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Logged in on dashboard → check subscription, gate non-paying users
  if (user && path.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, membership_override, member_type')
      .eq('id', user.id)
      .maybeSingle();

    const isActive =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing' ||
      profile?.membership_override === true;

    // Admins (member_type = 'admin') bypass the subscription gate
    const isAdmin = profile?.member_type === 'admin';

    if (!isActive && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/join/checkout';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}