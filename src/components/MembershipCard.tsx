import { QRCodeSVG } from 'qrcode.react';

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
            <div className="bg-white p-1.5 rounded-lg">
              <QRCodeSVG
                value={memberId}
                className="w-[56px] h-[56px] min-[400px]:w-[64px] min-[400px]:h-[64px]"
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
          <div className="bg-white p-1.5 rounded-lg">
            <QRCodeSVG
              value={memberId}
              className="w-[56px] h-[56px] min-[400px]:w-[64px] min-[400px]:h-[64px]"
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
