'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/704-logo.png';
import { handleOAuthCallback } from './actions';

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
 * Reads ?code from the URL, calls the server action to exchange it for a
 * session (server-side, so auth cookies are set correctly for the middleware),
 * then navigates to the returned destination.
 *
 * A hasRunRef guard ensures the exchange is attempted exactly once even in
 * React Strict Mode or if the component re-renders before the redirect fires.
 * A 15-second timeout forces a redirect to /login if the server action hangs.
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

    // Safety net: if the server action hasn't resolved in 15 s, force a redirect
    // so the user is never permanently stuck on the loading screen.
    const timeoutId = setTimeout(() => {
      console.error('[auth/callback] Timeout waiting for session exchange — forcing redirect');
      router.replace('/login?error=oauth_failed');
    }, 15_000);

    handleOAuthCallback(code, source)
      .then((destination) => {
        clearTimeout(timeoutId);
        router.replace(destination);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('[auth/callback] handleOAuthCallback threw:', err);
        router.replace('/login?error=oauth_failed');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once

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
