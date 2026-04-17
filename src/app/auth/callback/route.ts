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

    // Recovery: always land on /reset-password so the user can set a new password.
    // Must run before postAuthDestination, which would send admins to /admin.
    if (type === 'recovery') {
      const recoveryRedirect = NextResponse.redirect(new URL('/reset-password', origin));
      pendingCookies.forEach(({ name, value, options }) => {
        recoveryRedirect.cookies.set(name, value, options as Parameters<typeof recoveryRedirect.cookies.set>[2]);
      });
      return recoveryRedirect;
    }

    // Signup confirmations: always redirect to /join to pick a plan and complete checkout.
    if (type === 'signup') {
      const signupRedirect = NextResponse.redirect(new URL('/join', origin));
      pendingCookies.forEach(({ name, value, options }) => {
        signupRedirect.cookies.set(name, value, options as Parameters<typeof signupRedirect.cookies.set>[2]);
      });
      return signupRedirect;
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

  // Recovery: always land on /reset-password before any profile / access check.
  // Admins would otherwise be redirected to /admin via postAuthDestination.
  if (type === 'recovery') {
    const recoveryRedirect = NextResponse.redirect(new URL('/reset-password', origin));
    pendingCookies.forEach(({ name, value, options }) => {
      recoveryRedirect.cookies.set(name, value, options as Parameters<typeof recoveryRedirect.cookies.set>[2]);
    });
    return recoveryRedirect;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_status, membership_override, member_type, created_at')
    .eq('id', user.id)
    .maybeSingle();

  // Signup flow: Supabase's PKCE email confirmation does not include `type`
  // in the redirect URL, so isSignupType will be false for real signups.
  // isNewProfile catches that case — a profile created within the last 60s
  // (or no profile yet due to async trigger) is treated as a new signup and
  // sent to /join to pick a plan and complete checkout.
  const isSignupType = type === 'signup';
  const isNewProfile =
    !profile ||
    (profile?.created_at &&
      Date.now() - new Date(profile.created_at).getTime() < 60_000);

  if (isSignupType || isNewProfile) {
    const joinRedirect = NextResponse.redirect(new URL('/join', origin));
    pendingCookies.forEach(({ name, value, options }) => {
      joinRedirect.cookies.set(name, value, options as Parameters<typeof joinRedirect.cookies.set>[2]);
    });
    return joinRedirect;
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
