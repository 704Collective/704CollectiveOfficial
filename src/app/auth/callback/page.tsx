'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/704-logo.png';
import { createClient } from '@/lib/supabase/client';

// Full-screen loading overlay — renders immediately and stays until the
// redirect fires so the user never sees a blank screen during OAuth.
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

// Reads the ?code param, exchanges it for a session client-side, then
// redirects the user to the appropriate destination.
function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    const source = searchParams.get('source');

    const run = async () => {
      if (!code) {
        router.replace('/login?error=oauth');
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('[auth/callback] exchangeCodeForSession error:', error.message);
        router.replace('/login?error=oauth');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login?error=oauth');
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

      // Came from login page but has no active membership — send to signup
      if (source === 'login' && !isActive && !isAdmin && !isNonMember) {
        router.replace('/signup?error=no_account');
        return;
      }

      if (isNonMember) {
        router.replace('/dashboard');
        return;
      }

      if (!isActive && !isAdmin) {
        router.replace('/signup');
        return;
      }

      router.replace('/dashboard');
    };

    run();
  }, [searchParams, router]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <>
      {/* Loading screen renders immediately — visible during the entire
          async exchange so the user never sees a blank page. */}
      <LoadingScreen />

      {/* CallbackHandler uses useSearchParams() so it must be inside
          Suspense per Next.js App Router rules. */}
      <Suspense fallback={null}>
        <CallbackHandler />
      </Suspense>
    </>
  );
}
