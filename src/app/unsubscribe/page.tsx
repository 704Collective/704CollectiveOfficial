'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, MailX } from 'lucide-react';
import Link from 'next/link';

// Resolve the recipient email from either the token param (real campaign links
// send ?token=base64("email:campaign_id")) or a plain ?email= param (bare links
// and legacy). Returns '' if neither yields an email.
function resolveEmail(token: string | null, emailParam: string | null): string {
  if (token) {
    try {
      const decoded = atob(token);
      const email = decoded.split(':')[0]?.trim();
      if (email && email.includes('@')) return email.toLowerCase();
    } catch {
      // malformed token: fall through to email param
    }
  }
  if (emailParam && emailParam.includes('@')) return emailParam.toLowerCase();
  return '';
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const rawToken = searchParams.get('token');
  const rawEmail = searchParams.get('email');
  const email = resolveEmail(rawToken, rawEmail);

  const [status, setStatus] = useState<'loading' | 'done' | 'resubscribed' | 'error' | 'idle'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!email) return;
    const supabase = createClient();
    setStatus('loading');

    // The unsubscribe write goes through the 'unsubscribe' edge function, which
    // uses the service-role key to update profiles + contacts. A direct client
    // write is blocked by RLS (anon_deny policies), so it must be server-side.
    (async () => {
      const { error } = await supabase.functions.invoke('unsubscribe', {
        body: { token: rawToken, email: rawEmail },
      });
      if (error) {
        setErrorMsg(error.message);
        setStatus('error');
      } else {
        setStatus('done');
      }
    })();
  }, [email, rawToken, rawEmail]);

  const handleResubscribe = async () => {
    const supabase = createClient();
    setStatus('loading');

    const { error } = await supabase.functions.invoke('unsubscribe', {
      body: { token: rawToken, email: rawEmail, resubscribe: true },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStatus('resubscribed');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#1A1A1A', color: '#FAF6F0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Logo */}
      <img
        src="https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704-logo.png"
        alt="704 Collective"
        width={140}
        className="mb-8"
      />

      <div className="w-full max-w-md text-center space-y-6"
        style={{ background: '#2E2E2E', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.10)', padding: '40px 32px' }}>

        {(status === 'idle' || status === 'loading') && !email && (
          <>
            <MailX className="w-12 h-12 mx-auto" style={{ color: '#C6A664' }} />
            <h1 className="text-xl font-semibold">Unsubscribe</h1>
            <p style={{ color: '#D8D8D8' }}>No email address provided. Please use the unsubscribe link from your email.</p>
            <Link href="/">
              <Button variant="outline" className="mt-2">Back to home</Button>
            </Link>
          </>
        )}

        {status === 'loading' && email && (
          <>
            <Loader2 className="w-12 h-12 mx-auto animate-spin" style={{ color: '#C6A664' }} />
            <p style={{ color: '#D8D8D8' }}>Updating your preferences...</p>
          </>
        )}

        {status === 'done' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: '#C6A664' }} />
            <h1 className="text-xl font-semibold">You&apos;ve been unsubscribed</h1>
            <p style={{ color: '#D8D8D8' }}>
              You have been unsubscribed from 704 Collective marketing emails.
              You&apos;ll still receive important account and event notifications.
            </p>
            <p style={{ color: '#A0A0A0', fontSize: '14px' }}>Changed your mind?</p>
            <Button
              onClick={handleResubscribe}
              style={{ background: '#C6A664', color: '#1A1A1A' }}
              className="font-semibold"
            >
              Resubscribe
            </Button>
          </>
        )}

        {status === 'resubscribed' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: '#C6A664' }} />
            <h1 className="text-xl font-semibold">You&apos;re resubscribed!</h1>
            <p style={{ color: '#D8D8D8' }}>Welcome back - you&apos;ll receive 704 Collective marketing emails again.</p>
            <Link href="/">
              <Button style={{ background: '#C6A664', color: '#1A1A1A' }} className="font-semibold">Back to home</Button>
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <MailX className="w-12 h-12 mx-auto" style={{ color: '#ef4444' }} />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p style={{ color: '#D8D8D8' }}>{errorMsg || 'We could not update your preferences. Please try again or contact hello@704collective.com.'}</p>
          </>
        )}
      </div>

      <p className="mt-8 text-sm" style={{ color: '#A0A0A0' }}>
        Questions? Email{' '}
        <a href="mailto:hello@704collective.com" style={{ color: '#C6A664' }}>hello@704collective.com</a>
      </p>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1A1A1A' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C6A664' }} />
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
