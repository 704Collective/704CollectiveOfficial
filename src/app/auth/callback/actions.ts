'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server action: exchanges the OAuth PKCE code for a Supabase session.
 *
 * Runs server-side so it has access to HttpOnly cookies (including the PKCE
 * code-verifier set by signInWithOAuth) and can set the resulting auth
 * session cookies via Set-Cookie headers that the proxy will recognise
 * on the very next request.
 *
 * Returns the destination path the client should navigate to.
 */
export async function handleOAuthCallback(
  code: string,
  source: string | null
): Promise<string> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore — set-cookie errors in server actions are non-fatal
          }
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession error:', exchangeError.message);
    return '/login?error=oauth_failed';
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('[auth/callback] No user after successful code exchange');
    return '/login?error=oauth_failed';
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, membership_override, member_type, role')
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

  let destination = '/dashboard';

  if (source === 'login' && !isActive && !isAdmin && !isNonMember) {
    destination = '/signup?error=no_account';
  } else if (!isActive && !isAdmin && !isNonMember) {
    destination = '/signup';
  }

  return destination;
}
