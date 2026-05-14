import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Detects iOS (including iPadOS 13+ which spoofs as MacIntel with touch).
 * Returns false during SSR (no navigator).
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

/**
 * Generates and downloads an Apple Wallet pass for the current authenticated member.
 * Returns true on success (download initiated), false on any failure.
 * Toasts user-facing errors automatically.
 *
 * Caller is responsible for managing loading state (e.g. setDownloading(true) before, false after).
 */
export async function downloadAppleWalletPass(): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      toast.error('Please sign in again to download your wallet pass.');
      return false;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-apple-wallet-pass`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to generate wallet pass.';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // Response wasn't JSON, use default
      }
      toast.error(errorMessage);
      return false;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '704-collective.pkpass';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success('Pass downloaded! Tap it to add to Apple Wallet.');
    return true;
  } catch (err) {
    console.error('[appleWallet] Download failed:', err);
    toast.error('Something went wrong. Please try again.');
    return false;
  }
}
