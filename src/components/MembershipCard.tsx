'use client';

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
      className="membership-card relative w-full overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(145deg, #2a2a2a 0%, #333333 50%, #252525 100%)',
        border: '1px solid rgba(198, 166, 100, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        aspectRatio: '1.586 / 1',
        padding: 'clamp(16px, 4%, 24px)',
      }}
    >
      {/* Shine effect overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-white/5 to-transparent rotate-12" />
      </div>

      {/* Gold top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, #C6A664, transparent)' }}
      />

      {/* Layout — flex column, space-between */}
      <div className="relative z-10 flex flex-col justify-between h-full">

        {/* Top row: 704 + badge */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold tracking-wider text-white leading-none"
              style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)' }}>
              704
            </h2>
            <p className="tracking-[0.3em] text-white/50 uppercase mt-0.5"
              style={{ fontSize: 'clamp(8px, 1.5vw, 10px)' }}>
              Social
            </p>
          </div>
          <div className="px-2 py-1 rounded-full border border-white/15 bg-white/5">
            <span className="font-semibold tracking-widest text-white/80 uppercase"
              style={{ fontSize: 'clamp(7px, 1.5vw, 10px)' }}>
              Social Member
            </span>
          </div>
        </div>

        {/* Middle row: avatar + name */}
        <div className="flex items-center gap-2 sm:gap-3">
          {avatarUrl ? (
            <div className="relative shrink-0"
              style={{ width: 'clamp(36px, 8%, 44px)', height: 'clamp(36px, 8%, 44px)' }}>
              <Image
                src={avatarUrl}
                alt={name}
                fill
                className="rounded-full object-cover border-2 border-white/20"
                unoptimized
              />
            </div>
          ) : (
            <div
              className="rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 shrink-0"
              style={{ width: 'clamp(36px, 8%, 44px)', height: 'clamp(36px, 8%, 44px)' }}
            >
              <span className="font-bold text-white"
                style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}>
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-white truncate"
              style={{ fontSize: 'clamp(0.8125rem, 3vw, 1rem)' }}>
              {name}
            </p>
            {memberSince && (
              <p className="text-white/45 mt-0.5"
                style={{ fontSize: 'clamp(9px, 2vw, 11px)' }}>
                Member since {memberSince}
              </p>
            )}
          </div>
        </div>

        {/* Bottom row: location + QR */}
        <div className="flex items-end justify-between">
          <p className="text-white/35" style={{ fontSize: 'clamp(9px, 2vw, 11px)' }}>
            Charlotte, NC
          </p>
          <div className="bg-white rounded-lg p-1 sm:p-1.5">
            <QRCodeSVG
              value={memberId}
              size={36}
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