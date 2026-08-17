'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2 } from 'lucide-react';
import { isIosDevice, downloadAppleWalletPass } from '@/lib/appleWallet';
import { supabase } from '@/integrations/supabase/client';
import { resolvePersonId } from '@/lib/identity/resolvePerson';

interface MembershipCardProps {
  name: string;
  memberId: string;
  /** Kept for callers; not rendered on the card. */
  avatarUrl?: string;
  memberSince?: string;
  /** Display label for tier pill (default Social Member). */
  memberLabel?: string;
  /** Small caps line under "704" (e.g. Social / Business). */
  brandSubtitle?: string;
  /** When set, drives layout density (business cards use amber theme). */
  memberType?: 'social' | 'business';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'M';
}

export function MembershipCard({
  name,
  memberId,
  memberSince,
  memberLabel = 'Social Member',
  brandSubtitle = 'Social',
  memberType,
}: MembershipCardProps) {
  const inferred: 'social' | 'business' =
    memberType ?? (memberLabel.toLowerCase().includes('business') ? 'business' : 'social');
  const isBusiness =
    inferred === 'business' || brandSubtitle.toLowerCase().trim() === 'business';

  // ── Apple Wallet integration ────────────────────────────────────────────
  // Detect iOS so we only show the "Add to Apple Wallet" button on devices
  // that can actually open .pkpass files. Mounted in useEffect to avoid
  // hydration mismatch (isIosDevice returns false on the server).
  const [isIos, setIsIos] = useState(false);
  const [downloadingPass, setDownloadingPass] = useState(false);
  const [credentialToken, setCredentialToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  useEffect(() => {
    setIsIos(isIosDevice());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTokenLoading(true);
      try {
        // memberId is an auth user id. The shared resolver checks the
        // auth_user_id column first and falls back to the legacy bridge.
        const { personId } = await resolvePersonId(memberId);

        if (!personId) {
          if (!cancelled) { setCredentialToken(null); setTokenLoading(false); }
          return;
        }

        // Find the active general member credential (event_id is null).
        const { data: cred } = await supabase
          .from('attendance_credentials')
          .select('token')
          .eq('person_id', personId)
          .eq('credential_type', 'member')
          .eq('status', 'active')
          .is('event_id', null)
          .maybeSingle();

        if (!cancelled) {
          setCredentialToken(cred?.token ?? null);
          setTokenLoading(false);
        }
      } catch {
        if (!cancelled) { setCredentialToken(null); setTokenLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const handleAddToAppleWallet = async () => {
    if (downloadingPass) return;
    setDownloadingPass(true);
    try {
      await downloadAppleWalletPass();
    } finally {
      setDownloadingPass(false);
    }
  };

  // Shared "Add to Apple Wallet" button - rendered as a sibling to the card
  // div in both the social and business layouts. The enclosing wrapper has
  // `space-y-3` for default spacing; we override with an explicit 20px top
  // margin so the button sits a bit lower than other stacked siblings.
  const appleWalletButton = isIos ? (
    <div style={{ marginTop: '20px' }}>
      <button
        type="button"
        onClick={handleAddToAppleWallet}
        disabled={downloadingPass}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          padding: '12px 24px',
          backgroundColor: '#000000',
          color: '#FFFFFF',
          borderRadius: '8px',
          fontSize: '0.9375rem',
          fontWeight: 600,
          border: 'none',
          cursor: downloadingPass ? 'not-allowed' : 'pointer',
          opacity: downloadingPass ? 0.6 : 1,
          letterSpacing: '0.01em',
          transition: 'opacity 200ms ease',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}
      >
        {downloadingPass ? (
          <>
            <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
            Generating pass...
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-2 13H7v-3h2.5c.7 1.2 2 2 3.5 2s2.8-.8 3.5-2H17v3zm-5-2c-1.1 0-2-.9-2-2 0-.6.2-1.1.6-1.4l1.4-1.4 1.4 1.4c.4.4.6.9.6 1.4 0 1.1-.9 2-2 2zm5-3h-2.6c-.4-1.2-1.5-2-2.9-2H7V7h10v6z" />
            </svg>
            Add to Apple Wallet
          </>
        )}
      </button>
    </div>
  ) : null;

  const qrArea = tokenLoading ? (
    <div className="bg-white p-1.5 rounded-lg flex items-center justify-center"
         style={{ width: 88, height: 88 }}>
      <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: '#000' }} />
    </div>
  ) : credentialToken ? (
    <div className="bg-white p-1.5 rounded-lg">
      <QRCodeSVG
        value={credentialToken}
        className="w-[76px] h-[76px] min-[400px]:w-[84px] min-[400px]:h-[84px]"
        level="L"
        bgColor="#FFFFFF"
        fgColor="#000000"
      />
    </div>
  ) : (
    <div className="bg-white p-1.5 rounded-lg flex flex-col items-center justify-center text-center"
         style={{ width: 88, height: 88 }}>
      <span style={{ color: '#000', fontSize: '11px', fontWeight: 600 }}>Pass not ready</span>
      <span style={{ color: '#666', fontSize: '9px' }}>Contact support</span>
    </div>
  );

  if (isBusiness) {
    return (
      <div className="w-full max-w-[360px] space-y-3">
        <div
          className="w-full aspect-[1.6/1] flex flex-col justify-between p-5 sm:p-6 relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, hsl(36 30% 14%) 0%, hsl(30 20% 8%) 100%)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 1px rgba(245,185,66,0.12)',
          }}
        >
          {/* Gold top edge line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(245,185,66,0.4), transparent)' }}
          />

          {/* Gold shine effect */}
          <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-amber-400/10 to-transparent rotate-12" />

          {/* Top row */}
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-xl font-bold tracking-wider text-white">704</p>
              <p className="text-xs tracking-[0.3em] text-amber-400/70 uppercase">{brandSubtitle}</p>
            </div>
            <div className="px-3 py-1 rounded-full border border-amber-400/20 bg-amber-400/5">
              <span className="text-[10px] sm:text-xs font-medium tracking-wide text-amber-400/90">
                {memberLabel}
              </span>
            </div>
          </div>

          {/* Middle row */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-400/10 border-2 border-amber-400/20 flex items-center justify-center shrink-0">
              <span className="text-base sm:text-lg font-bold text-amber-400">
                {getInitials(name)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-semibold text-white truncate">{name}</p>
              {memberSince && (
                <p className="text-[11px] text-amber-400/50">Member since {memberSince}</p>
              )}
            </div>
          </div>

          {/* Bottom row */}
          <div className="relative z-10 flex items-end justify-between">
            <p className="text-[11px] text-amber-400/30">Charlotte, NC</p>
            {qrArea}
          </div>
        </div>
        {appleWalletButton}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[360px] space-y-3">
      <div
        className="w-full aspect-[1.6/1] flex flex-col justify-between p-5 sm:p-6 relative overflow-hidden rounded-2xl bg-card border border-border"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
      >
        {/* Shine effect */}
        <div className="absolute inset-[-100%] animate-shine bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-12" />

        {/* Top row */}
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xl font-bold tracking-wider text-white">704</p>
            <p className="text-xs tracking-[0.3em] text-white/60 uppercase">{brandSubtitle}</p>
          </div>
          <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5">
            <span className="text-[10px] sm:text-xs font-medium tracking-wide text-white/90">
              {memberLabel}
            </span>
          </div>
        </div>

        {/* Middle row */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 shrink-0">
            <span className="text-base sm:text-lg font-bold text-white">
              {getInitials(name)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-semibold text-white truncate">{name}</p>
            {memberSince && (
              <p className="text-[11px] text-white/50">Member since {memberSince}</p>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="relative z-10 flex items-end justify-between">
          <p className="text-[11px] text-white/40">Charlotte, NC</p>
          {qrArea}
        </div>
      </div>
      {appleWalletButton}
    </div>
  );
}
