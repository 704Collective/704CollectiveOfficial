import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { PartnerApplyForm } from '@/components/partners/PartnerApplyForm';
import { validatePartnerInviteToken } from '@/lib/partnerInviteToken';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

export const metadata: Metadata = {
  title: 'Partner Invite | 704 Collective',
  robots: { index: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PartnerInviteApplyPage({ params }: Props) {
  const { token } = await params;
  const inv = await validatePartnerInviteToken(token);

  if (!inv.ok) {
    const msg =
      inv.reason === 'revoked'
        ? 'This invitation has been revoked.'
        : inv.reason === 'used'
          ? 'This invitation has already been used.'
          : 'This invitation link is not valid.';

    return (
      <>
        <Nav />
        <MarketingPageRoot>
        <div className="min-h-screen bg-[#0a0a0a] pt-28 pb-16 px-4 flex flex-col items-center">
          <div className="max-w-md text-center rounded-2xl border border-red-500/30 bg-red-950/20 p-8">
            <h1 className="text-xl font-semibold text-white mb-3">Invite unavailable</h1>
            <p className="text-white/65 text-sm mb-8">{msg}</p>
            <Link href="/partners/apply" className="text-[#D4A853] text-sm font-medium hover:underline">
              Apply without an invite
            </Link>
          </div>
        </div>
        </MarketingPageRoot>
      </>
    );
  }

  return (
    <PartnerApplyForm
      inviteToken={token}
      defaultEmail={inv.email ?? ''}
      emailReadOnly={Boolean(inv.email)}
      superAdminInvite={inv.superAdminAutoApprove}
    />
  );
}
