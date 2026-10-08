'use client';

// Wave H5 - chrome for the listing-only portal (/listing-account/*).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, CreditCard, Inbox, Store, LayoutGrid } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const GOLD = '#C6A664';
const NAV = [
  { href: '/listing-account', label: 'My Listing', icon: LayoutGrid, exact: true },
  { href: '/listing-account/leads', label: 'My Leads', icon: Inbox },
  { href: '/listing-account/network', label: 'The Network', icon: Store },
  { href: '/listing-account/billing', label: 'Billing', icon: CreditCard },
];

export function ListingPortalShell({ children, name }: { children: React.ReactNode; name: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthContext();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white" data-testid="listing-portal">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#1A1A1A]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/listing-account" className="flex items-center gap-3">
            <img src="/logo-nav.svg" alt="704 Collective" className="h-8 w-auto sm:h-9" width={36} height={36} />
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline" style={{ color: GOLD }}>Listing account</span>
          </Link>
          <div className="flex items-center gap-3 text-xs text-white/55">
            {name && <span className="hidden sm:inline">{name}</span>}
            <button type="button" onClick={async () => { await signOut(); router.push('/'); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white">Sign out</button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8" aria-label="Listing portal">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const a = active(href, exact);
              return (
                <Link key={href} href={href} data-testid={`portal-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={cn('relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors sm:px-4', a ? 'text-[#C6A664]' : 'text-white/45 hover:text-white/80')}
                  style={{ borderBottom: `2px solid ${a ? GOLD : 'transparent'}`, marginBottom: -1 }}>
                  <Icon className="h-4 w-4" />{label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
        <div className="mt-10 rounded-xl border border-dashed p-4 text-sm sm:flex sm:items-center sm:justify-between sm:gap-4" style={{ borderColor: `${GOLD}66`, color: 'rgba(255,255,255,0.65)' }} data-testid="upgrade-nudge">
          <p>Events, RSVPs and the member feed are part of 704 membership.</p>
          <a href="/signup" className="mt-2 inline-flex items-center gap-1 font-semibold sm:mt-0" style={{ color: GOLD }}>Upgrade <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </main>
    </div>
  );
}
