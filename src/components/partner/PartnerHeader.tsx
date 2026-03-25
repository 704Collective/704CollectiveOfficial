'use client';

import Image from 'next/image';

type PartnerHeaderProps = {
  companyName: string;
  logoUrl: string | null;
};

export function PartnerHeader({ companyName, logoUrl }: PartnerHeaderProps) {
  return (
    <header
      className="border-b border-white/[0.08]"
      style={{ backgroundColor: 'rgba(198,166,100,0.04)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="relative h-14 w-14 rounded-xl overflow-hidden shrink-0 border border-white/10"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            {logoUrl ? (
              <Image src={logoUrl} alt="" fill className="object-cover" sizes="56px" unoptimized />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg font-semibold text-[#C6A664]">
                {companyName.charAt(0).toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">Partner portal</p>
            <h1 className="text-xl sm:text-2xl font-semibold text-white truncate">
              Welcome back{companyName ? `, ${companyName}` : ''}
            </h1>
          </div>
        </div>
      </div>
    </header>
  );
}
