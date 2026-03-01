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
    <div className="membership-card w-full max-w-md aspect-[1.6/1] flex flex-col justify-between">
      {/* Shine effect overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-12" />
      </div>

      {/* Top section */}
      <div className="flex items-start justify-between relative z-10">
        <div>
          <h2 className="text-xl font-bold tracking-wider text-white">704</h2>
          <p className="text-xs tracking-[0.3em] text-white/60 uppercase">Social</p>
        </div>
        <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5">
          <span className="text-xs font-medium tracking-wide text-white/90">SOCIAL MEMBER</span>
        </div>
      </div>

      {/* Middle section */}
      <div className="flex items-center gap-4 relative z-10">
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt={name} 
            className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
            <span className="text-lg font-bold text-white">{name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div>
          <p className="text-lg font-semibold text-white">{name}</p>
          {memberSince && (
            <p className="text-xs text-white/50">Member since {memberSince}</p>
          )}
        </div>
      </div>

      {/* Bottom section with QR code */}
      <div className="flex items-end justify-between relative z-10">
        <div className="text-xs text-white/40">
          <p>Charlotte, NC</p>
        </div>
        <div className="bg-white p-2 rounded-lg">
          <QRCodeSVG 
            value={memberId} 
            size={48}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </div>
      </div>
    </div>
  );
}
