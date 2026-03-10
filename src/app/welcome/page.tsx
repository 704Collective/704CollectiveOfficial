'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';

type Status = 'loading' | 'success' | 'error';

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<Status>('loading');
  const [memberName, setMemberName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
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
          // Retry logic — webhook may not have fired yet
          attemptRef.current += 1;
          if (attemptRef.current < maxAttempts) {
            setTimeout(verify, retryDelay);
          } else {
            setErrorMsg(data?.error || 'Something went wrong verifying your session.');
            setStatus('error');
          }
          return;
        }

        setMemberName(data?.name || data?.email || 'Member');
        setStatus('success');

        // Redirect to dashboard after 3 seconds
        setTimeout(() => router.push('/dashboard?welcome=1'), 3000);
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

          {status === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <Loader2
                style={{
                  width: '48px',
                  height: '48px',
                  color: '#C6A664',
                  animation: 'spin 1s linear infinite',
                }}
              />
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
              <div
                style={{
                  width: '100%',
                  height: '2px',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderRadius: '1px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#C6A664',
                    animation: 'progress 3s linear forwards',
                  }}
                />
              </div>
            </div>
          )}

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
                <Button variant="hero" onClick={() => router.push('/dashboard')}>
                  Go to Dashboard
                </Button>
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
