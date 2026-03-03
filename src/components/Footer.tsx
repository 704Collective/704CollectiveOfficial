'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Instagram } from 'lucide-react';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

// Marketing pages that have their own footer — this Footer won't render on these
const MARKETING_ROUTES = ['/'];

export function Footer() {
  const pathname = usePathname();

  // Don't render on marketing pages (they have their own footer)
  if (MARKETING_ROUTES.includes(pathname)) {
    return null;
  }

  return (
    <footer className="py-8 border-t border-border" role="contentinfo">
      <div className="container">
        <div className="flex flex-col items-center gap-4">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer navigation">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Home</Link>
            <Link href="/social" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Social</Link>
            <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Events</Link>
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link>
            <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          </nav>
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground whitespace-nowrap">© {new Date().getFullYear()} 704 Collective. All rights reserved.</p>
            <a href="https://www.instagram.com/704_collective/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="704 Collective on Instagram">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="https://www.tiktok.com/@704_collective" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="704 Collective on TikTok">
              <TikTokIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}