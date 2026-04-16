import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { postAuthDestination } from '@/lib/postAuthRedirect';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');
  const source = searchParams.get('source');

  const cookieStore = await cookies();

  // Collect cookies Supabase sets during the exchange so we can forward them
  // explicitly onto the redirect response. Without this, Set-Cookie headers
  // from cookieStore.set() are not automatically carried over to a
  // NextResponse.redirect() object, and the session would be lost.
  const pendingCookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Ignored when called from a Server Component context
            }
            pendingCookies.push({ name, value, options });
          });
        },
      },
    }
  );

  const origin = requestUrl.origin;

  // Magic link / email link PKCE: token_hash + type on query string
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      // GoTrue sends various `type` values (magiclink, signup, recovery, …)
      type: type as 'magiclink' | 'signup' | 'recovery' | 'invite' | 'email_change' | 'email',
    });
    if (error) {
      console.error('[auth/callback] verifyOtp (token_hash) error:', error.message);
      return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
    }

    const isActive =
      profile?.subscription_status === 'active' ||
      profile?.subscription_status === 'trialing' ||
      profile?.membership_override === true;

    const isAdmin =
      profile?.role === 'admin' ||
      profile?.role === 'super_admin';

    const isNonMember =
      profile?.member_type === 'social_non_member' ||
      profile?.member_type === 'business_non_member' ||
      profile?.member_type === 'non_member';

    const isPartner = profile?.member_type === 'partner';

    const allowed =
      isActive || isAdmin || isNonMember || isPartner;

    if (!allowed) {
      await supabase.auth.signOut();
      const isCanceled =
        profile?.subscription_status === 'canceled' ||
        profile?.subscription_status === 'cancelled';
      const noAccessPath = isCanceled ? '/membership-ended' : '/signup';
      const noAccessRedirect = NextResponse.redirect(new URL(noAccessPath, origin));
      pendingCookies.forEach(({ name, value, options }) => {
        noAccessRedirect.cookies.set(name, value, options as Parameters<typeof noAccessRedirect.cookies.set>[2]);
      });
      return noAccessRedirect;
    }

    const destination = postAuthDestination(profile);
    const redirectResponse = NextResponse.redirect(new URL(destination, origin));
    pendingCookies.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
    });
    return redirectResponse;
  }

  if (!code) {
    console.error('[auth/callback] No code in request — redirecting to login');
    return NextResponse.redirect(new URL('/login?error=oauth', origin));
  }

  let sessionError: Error | { message: string } | null = null;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  sessionError = error;
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
  }

  if (sessionError) {
    return NextResponse.redirect(new URL('/login?error=oauth', origin));
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('[auth/callback] No user after successful code exchange');
    return NextResponse.redirect(new URL('/login?error=oauth', origin));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_status, membership_override, member_type')
    .eq('id', user.id)
    .maybeSingle();

  const isActive =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing' ||
    profile?.membership_override === true;

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'super_admin';

  const isNonMember =
    profile?.member_type === 'social_non_member' ||
    profile?.member_type === 'business_non_member' ||
    profile?.member_type === 'non_member';

  const isPartner = profile?.member_type === 'partner';

  const allowed =
    isActive || isAdmin || isNonMember || isPartner;

  // No profile or no access: sign out before redirecting so the session
  // cookie is cleared. Without this the middleware sees an active session
  // and redirects every subsequent /login visit back to /signup (loop).
  if (!allowed) {
    await supabase.auth.signOut();
    // pendingCookies now contains the sign-out clear operations after the
    // session-set operations, so applying them in order wipes the session.
    const isCanceled =
      profile?.subscription_status === 'canceled' ||
      profile?.subscription_status === 'cancelled';
    const noAccessPath = isCanceled ? '/membership-ended' : '/signup';
    const noAccessRedirect = NextResponse.redirect(new URL(noAccessPath, origin));
    pendingCookies.forEach(({ name, value, options }) => {
      noAccessRedirect.cookies.set(name, value, options as Parameters<typeof noAccessRedirect.cookies.set>[2]);
    });
    return noAccessRedirect;
  }

  const destination = postAuthDestination(profile);
  const redirectResponse = NextResponse.redirect(new URL(destination, origin));

  // Forward the session cookies onto the redirect response so the browser
  // stores them and the proxy (session refresh) can verify the session on the next request.
  pendingCookies.forEach(({ name, value, options }) => {
    redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
  });

  return redirectResponse;
}
