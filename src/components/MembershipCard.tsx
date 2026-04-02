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
  const isBusiness =
    inferred === 'business' || brandSubtitle.toLowerCase().trim() === 'business';

  const qrSizeMobile = isBusiness ? 72 : 86;
  const qrSizeDesktop = isBusiness ? 56 : 68;

  const cardStyle = isBusiness
    ? {
        background: 'linear-gradient(145deg, rgb(46,38,25), rgb(24,20,16))',
        boxShadow:
          'rgba(0,0,0,0.7) 0px 25px 50px -12px, rgba(245,185,66,0.12) 0px 0px 0px 1px',
      }
    : {
        background: 'linear-gradient(145deg, rgb(36,36,36), rgb(20,20,20))',
        boxShadow:
          'rgba(0,0,0,0.7) 0px 25px 50px -12px, rgba(255,255,255,0.08) 0px 0px 0px 1px',
      };

  return (
    <div className="mx-auto w-full max-w-[min(100%,22rem)] sm:max-w-md md:max-w-lg">
      <div
        data-member-tier={isBusiness ? 'business' : 'social'}
        className="membership-card relative mx-auto w-full rounded-2xl p-4 pb-6 sm:p-5 sm:pb-7"
        style={cardStyle}
      >
        <div className="relative z-10 grid grid-cols-[1fr_auto] gap-x-4 gap-y-4 sm:gap-x-5 sm:gap-y-5">
          <div className="col-start-1 row-start-1 min-w-0">
            <h2
              className="font-bold leading-none tracking-[0.12em] text-white"
              style={{ fontSize: isBusiness ? 'clamp(1.2rem, 3.5vw, 1.5rem)' : 'clamp(1.25rem, 3.8vw, 1.6rem)' }}
            >
              704
            </h2>
            <p
              className="mt-1 uppercase tracking-[0.35em]"
              style={{
                fontSize: 'clamp(9px, 1.6vw, 11px)',
                color: isBusiness ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.9)',
              }}
            >
              {brandSubtitle}
            </p>
          </div>

          <div
            className="col-start-2 row-start-1 max-w-[9.5rem] shrink-0 justify-self-end self-start rounded-full px-2 py-1.5 sm:max-w-none sm:px-3 sm:py-2"
            style={
              isBusiness
                ? {
                    background: 'rgba(251,191,36,0.05)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 9999,
                  }
                : {
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 9999,
                  }
            }
          >
            {isBusiness ? (
              <>
                <span
                  className="block text-center text-[8px] font-bold uppercase leading-none tracking-[0.22em] sm:text-[9px] sm:tracking-[0.26em]"
                  style={{ color: 'rgba(251,191,36,0.9)' }}
                >
                  Business
                </span>
                <span
                  className="mt-1 block text-center text-[7px] font-semibold uppercase leading-none tracking-[0.28em] sm:text-[8px]"
                  style={{ color: 'rgba(251,191,36,0.75)' }}
                >
                  Member
                </span>
              </>
            ) : (
              <>
                <span className="block text-center text-[8px] font-bold uppercase leading-none tracking-[0.2em] text-white/90 sm:text-[9px]">
                  Social
                </span>
                <span className="mt-1 block text-center text-[7px] font-semibold uppercase leading-none tracking-[0.24em] text-white/80 sm:text-[8px]">
                  Member
                </span>
              </>
            )}
          </div>

          <div className="col-span-2 col-start-1 row-start-2 min-w-0 border-t border-white/[0.06] pt-3 sm:pt-4">
            <p className="text-pretty text-base font-semibold leading-snug tracking-tight text-white sm:text-[clamp(0.95rem,2.6vw,1.125rem)]">
              {name}
            </p>
            {memberSince && (
              <p
                className="mt-1.5 sm:mt-2"
                style={{
                  fontSize: 'clamp(10px, 2vw, 12px)',
                  color: isBusiness ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.4)',
                }}
              >
                Member since {memberSince}
              </p>
            )}
          </div>

          <div className="col-start-1 row-start-3 min-w-0 self-end pb-0.5 pt-1">
            <p
              className="text-pretty leading-snug sm:text-white/45"
              style={{
                fontSize: 'clamp(10px, 2vw, 12px)',
                color: isBusiness ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.5)',
              }}
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
      {isBusiness ? (
        <div
          className="mx-auto mt-2 h-px w-full max-w-[min(100%,22rem)] sm:max-w-md md:max-w-lg"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(245,185,66,0.4), transparent)',
          }}
        />
      ) : null}
    </div>
  );
}
