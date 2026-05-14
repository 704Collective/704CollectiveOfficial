'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { GENERATE_WALLET_PASS_FUNCTION } from '@/lib/walletPass';
import { toast } from 'sonner';
import { markOnboardingWalletDone } from '@/lib/onboardingStorage';
import { useAuth } from '@/hooks/useAuth';
import { downloadAppleWalletPass } from '@/lib/appleWallet';

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

/** Popup + blank-tab redirect is unreliable on mobile; use same-tab navigation after the edge call. */
function preferSameTabWalletOpen(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  try {
    return window.matchMedia('(max-width: 639px)').matches;
  } catch {
    return false;
  }
}

export function WalletButtons({ compact = false }: { compact?: boolean }) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const platform = useDevicePlatform();
  const { user } = useAuth();

  const handleGoogleWallet = async () => {
    const useSameTab = preferSameTabWalletOpen();
    // Desktop: open blank tab synchronously on click so async redirect is not blocked as a popup.
    const walletTab = useSameTab ? null : window.open('', '_blank', 'noopener,noreferrer');
    setGoogleLoading(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase.functions.invoke(GENERATE_WALLET_PASS_FUNCTION, {
        body: { platform: 'google' },
      });

      if (error) {
        walletTab?.close();
        console.error('[WalletButtons] Edge function error:', error);
        const msg =
          typeof (error as { message?: string }).message === 'string'
            ? (error as { message: string }).message
            : '';
        toast.error(
          msg && msg !== 'Edge Function returned a non-2xx status code'
            ? msg
            : 'Could not connect to wallet service. Please try again.'
        );
        return;
      }

      if (data?.error === 'Google Wallet not configured') {
        walletTab?.close();
        toast.error('Google Wallet is not configured yet. Ask an admin to set wallet secrets in Supabase.');
        return;
      }

      if (data?.error) {
        walletTab?.close();
        toast.error(typeof data.error === 'string' ? data.error : 'Wallet request failed.');
        return;
      }

      if (data?.walletUrl) {
        const url = data.walletUrl as string;
        if (user?.id) markOnboardingWalletDone(user.id);
        if (walletTab) {
          try {
            walletTab.opener = null;
            walletTab.location.href = url;
          } catch {
            walletTab.close();
            window.location.assign(url);
          }
        } else {
          window.location.assign(url);
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

  const handleAppleWallet = async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      await downloadAppleWalletPass();
    } finally {
      setAppleLoading(false);
    }
  };

  const isApplePrimary = platform === 'apple';

  if (compact) {
    return (
      <div className="flex flex-row flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" className="text-xs px-3" onClick={handleGoogleWallet} disabled={googleLoading}>
          {googleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GoogleWalletIcon className="w-3.5 h-3.5" />}
          Google
        </Button>
        <Button variant="outline" size="sm" className="text-xs px-3" onClick={handleAppleWallet} disabled={appleLoading}>
          {appleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AppleIcon className="w-3.5 h-3.5" />}
          Apple
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-4">
      {isApplePrimary ? (
        <>
          <Button variant="outline" className="w-full text-sm" onClick={handleAppleWallet} disabled={appleLoading}>
            {appleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AppleIcon className="w-4 h-4" />}
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
          <Button variant="outline" className="w-full text-sm" onClick={handleAppleWallet} disabled={appleLoading}>
            {appleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AppleIcon className="w-4 h-4" />}
            Apple Wallet
          </Button>
        </>
      )}
    </div>
  );
}
