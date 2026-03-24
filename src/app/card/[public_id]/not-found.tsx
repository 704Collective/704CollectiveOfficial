import Link from 'next/link';

export default function CardNotFound() {
  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center px-6 py-16">
      <p className="text-[#D4A853]/75 text-xs tracking-[0.35em] uppercase font-semibold mb-3">
        704 Collective
      </p>
      <h1 className="text-white text-xl font-semibold mb-2 text-center">Card not found</h1>
      <p className="text-white/50 text-sm text-center max-w-md leading-relaxed">
        This digital business card link is invalid or is no longer available.
      </p>
      <Link
        href="https://704collective.com"
        className="mt-10 text-[#D4A853] text-sm font-medium hover:text-[#E4B86A] transition-colors"
      >
        Visit 704collective.com
      </Link>
    </div>
  );
}
