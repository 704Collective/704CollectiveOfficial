import { QRCodeSVG } from 'qrcode.react';

interface MembershipCardProps {
  name: string;
  memberId: string;
  /** Kept for callers; not rendered on the card. */
  avatarUrl?: string;
  memberSince?: string;
  /** Display label for tier pill (default Social Member). */
  memberLabel?: string;
  /** Small caps line under “704” (e.g. Social / Business). */
  brandSubtitle?: string;
}

export function MembershipCard({
  name,
  memberId,
  memberSince,
  memberLabel = 'Social Member',
  brandSubtitle = 'Social',
}: MembershipCardProps) {
  return (
    <div
      className="membership-card relative w-full max-w-none overflow-visible rounded-2xl p-5 sm:aspect-[1586/1000] sm:max-w-xs sm:overflow-hidden sm:p-[clamp(18px,4.5%,26px)]"
      style={{
        background: 'linear-gradient(155deg, #2c2c2c 0%, #383838 42%, #242424 100%)',
        border: '1px solid rgba(198, 166, 100, 0.4)',
        boxShadow:
          '0 12px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 1px 0 rgba(198, 166, 100, 0.12) inset',
        height: 'auto',
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-white/[0.06] to-transparent rotate-12" />
      </div>

      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, #C6A664, transparent)' }}
      />

      <div className="relative z-10 flex h-auto min-h-0 flex-col gap-5 sm:h-full sm:justify-between sm:gap-0">
        {/* Brand + tier */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="font-bold leading-none tracking-[0.12em] text-white"
              style={{ fontSize: 'clamp(1.35rem, 4vw, 1.65rem)' }}
            >
              704
            </h2>
            <p
              className="mt-1 uppercase tracking-[0.35em] text-white/45"
              style={{ fontSize: 'clamp(9px, 1.6vw, 11px)' }}
            >
              {brandSubtitle}
            </p>
          </div>
          <div
            className="shrink-0 rounded-full border border-[#C6A664]/35 px-2.5 py-1 sm:px-3 sm:py-1.5"
            style={{ background: 'linear-gradient(180deg, rgba(198,166,100,0.14) 0%, rgba(198,166,100,0.06) 100%)' }}
          >
            <span
              className="block text-center font-semibold uppercase tracking-[0.2em] text-[#D4C49A]"
              style={{ fontSize: 'clamp(8px, 1.4vw, 10px)' }}
            >
              {memberLabel}
            </span>
          </div>
        </div>

        {/* Member name — full width left, no avatar / initials */}
        <div className="min-w-0 sm:pr-2 sm:pt-1">
          <p className="text-pretty text-xl font-semibold leading-snug tracking-tight text-white sm:text-[clamp(0.95rem,2.8vw,1.125rem)]">
            {name}
          </p>
          {memberSince && (
            <p className="mt-2 text-white/40" style={{ fontSize: 'clamp(10px, 2vw, 12px)' }}>
              Member since {memberSince}
            </p>
          )}
        </div>

        {/* Location + QR */}
        <div className="flex items-end justify-between gap-4 pt-1">
          <p className="max-w-[40%] text-pretty text-white/35" style={{ fontSize: 'clamp(10px, 2vw, 11px)' }}>
            Charlotte, NC
          </p>
          <div className="flex h-[9.5rem] w-[9.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 shadow-inner shadow-black/10 sm:hidden">
            <QRCodeSVG value={memberId} size={136} level="M" bgColor="#FFFFFF" fgColor="#000000" />
          </div>
          <div className="hidden shrink-0 rounded-xl bg-white p-2 shadow-md shadow-black/20 sm:block">
            <QRCodeSVG value={memberId} size={96} level="M" bgColor="#FFFFFF" fgColor="#000000" />
          </div>
        </div>
      </div>
    </div>
  );
}
