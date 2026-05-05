'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

interface AmbassadorRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  referral_code: string;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function AmbassadorWelcomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [ambassador, setAmbassador] = useState<AmbassadorRow | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<{
    fullUrl: string;
    search: string;
    hash: string;
    code: string | null;
    pkceAttempted: boolean;
    pkceError: string | null;
    hasUser: boolean;
    userId: string | null;
    finalAction: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fullUrl = window.location.href;
      const search = window.location.search;
      const hash = window.location.hash;

      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      const diag = {
        fullUrl, search, hash, code,
        pkceAttempted: false,
        pkceError: null as string | null,
        hasUser: false,
        userId: null as string | null,
        finalAction: '',
      };

      if (code) {
        diag.pkceAttempted = true;
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeErr) {
          diag.pkceError = exchangeErr.message;
        } else {
          window.history.replaceState({}, '', '/ambassadors/welcome');
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      diag.hasUser = !!user;
      diag.userId = user?.id ?? null;

      if (!user) {
        diag.finalAction = 'No user — would normally redirect to /ambassadors/login';
        setDiagnostic(diag);
        setLoading(false);
        return;
      }

      const { data: amb } = await supabase
        .from('ambassadors')
        .select('id, email, full_name, phone, referral_code')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (cancelled) return;
      if (!amb) {
        diag.finalAction = 'User exists but no ambassador row — signing out';
        setDiagnostic(diag);
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      diag.finalAction = 'Success — proceeding to setup form';
      setUserId(user.id);
      setAmbassador(amb as AmbassadorRow);
      if (amb.full_name && amb.full_name !== '(Pending Setup)') setFullName(amb.full_name);
      if (amb.phone) setPhone(formatPhone(amb.phone));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !ambassador || submitting) return;
    setError(null);

    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) { setError('Please enter a valid 10-digit phone number'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName.trim(), phone: cleanPhone },
      });
      if (pwErr) throw new Error(pwErr.message);

      const { error: ambErr } = await supabase
        .from('ambassadors')
        .update({ full_name: fullName.trim(), phone: cleanPhone })
        .eq('id', ambassador.id);
      if (ambErr) throw new Error(ambErr.message);

      toast.success('Welcome! Setup complete.');
      router.push('/ambassadors/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <Nav />
        <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '36px', height: '36px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#C6A664', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  if (diagnostic) {
    return (
      <>
        <Nav />
        <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            padding: '24px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,80,80,0.4)',
            borderRadius: '12px',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            lineHeight: '1.6',
          }}>
            <h3 style={{ color: '#ff6666', marginTop: 0 }}>Welcome page diagnostic</h3>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(diagnostic, null, 2)}
            </pre>
            <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.65)' }}>
              Screenshot this and send it to support.
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)',
  };
  const fieldWrap: React.CSSProperties = { marginBottom: '16px' };
  const goldStar = <span style={{ color: '#C6A664' }}>*</span>;

  return (
    <>
      <Nav />
      <MarketingPageRoot>
        <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', paddingTop: '100px', paddingBottom: '48px' }}>
          <div style={{ width: '100%', maxWidth: '420px' }}>

            {/* Logo + heading */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '20px' }}>
                <Image src="/logo-nav.png" alt="704 Collective" width={40} height={40} />
                <span style={{ color: '#FFFFFF', fontSize: 'clamp(1.25rem, 5vw, 1.5rem)', fontWeight: 600 }}>704 Collective</span>
              </Link>
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: 'rgba(198,166,100,0.1)', border: '1px solid rgba(198,166,100,0.25)', borderRadius: '100px', marginBottom: '12px' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#C6A664" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  <span style={{ fontSize: '0.6875rem', color: '#C6A664', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ambassador Portal</span>
                </div>
                <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', fontWeight: 700, color: '#FFFFFF' }}>Welcome to 704 Collective Ambassadors</h1>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.875rem' }}>Complete your account setup to access your dashboard.</p>
              </div>
            </div>

            {/* Referral code box */}
            <div style={{ background: 'rgba(198,166,100,0.10)', border: '1px solid rgba(198,166,100,0.30)', borderRadius: '12px', padding: '16px', textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Your referral code</p>
              <p style={{ margin: '0 0 4px', fontSize: '2rem', fontWeight: 700, color: '#C6A664', fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '0.06em' }}>{ambassador?.referral_code ?? '—'}</p>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>Share this with anyone you refer.</p>
            </div>

            {/* Setup card */}
            <div style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: 'clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF' }}>Complete your profile</h2>

              {error && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', color: '#f87171', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {error}
                </div>
              )}

              <form onSubmit={(e) => void handleSubmit(e)} noValidate>

                {/* Email read-only */}
                <div style={fieldWrap}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={ambassador?.email ?? ''} readOnly style={{ ...inputStyle('email-ro'), color: 'rgba(255,255,255,0.45)', cursor: 'default' }} />
                </div>

                {/* Full name */}
                <div style={fieldWrap}>
                  <label style={labelStyle}>Full name {goldStar}</label>
                  <input type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} onFocus={() => setFocusedField('fullName')} onBlur={() => setFocusedField(null)} placeholder="Jane Smith" style={inputStyle('fullName')} disabled={submitting} />
                </div>

                {/* Phone */}
                <div style={fieldWrap}>
                  <label style={labelStyle}>Phone {goldStar}</label>
                  <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} placeholder="(704) 555-0123" style={inputStyle('phone')} disabled={submitting} />
                </div>

                {/* Password */}
                <div style={fieldWrap}>
                  <label style={labelStyle}>Password {goldStar}</label>
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} placeholder="Min. 8 characters" style={inputStyle('password')} disabled={submitting} />
                </div>

                {/* Confirm password */}
                <div style={{ marginBottom: '28px' }}>
                  <label style={labelStyle}>Confirm password {goldStar}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Re-enter password"
                    style={{ ...inputStyle('confirmPassword'), ...(confirmPassword.length > 0 && confirmPassword !== password ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }}
                    disabled={submitting}
                  />
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: '#f87171' }}>Passwords do not match</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: '100%', padding: '13px', backgroundColor: submitting ? 'rgba(198,166,100,0.5)' : '#C6A664', color: '#1A1A1A', border: 'none', borderRadius: '8px', fontSize: '0.9375rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', transition: 'background-color 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '48px' }}
                >
                  {submitting ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      Setting up…
                    </>
                  ) : 'Complete Setup'}
                </button>
              </form>
            </div>

            {/* Footer */}
            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)' }}>
              Already set up?{' '}
              <Link href="/ambassadors/login" style={{ color: 'rgba(198,166,100,0.75)', textDecoration: 'none' }}>Log in</Link>
            </div>

          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </MarketingPageRoot>
    </>
  );
}
