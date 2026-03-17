'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';

type Status = 'loading' | 'set-password' | 'success' | 'error';

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<Status>('loading');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Password setup state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const attemptRef = useRef(0);
  const maxAttempts = 5;
  const retryDelay = 2000;

  useEffect(() => {
    if (!sessionId) {
      router.replace('/dashboard');
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
          body: { session_id: sessionId },
        });

        if (error || data?.error) {
          attemptRef.current += 1;
          if (attemptRef.current < maxAttempts) {
            setTimeout(verify, retryDelay);
          } else {
            setErrorMsg(data?.error || 'Something went wrong verifying your session.');
            setStatus('error');
          }
          return;
        }

        const name = data?.name || data?.email || 'Member';
        const email = data?.email || '';
        setMemberName(name);
        setMemberEmail(email);

        // Show password setup for new members (never signed in)
        if (data?.requires_password_setup) {
          setStatus('set-password');
        } else {
          setStatus('success');
          setTimeout(() => router.push('/dashboard?welcome=1'), 3000);
        }
      } catch {
        attemptRef.current += 1;
        if (attemptRef.current < maxAttempts) {
          setTimeout(verify, retryDelay);
        } else {
          setStatus('error');
          setErrorMsg('Could not verify your checkout session.');
        }
      }
    };

    verify();
  }, [sessionId, router]);

  const handleSetPassword = async () => {
    setPasswordError('');

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-initial-password', {
        body: { session_id: sessionId, password },
      });

      if (error || data?.error) {
        setPasswordError(data?.error || 'Failed to set password. Please contact support.');
        setSettingPassword(false);
        return;
      }

      setStatus('success');
      setTimeout(() => router.push('/dashboard?welcome=1'), 3000);
    } catch {
      setPasswordError('Something went wrong. Please try again.');
      setSettingPassword(false);
    }
  };

  return (
    <>
      <Nav />
      <main
        style={{
          paddingTop: '64px',
          backgroundColor: '#0d0d0d',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: '420px', width: '100%', padding: '0 24px', textAlign: 'center' }}>

          {/* Loading */}
          {status === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <Loader2 style={{ width: '48px', height: '48px', color: '#C6A664', animation: 'spin 1s linear infinite' }} />
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Setting up your membership...
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }}>
                  This only takes a moment.
                </p>
              </div>
            </div>
          )}

          {/* Password Setup */}
          {status === 'set-password' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
              <div
                style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: 'rgba(198,166,100,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🔐</span>
              </div>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Welcome, {memberName.split(' ')[0]}!
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Your membership is confirmed. Set a password to access your portal.
                </p>
              </div>

              <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {memberEmail && (
                  <div>
                    <Label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem' }}>Email</Label>
                    <p style={{ color: '#FFFFFF', fontSize: '0.9375rem', marginTop: '4px' }}>{memberEmail}</p>
                  </div>
                )}

                <div>
                  <Label htmlFor="password" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    Create a Password
                  </Label>
                  <div style={{ position: 'relative', marginTop: '6px' }}>
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', paddingRight: '44px' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirm-password" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    Confirm Password
                  </Label>
                  <div style={{ position: 'relative', marginTop: '6px' }}>
                    <Input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', paddingRight: '44px' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <p style={{ color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>{passwordError}</p>
                )}

                <Button
                  variant="hero"
                  onClick={handleSetPassword}
                  disabled={settingPassword || !password || !confirmPassword}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  {settingPassword ? (
                    <><Loader2 style={{ width: '16px', height: '16px', marginRight: '8px', animation: 'spin 1s linear infinite' }} />Setting up...</>
                  ) : (
                    'Access My Portal →'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <CheckCircle style={{ width: '56px', height: '56px', color: '#22c55e' }} />
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Welcome to 704, {memberName.split(' ')[0]}!
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Your membership is active. You&apos;re being taken to your dashboard now.
                </p>
              </div>
              <div style={{ width: '100%', height: '2px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: '#C6A664', animation: 'progress 3s linear forwards' }} />
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <XCircle style={{ width: '48px', height: '48px', color: '#ef4444' }} />
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Something went wrong
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', marginBottom: '24px' }}>
                  {errorMsg || "We couldn't verify your session. Your payment may still have gone through."}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                <Button variant="hero" onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
                <Button variant="outline" asChild>
                  <a href="mailto:hello@704collective.com">Contact Support</a>
                </Button>
              </div>
            </div>
          )}

        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes progress { from { width: 0% } to { width: 100% } }
      `}</style>
    </>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d' }} />}>
      <WelcomeContent />
    </Suspense>
  );
}