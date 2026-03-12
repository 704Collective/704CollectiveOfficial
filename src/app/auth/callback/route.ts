import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const source = requestUrl.searchParams.get('source'); // 'login' or undefined (signup)

  if (code) {
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
            } catch {}
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status, membership_override, member_type')
          .eq('id', user.id)
          .maybeSingle();

        const isActive =
          profile?.subscription_status === 'active' ||
          profile?.subscription_status === 'trialing' ||
          profile?.membership_override === true;

        const isAdmin = profile?.member_type === 'admin';

        // If came from login page and not an active member → they don't have an account
        // Sign them out and redirect to login with error
        if (source === 'login' && !isActive && !isAdmin) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL('/login?error=no_account', requestUrl.origin)
          );
        }

        // If came from signup and not active → send to checkout
        if (!isActive && !isAdmin) {
          return NextResponse.redirect(new URL('/join/checkout', requestUrl.origin));
        }

        // Active member or admin → dashboard
        return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login?error=oauth', requestUrl.origin));
}