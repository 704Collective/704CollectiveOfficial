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
  /** When set, drives layout density (business cards use a tighter QR + stacked tier pill). */
  memberType?: 'social' | 'business';
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
  // Prefer subtitle when present so tier styling matches what’s shown under “704” even if `member_type` lags.
  const isBusiness =
    inferred === 'business' || brandSubtitle.toLowerCase().trim() === 'business';

  const qrSizeMobile = isBusiness ? 72 : 86;
  const qrSizeDesktop = isBusiness ? 56 : 68;

  return (
    <div
      data-member-tier={isBusiness ? 'business' : 'social'}
      className="membership-card relative mx-auto w-full max-w-[min(100%,22rem)] rounded-2xl border border-[rgba(198,166,100,0.4)] p-4 pb-6 shadow-[0_12px_40px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(198,166,100,0.12)] sm:max-w-md sm:p-5 sm:pb-7 md:max-w-lg"
      style={{
        background: 'linear-gradient(155deg, #2c2c2c 0%, #383838 42%, #242424 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -inset-[100%] animate-shine bg-gradient-to-r from-transparent via-white/[0.06] to-transparent rotate-12" />
      </div>

      <div
        className="absolute left-0 right-0 top-0 h-[2px] rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, #C6A664, transparent)' }}
      />

      <div className="relative z-10 grid grid-cols-[1fr_auto] gap-x-4 gap-y-4 sm:gap-x-5 sm:gap-y-5">
        {/* Row 1: brand + tier pill */}
        <div className="col-start-1 row-start-1 min-w-0">
          <h2
            className="font-bold leading-none tracking-[0.12em] text-white"
            style={{ fontSize: isBusiness ? 'clamp(1.2rem, 3.5vw, 1.5rem)' : 'clamp(1.25rem, 3.8vw, 1.6rem)' }}
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
          className="col-start-2 row-start-1 max-w-[9.5rem] shrink-0 justify-self-end self-start rounded-full border border-[#C6A664]/35 px-2 py-1.5 sm:max-w-none sm:px-3 sm:py-2"
          style={{ background: 'linear-gradient(180deg, rgba(198,166,100,0.14) 0%, rgba(198,166,100,0.06) 100%)' }}
        >
          {isBusiness ? (
            <>
              <span className="block text-center text-[8px] font-bold uppercase leading-none tracking-[0.22em] text-[#D4C49A] sm:text-[9px] sm:tracking-[0.26em]">
                Business
              </span>
              <span className="mt-1 block text-center text-[7px] font-semibold uppercase leading-none tracking-[0.28em] text-[#D4C49A]/90 sm:text-[8px]">
                Member
              </span>
            </>
          ) : (
            <>
              <span className="block text-center text-[8px] font-bold uppercase leading-none tracking-[0.2em] text-[#D4C49A] sm:text-[9px]">
                Social
              </span>
              <span className="mt-1 block text-center text-[7px] font-semibold uppercase leading-none tracking-[0.24em] text-[#D4C49A]/90 sm:text-[8px]">
                Member
              </span>
            </>
          )}
        </div>

        {/* Row 2: name — full width */}
        <div className="col-span-2 col-start-1 row-start-2 min-w-0 border-t border-white/[0.06] pt-3 sm:pt-4">
          <p className="text-pretty text-base font-semibold leading-snug tracking-tight text-white sm:text-[clamp(0.95rem,2.6vw,1.125rem)]">
            {name}
          </p>
          {memberSince && (
            <p className="mt-1.5 text-white/40 sm:mt-2" style={{ fontSize: 'clamp(10px, 2vw, 12px)' }}>
              Member since {memberSince}
            </p>
          )}
        </div>

        {/* Row 3: location + QR — aligned, nothing clipped */}
        <div className="col-start-1 row-start-3 min-w-0 self-end pb-0.5 pt-1">
          <p
            className="text-pretty leading-snug text-white/50 sm:text-white/45"
            style={{ fontSize: 'clamp(10px, 2vw, 12px)' }}
          >
            Charlotte, NC
          </p>
        </div>

        <div className="col-start-2 row-start-3 self-end justify-self-end pb-0.5 pt-1">
          <div className="rounded-lg bg-white p-1 shadow-inner shadow-black/10 ring-1 ring-black/5 sm:rounded-xl sm:p-1.5 sm:shadow-md sm:shadow-black/15">
            <span className="block leading-none sm:hidden">
              <QRCodeSVG value={memberId} size={qrSizeMobile} level="M" bgColor="#FFFFFF" fgColor="#000000" />
            </span>
            <span className="hidden leading-none sm:block">
              <QRCodeSVG value={memberId} size={qrSizeDesktop} level="M" bgColor="#FFFFFF" fgColor="#000000" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
