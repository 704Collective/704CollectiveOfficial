import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';

interface MembershipCardProps {
  name: string;
  memberId: string;
  avatarUrl?: string;
  memberSince?: string;
}

export function MembershipCard({ name, memberId, avatarUrl, memberSince }: MembershipCardProps) {
  return (
    <div
      className="membership-card relative w-full max-w-none overflow-visible rounded-2xl p-4 sm:aspect-[1586/1000] sm:max-w-xs sm:overflow-hidden sm:p-[clamp(16px,4%,24px)]"
      style={{
        background: 'linear-gradient(145deg, #2a2a2a 0%, #333333 50%, #252525 100%)',
        border: '1px solid rgba(198, 166, 100, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        height: 'auto',
      }}
    >
      {/* Shine effect overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-white/5 to-transparent rotate-12" />
      </div>

      {/* Gold top accent line */}
      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, #C6A664, transparent)' }}
      />

      {/* Layout — natural height on mobile; fill on desktop */}
      <div className="relative z-10 flex h-auto min-h-0 flex-col gap-4 sm:h-full sm:justify-between sm:gap-0">

        {/* Top row: 704 + badge */}
        <div className="flex items-start justify-between">
          <div>
            <h2
              className="font-bold leading-none tracking-wider text-white"
              style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)' }}
            >
              704
            </h2>
            <p
              className="mt-0.5 uppercase tracking-[0.3em] text-white/50"
              style={{ fontSize: 'clamp(8px, 1.5vw, 10px)' }}
            >
              Social
            </p>
          </div>
          <div className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
            <span
              className="font-semibold uppercase tracking-widest text-white/80"
              style={{ fontSize: 'clamp(7px, 1.5vw, 10px)' }}
            >
              Social Member
            </span>
          </div>
        </div>

        {/* Middle row: avatar + name */}
        <div className="flex items-center gap-2 sm:gap-3">
          {avatarUrl ? (
            <div
              className="relative shrink-0"
              style={{ width: 'clamp(36px, 8%, 44px)', height: 'clamp(36px, 8%, 44px)' }}
            >
              <Image
                src={avatarUrl}
                alt={name}
                fill
                className="rounded-full border-2 border-white/20 object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div
              className="flex shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-white/10"
              style={{ width: 'clamp(36px, 8%, 44px)', height: 'clamp(36px, 8%, 44px)' }}
            >
              <span className="font-bold text-white" style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}>
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white sm:text-[clamp(0.8125rem,3vw,1rem)]">
              {name}
            </p>
            {memberSince && (
              <p className="mt-0.5 text-white/45" style={{ fontSize: 'clamp(9px, 2vw, 11px)' }}>
                Member since {memberSince}
              </p>
            )}
          </div>
        </div>

        {/* Bottom row: location + QR */}
        <div className="flex items-end justify-between gap-3">
          <p className="text-white/35" style={{ fontSize: 'clamp(9px, 2vw, 11px)' }}>
            Charlotte, NC
          </p>
          <div className="flex h-[8.5rem] w-[8.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 sm:hidden">
            <QRCodeSVG
              value={memberId}
              size={124}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
          <div className="hidden shrink-0 rounded-xl bg-white p-2 sm:block">
            <QRCodeSVG
              value={memberId}
              size={80}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
