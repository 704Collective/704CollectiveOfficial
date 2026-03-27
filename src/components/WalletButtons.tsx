'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GENERATE_WALLET_PASS_FUNCTION } from '@/lib/walletPass';
import { toast } from 'sonner';

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GoogleWalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.35 11.1h-9.17v2.73h5.51c-.24 1.27-1.33 3.71-5.51 3.71-3.32 0-6.03-2.75-6.03-6.14s2.71-6.14 6.03-6.14c1.9 0 3.16.81 3.88 1.5l2.65-2.55C16.77 2.4 14.57 1.5 11.68 1.5 5.86 1.5 1.18 6.18 1.18 12s4.68 10.5 10.5 10.5c6.06 0 10.07-4.26 10.07-10.26 0-.69-.08-1.21-.17-1.74z" />
    </svg>
  );
}

function useDevicePlatform() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod|macintosh/.test(ua) && 'ontouchend' in document) return 'apple';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
  }, []);
}

export function WalletButtons({ compact = false }: { compact?: boolean }) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const platform = useDevicePlatform();

  const handleGoogleWallet = async () => {
    // Open a tab synchronously on the click event so the browser does not block it as a popup
    // after the async edge-function call completes.
    const walletTab = window.open('', '_blank', 'noopener,noreferrer');
    setGoogleLoading(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase.functions.invoke(GENERATE_WALLET_PASS_FUNCTION, {
        body: { platform: 'google' },
      });

      if (error) {
        walletTab?.close();
        console.error('[WalletButtons] Edge function error:', error);
        toast.error('Could not connect to wallet service. Please try again.');
        return;
      }

      if (data?.error === 'Google Wallet not configured') {
        walletTab?.close();
        toast.error('Google Wallet is not configured yet. Check back soon!');
        return;
      }

      if (data?.error) {
        walletTab?.close();
        toast.error(typeof data.error === 'string' ? data.error : 'Wallet request failed.');
        return;
      }

      if (data?.walletUrl) {
        if (walletTab) {
          walletTab.opener = null;
          walletTab.location.href = data.walletUrl as string;
        } else {
          toast.info('Opening Google Wallet…', { duration: 2000 });
          window.location.assign(data.walletUrl as string);
        }
        return;
      }

      walletTab?.close();
      toast.error('No wallet link was returned. Try again or contact support.');
    } catch (err) {
      walletTab?.close();
      console.error('[WalletButtons] Unexpected error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Apple Wallet not ready yet — show holding message immediately, no API call needed
  const handleAppleWallet = () => {
    toast("We're polishing the Apple experience—hang tight, 704 fam! Use the Google link or show your profile for now.", {
      duration: 5000,
      icon: <Smartphone className="w-4 h-4 shrink-0" />,
      position: 'bottom-right',
    });
  };

  const isApplePrimary = platform === 'apple';

  if (compact) {
    return (
      <div className="flex flex-row flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" className="text-xs px-3" onClick={handleGoogleWallet} disabled={googleLoading}>
          {googleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GoogleWalletIcon className="w-3.5 h-3.5" />}
          Google
        </Button>
        <Button variant="outline" size="sm" className="text-xs px-3" onClick={handleAppleWallet}>
          <AppleIcon className="w-3.5 h-3.5" />
          Apple
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-4">
      {isApplePrimary ? (
        <>
          <Button variant="outline" className="w-full text-sm" onClick={handleAppleWallet}>
            <AppleIcon className="w-4 h-4" />
            Apple Wallet
          </Button>
          <Button variant="outline" className="w-full text-sm" onClick={handleGoogleWallet} disabled={googleLoading}>
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleWalletIcon className="w-4 h-4" />}
            Google Wallet
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="w-full text-sm" onClick={handleGoogleWallet} disabled={googleLoading}>
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleWalletIcon className="w-4 h-4" />}
            Google Wallet
          </Button>
          <Button variant="outline" className="w-full text-sm" onClick={handleAppleWallet}>
            <AppleIcon className="w-4 h-4" />
            Apple Wallet
          </Button>
        </>
      )}
    </div>
  );
}
