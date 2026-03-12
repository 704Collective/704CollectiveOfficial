import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const source = requestUrl.searchParams.get('source');
  const origin = requestUrl.origin;

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

        // Came from login page but no active subscription → not a member
        // Redirect back to login with error — do NOT call signOut() as it
        // redirects to Supabase Site URL (localhost) instead of our origin
        if (source === 'login' && !isActive && !isAdmin) {
          return NextResponse.redirect(
            new URL('/login?error=no_account', origin)
          );
        }

        // New signup without active subscription → send to checkout
        if (!isActive && !isAdmin) {
          return NextResponse.redirect(new URL('/join/checkout', origin));
        }

        // Active member or admin → dashboard
        return NextResponse.redirect(new URL('/dashboard', origin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login?error=oauth', origin));
}