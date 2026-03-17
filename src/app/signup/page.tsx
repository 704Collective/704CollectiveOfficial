'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /signup now redirects to Stripe checkout.
// Account creation happens post-payment on /welcome.
export default function SignupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/join/checkout');
  }, [router]);

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '32px', height: '32px',
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: '#C6A664',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}