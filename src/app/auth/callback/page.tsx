'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/704-logo.png';
import { supabase } from '@/integrations/supabase/client';

// Full-screen loading overlay — renders immediately on page load and stays
// visible until the redirect fires, so the user never sees a blank screen.
function LoadingScreen() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <Image
        src={logo}
        alt="704 Collective"
        width={72}
        height={72}
        style={{ borderRadius: '18px', marginBottom: '32px' }}
        priority
      />

      {/* Gold spinner */}
      <div style={{ position: 'relative', width: '36px', height: '36px', marginBottom: '16px' }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid rgba(198,166,100,0.15)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#C6A664',
          animation: 'spin 0.75s linear infinite',
        }} />
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.01em' }}>
        Signing you in&hellip;
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/**
 * Reads ?code from the URL, exchanges it for a session using the shared
 * supabase singleton (the same instance AuthContext subscribes to), then
 * navigates to the appropriate destination.
 *
 * Using the shared singleton is critical: calling exchangeCodeForSession on
 * the same GoTrueClient instance that AuthContext's onAuthStateChange listener
 * is attached to guarantees the SIGNED_IN event fires immediately and auth
 * state is updated without requiring a manual page refresh.
 *
 * A hasRunRef guard ensures the exchange runs exactly once.
 * A 15-second timeout forces a fallback redirect so the user never gets stuck.
 */
function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const code = searchParams.get('code');
    const source = searchParams.get('source');

    if (!code) {
      console.error('[auth/callback] No code in URL — redirecting to login');
      router.replace('/login?error=oauth_failed');
      return;
    }

    // Safety net: force-redirect if the exchange hangs beyond 15 seconds.
    const timeoutId = setTimeout(() => {
      console.error('[auth/callback] Timeout waiting for session exchange — forcing redirect');
      router.replace('/login?error=oauth_failed');
    }, 15_000);

    const run = async () => {
      // Exchange the PKCE code for a session using the shared singleton.
      // This also fires SIGNED_IN on AuthContext's onAuthStateChange listener.
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        clearTimeout(timeoutId);
        console.error('[auth/callback] exchangeCodeForSession error:', exchangeError.message);
        router.replace('/login?error=oauth_failed');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        clearTimeout(timeoutId);
        console.error('[auth/callback] No user after successful code exchange');
        router.replace('/login?error=oauth_failed');
        return;
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

      console.log(`[auth/callback] Exchange OK — userId: ${user.id} → ${destination}`);

      clearTimeout(timeoutId);
      router.replace(destination);
    };

    run().catch((err) => {
      clearTimeout(timeoutId);
      console.error('[auth/callback] Unexpected error in OAuth flow:', err);
      router.replace('/login?error=oauth_failed');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once on mount

  return null;
}

export default function AuthCallbackPage() {
  return (
    <>
      {/* Renders immediately — visible for the entire duration of the exchange */}
      <LoadingScreen />

      {/* CallbackHandler uses useSearchParams() which requires Suspense */}
      <Suspense fallback={null}>
        <CallbackHandler />
      </Suspense>
    </>
  );
}
