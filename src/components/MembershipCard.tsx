'use client';

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
      className="membership-card relative w-full max-w-sm overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
        border: '1px solid rgba(198, 166, 100, 0.25)',
        aspectRatio: '1.586 / 1',
        padding: '24px',
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
            <h2 className="text-2xl font-bold tracking-wider text-white leading-none">704</h2>
            <p className="text-[10px] tracking-[0.3em] text-white/50 uppercase mt-0.5">Social</p>
          </div>
          <div className="px-2.5 py-1 rounded-full border border-white/15 bg-white/5">
            <span className="text-[10px] font-semibold tracking-widest text-white/80 uppercase">
              Social Member
            </span>
          </div>
        </div>

        {/* Middle row: avatar + name */}
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-11 h-11 rounded-full object-cover border-2 border-white/20 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 shrink-0">
              <span className="text-base font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold text-white truncate">{name}</p>
            {memberSince && (
              <p className="text-[11px] text-white/45 mt-0.5">Member since {memberSince}</p>
            )}
          </div>
        </div>

        {/* Bottom row: location + QR */}
        <div className="flex items-end justify-between">
          <p className="text-[11px] text-white/35">Charlotte, NC</p>
          <div className="bg-white rounded-lg p-1.5">
            <QRCodeSVG
              value={memberId}
              size={44}
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