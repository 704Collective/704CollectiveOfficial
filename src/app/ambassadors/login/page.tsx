'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

function AmbassadorLoginInner() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Show invite expiry error if redirected from /ambassadors/welcome
  const searchParams = useSearchParams();
  useEffect(() => {
    const inviteError = searchParams.get('invite_error');
    if (inviteError) {
      setError('Your invite link has expired or is invalid. Please contact an admin to resend your invite.');
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authErr || !data.user) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }
      // Verify the authenticated user is an ambassador
      const { data: amb, error: ambErr } = await supabase
        .from('ambassadors')
        .select('id')
        .eq('profile_id', data.user.id)
        .maybeSingle();
      if (ambErr || !amb) {
        await supabase.auth.signOut();
        setError(
          "This account isn't linked to an ambassador portal. If you're a 704 Collective member, please log in at /login. If you should have ambassador access, contact hello@704collective.com."
        );
        setLoading(false);
        return;
      }
      // Success
      router.push('/ambassadors/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/ambassadors/dashboard`,
        },
      });
      if (oauthErr) {
        setError(oauthErr.message);
        setLoading(false);
      }
      // On success the browser redirects to Google — no further code runs
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError('Please enter your email above first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/ambassadors/dashboard`,
          shouldCreateUser: false,
        },
      });
      if (otpErr) {
        setError(otpErr.message);
        setLoading(false);
        return;
      }
      setMagicLinkSent(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
      setLoading(false);
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    backgroundColor: '#0D0D0D',
    border: `1px solid ${focusedField === field ? 'rgba(198,166,100,0.5)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '0.9375rem',
    outline: 'none',
    transition: 'border-color 200ms ease',
    boxSizing: 'border-box' as const,
    minHeight: '48px',
  });

  return (
    <>
      <Nav />
      <MarketingPageRoot>
        <div style={{
          minHeight: '100dvh',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          paddingTop: '80px',
        }}>
          <div style={{ width: '100%', maxWidth: '420px' }}>

            {/* Logo + heading */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '20px' }}>
                <img src="/logo-nav.svg" alt="704 Collective" width={40} height={40} />
              </Link>

              <div style={{ marginTop: '4px' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '4px 12px',
                  background: 'rgba(198,166,100,0.1)',
                  border: '1px solid rgba(198,166,100,0.25)',
                  borderRadius: '100px',
                  marginBottom: '12px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#C6A664" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span style={{ fontSize: '0.6875rem', color: '#C6A664', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ambassador Portal</span>
                </div>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.875rem' }}>
                  Sign in to track referrals, manage payouts, and more.
                </p>
              </div>
            </div>

            {/* Card */}
            <div style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: 'clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)',
            }}>
              <h1 style={{ margin: '0 0 24px', fontSize: '1.375rem', fontWeight: 700, color: '#FFFFFF' }}>
                Ambassador Login
              </h1>

              {/* Error banner */}
              {error && (
                <div style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                  color: '#f87171',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} noValidate>
                {/* Email */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="you@example.com"
                    style={inputStyle('email')}
                    disabled={loading}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                      Password
                    </label>
                    <Link
                      href="/reset-password"
                      style={{ fontSize: '0.8125rem', color: 'rgba(198,166,100,0.8)', textDecoration: 'none' }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    style={inputStyle('password')}
                    disabled={loading}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '13px',
                    backgroundColor: loading ? 'rgba(198,166,100,0.5)' : '#C6A664',
                    color: '#1A1A1A',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background-color 200ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '48px',
                  }}
                >
                  {loading ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>

                {magicLinkSent ? (
                  <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(198,166,100,0.1)', border: '1px solid rgba(198,166,100,0.3)', borderRadius: '8px', marginTop: '20px' }}>
                    <p style={{ color: '#C6A664', fontWeight: 600, fontSize: '0.9375rem', margin: 0 }}>
                      Check your email
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8125rem', margin: '6px 0 0' }}>
                      We sent a magic login link to {email}. Click it to sign in. The link expires in 60 minutes.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* OR divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 600 }}>OR</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
                    </div>

                    {/* Google OAuth */}
                    <button
                      type="button"
                      onClick={() => void handleGoogleSignIn()}
                      disabled={loading}
                      style={{ width: '100%', padding: '12px', background: '#FFFFFF', color: '#1A1A1A', border: 'none', borderRadius: '8px', fontSize: '0.9375rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Continue with Google
                    </button>

                    {/* Magic link */}
                    <button
                      type="button"
                      onClick={() => void handleMagicLink()}
                      disabled={loading}
                      style={{ width: '100%', marginTop: '10px', padding: '12px', background: 'transparent', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', fontSize: '0.9375rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                    >
                      Send me a magic link
                    </button>
                  </>
                )}
              </form>
            </div>

            {/* Footer links */}
            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)' }}>
              Not an ambassador?{' '}
              <a
                href="mailto:hello@704collective.com?subject=Ambassador%20Application"
                style={{ color: 'rgba(198,166,100,0.75)', textDecoration: 'none' }}
              >
                Apply here
              </a>
              {' · '}
              <Link href="/login" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
                Member login
              </Link>
            </div>

          </div>
        </div>

        {/* Spin keyframe */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </MarketingPageRoot>
    </>
  );
}

export default function AmbassadorLoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#C6A664', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <AmbassadorLoginInner />
    </Suspense>
  );
}
