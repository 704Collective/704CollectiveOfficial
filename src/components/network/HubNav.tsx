import Link from 'next/link';
import { HUB_COPY, VISIBLE_HUBS, type HubSlug } from '@/lib/network/hubs';

export function HubNav({ current }: { current?: HubSlug | 'get-listed' | 'how-we-vet' }) {
  return (
    <header className="nw-nav">
      <div className="nw-wrap nw-nav-in">
        <Link href="/" className="nw-nav-brand" aria-label="704 Collective home">
          704 <small>THE NETWORK</small>
        </Link>
        <nav className="nw-nav-links" aria-label="Hubs">
          {VISIBLE_HUBS.map((h) => (
            <Link key={h} href={`/${h}`} aria-current={current === h ? 'page' : undefined}>
              {HUB_COPY[h].name}
            </Link>
          ))}
          <Link href="/how-we-vet" aria-current={current === 'how-we-vet' ? 'page' : undefined}>How we vet</Link>
          <Link href="/get-listed" aria-current={current === 'get-listed' ? 'page' : undefined}>Get listed</Link>
        </nav>
        <Link href="/join" className="nw-nav-cta">Join 704</Link>
      </div>
    </header>
  );
}
