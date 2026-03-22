import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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

        const isNonMember =
          profile?.member_type === 'social_non_member' ||
          profile?.member_type === 'business_non_member' ||
          profile?.member_type === 'non_member';

        // Came from login page and not an active member/admin/non-member portal user —
        // delete the auto-created user so Supabase stays clean,
        // then redirect to signup with a toast message
        if (source === 'login' && !isActive && !isAdmin && !isNonMember) {
          // Use service role to delete the ghost user
          const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          await adminClient.auth.admin.deleteUser(user.id);

          return NextResponse.redirect(
            new URL('/signup?error=no_account', origin)
          );
        }

        // Non-members (social/business applicants) → their portal dashboard
        if (isNonMember) {
          return NextResponse.redirect(new URL('/dashboard', origin));
        }

        // New signup without active subscription → send to signup
        if (!isActive && !isAdmin) {
          return NextResponse.redirect(new URL('/signup', origin));
        }

        // Active member or admin → dashboard
        return NextResponse.redirect(new URL('/dashboard', origin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login?error=oauth', origin));
}