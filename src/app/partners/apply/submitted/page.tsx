import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Application Submitted | 704 Collective',
  robots: { index: false },
};

export default function PartnerApplySubmittedPage() {
  return (
    <>
      <Nav />
      <MarketingPageRoot>
      <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md text-center">
          <Link href="/" className="inline-block mb-8">
            <Image src="/logo-nav.png" alt="704 Collective" width={56} height={56} />
          </Link>
          <div className="w-16 h-16 rounded-full bg-[#C6A664]/15 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-9 h-9 text-[#C6A664]" strokeWidth={2} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">Application Submitted!</h1>
          <p className="text-white/65 leading-relaxed mb-10">
            Thank you for applying to partner with 704 Collective. Our team will review your application and be in touch
            within 48 hours.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold transition-colors"
          >
            Back to homepage
          </Link>
        </div>
      </div>
      </MarketingPageRoot>
    </>
  );
}
