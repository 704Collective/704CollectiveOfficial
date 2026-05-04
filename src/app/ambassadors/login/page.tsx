'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

export default function AmbassadorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
                <Image src="/logo-nav.png" alt="704 Collective" width={40} height={40} />
                <span style={{ color: '#FFFFFF', fontSize: 'clamp(1.25rem, 5vw, 1.5rem)', fontWeight: 600 }}>
                  704 Collective
                </span>
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