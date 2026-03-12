import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

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
      // Check subscription status — gate non-paying users to checkout
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status, membership_override')
          .eq('id', user.id)
          .maybeSingle();

        const isActive =
          profile?.subscription_status === 'active' ||
          profile?.subscription_status === 'trialing' ||
          profile?.membership_override === true;

        if (!isActive) {
          return NextResponse.redirect(new URL('/join/checkout', requestUrl.origin));
        }
      }
      return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=oauth', requestUrl.origin));
}