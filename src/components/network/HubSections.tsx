import Link from 'next/link';
import { format } from 'date-fns';
import { DISCLOSURE_LINE, LISTING_PRICE_LINE, type HubCopy, type SignatureSection } from '@/lib/network/hubs';
import type { HubBlogPost, HubEvent, NetworkCategory, NetworkListing } from '@/lib/network/queries';

/* ── hero ─────────────────────────────────────────────────────────────────── */
export function HubHero({ copy }: { copy: HubCopy }) {
  return (
    <section className="nw-hero" data-section="hero">
      <div className="nw-wrap nw-hero-in">
        <span className="nw-pill">{copy.kicker}</span>
        <h1 className="nw-serif nw-h1">{copy.h1}</h1>
        <p className="nw-promise">{copy.promise}</p>
        <div className="nw-chips" aria-label="Proof">
          {copy.proof.map((p) => <span key={p} className="nw-chip">{p}</span>)}
        </div>
      </div>
    </section>
  );
}

/* ── category ribbon ──────────────────────────────────────────────────────── */
export function CategoryRibbon({ items }: { items: string[] }) {
  const list = items.length ? items : ['Vetted', 'One seat per category', 'Re-reviewed quarterly'];
  const doubled = [...list, ...list];
  return (
    <div className="nw-ribbon" aria-hidden="true" data-section="ribbon">
      <div className="nw-ribbon-track">
        {doubled.map((c, i) => <span key={`${c}-${i}`} className="nw-ribbon-item">{c}</span>)}
      </div>
    </div>
  );
}

/* ── trust band ───────────────────────────────────────────────────────────── */
export function VettingBand({ line }: { line: string }) {
  return (
    <section className="nw-trust" data-section="vetting">
      <div className="nw-wrap nw-trust-in">
        <h2 className="nw-serif nw-trust-title">{line}</h2>
        <Link href="/how-we-vet" className="nw-trust-link">How we vet →</Link>
      </div>
    </section>
  );
}

/* ── cards ────────────────────────────────────────────────────────────────── */
function categoryLabel(cats: NetworkCategory[], id: string) {
  return cats.find((c) => c.id === id)?.label ?? 'Category';
}

export function SeatCard({ listing, index, cats }: { listing: NetworkListing; index: number; cats: NetworkCategory[] }) {
  const num = String(index + 1).padStart(2, '0');
  const photo = listing.photo_urls?.[0] ?? listing.logo_url ?? null;
  return (
    <article className="nw-card" data-card="seat">
      <div className="nw-card-photo">
        {photo ? <img src={photo} alt="" /> : null}
        <span className="nw-serif nw-seat-num" aria-hidden="true">{num}</span>
        <span className="nw-badge solid">Exclusive</span>
      </div>
      <div className="nw-card-body">
        <span className="nw-card-cat">{categoryLabel(cats, listing.category_id)}</span>
        <h3 className="nw-serif nw-card-title">{listing.company_name}</h3>
        {listing.hook ? <p className="nw-card-hook">{listing.hook}</p> : null}
        <div className="nw-card-actions">
          <Link href={`/intro/${listing.slug}`} className="nw-btn accent">Request an intro</Link>
          <Link href={`/${listing.hub}/${listing.slug}`} className="nw-btn ghost">View profile</Link>
        </div>
      </div>
    </article>
  );
}

export function VettedCard({ listing, cats }: { listing: NetworkListing; cats: NetworkCategory[] }) {
  const photo = listing.photo_urls?.[0] ?? listing.logo_url ?? null;
  return (
    <article className="nw-card" data-card="vetted">
      <div className="nw-card-photo" style={{ aspectRatio: '16/8' }}>
        {photo ? <img src={photo} alt="" /> : null}
        <span className="nw-badge outline">Vetted</span>
      </div>
      <div className="nw-card-body">
        <span className="nw-card-cat">{categoryLabel(cats, listing.category_id)}</span>
        <h3 className="nw-serif nw-card-title">{listing.company_name}</h3>
        {listing.hook ? <p className="nw-card-hook">{listing.hook}</p> : null}
        <div className="nw-card-actions">
          <Link href={`/${listing.hub}/${listing.slug}`} className="nw-btn ghost">View profile</Link>
          <Link href={`/intro/${listing.slug}`} className="nw-btn ghost">Request an intro</Link>
        </div>
      </div>
    </article>
  );
}

export function OpenSeatCard({ category, index }: { category: NetworkCategory; index: number }) {
  return (
    <article className="nw-open-seat" data-card="open-seat">
      <span className="nw-serif nw-seat-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <span className="nw-card-cat">{category.label}</span>
      <h3 className="nw-serif nw-card-title">This seat is open — own the category.</h3>
      <p className="nw-card-hook">One vetted business holds {category.label.toLowerCase()} on this hub. Right now, nobody does.</p>
      <div className="nw-card-actions">
        <Link href="/get-listed" className="nw-btn primary">Claim this seat</Link>
      </div>
    </article>
  );
}

/* ── the room + vetted grid ───────────────────────────────────────────────── */
export function TheRoom({ cats, listings }: { cats: NetworkCategory[]; listings: NetworkListing[] }) {
  const seats = listings.filter((l) => l.kind === 'seat');
  const seatCategoryIds = new Set(seats.map((s) => s.category_id));
  const openCats = cats.filter((c) => !seatCategoryIds.has(c.id));
  return (
    <section className="nw-section" data-section="room">
      <div className="nw-wrap">
        <span className="nw-eyebrow">The room</span>
        <h2 className="nw-serif nw-h2">One seat per category. Held by the business that earned it.</h2>
        <p className="nw-lede">Exclusive seats are the businesses we would send our own members to first.</p>
        <div className="nw-grid seats" style={{ marginTop: 32 }}>
          {seats.map((l, i) => <SeatCard key={l.id} listing={l} index={i} cats={cats} />)}
          {openCats.map((c, i) => <OpenSeatCard key={c.id} category={c} index={seats.length + i} />)}
        </div>
      </div>
    </section>
  );
}

export function VettedGrid({ cats, listings }: { cats: NetworkCategory[]; listings: NetworkListing[] }) {
  const spots = listings.filter((l) => l.kind === 'spotlight');
  if (spots.length === 0) return null;
  return (
    <section className="nw-section" style={{ paddingTop: 0 }} data-section="vetted-grid">
      <div className="nw-wrap">
        <span className="nw-eyebrow">Vetted</span>
        <h2 className="nw-serif nw-h2">Also passed the review.</h2>
        <div className="nw-grid" style={{ marginTop: 28 }}>
          {spots.map((l) => <VettedCard key={l.id} listing={l} cats={cats} />)}
        </div>
      </div>
    </section>
  );
}

/* ── battle cry ───────────────────────────────────────────────────────────── */
export function BattleCry({ text }: { text: string }) {
  return (
    <section className="nw-battle" data-section="battle-cry">
      <div className="nw-wrap nw-battle-in"><h2 className="nw-serif">{text}</h2></div>
    </section>
  );
}

/* ── signature sections ───────────────────────────────────────────────────── */
export function Signature({ sig }: { sig: SignatureSection }) {
  if (sig.kind === 'occasions') {
    return (
      <section className="nw-section nw-dark" data-section="signature" data-signature="occasions">
        <div className="nw-wrap">
          <span className="nw-eyebrow">Signature</span>
          <h2 className="nw-serif nw-h2">{sig.title}</h2>
          <p className="nw-lede nw-muted">{sig.intro}</p>
          <div className="nw-occasions" style={{ marginTop: 28 }}>
            {sig.occasions.map((o) => (
              <div key={o.title} className="nw-occasion"><h3 className="nw-serif nw-occasion-title">{o.title}</h3><p className="nw-muted">{o.body}</p></div>
            ))}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="nw-section" data-section="signature" data-signature={sig.kind}>
      <div className="nw-wrap">
        <span className="nw-eyebrow">Signature</span>
        <h2 className="nw-serif nw-h2">{sig.title}</h2>
        <p className="nw-lede">{sig.intro}</p>
        {sig.kind === 'route' && (
          <div className="nw-route" style={{ marginTop: 24 }}>
            {sig.stops.map((s) => (
              <div key={s.title} className="nw-route-stop"><span className="nw-route-time">{s.time}</span><h3 className="nw-serif nw-route-title">{s.title}</h3><p className="nw-muted">{s.body}</p></div>
            ))}
          </div>
        )}
        {sig.kind === 'milestones' && (
          <div className="nw-milestones" style={{ marginTop: 28 }}>
            {sig.columns.map((c) => (
              <div key={c.label} className="nw-ms"><span className="nw-serif nw-ms-label">{c.label}</span><h3 className="nw-serif nw-ms-title">{c.title}</h3><p className="nw-muted">{c.body}</p></div>
            ))}
          </div>
        )}
        {sig.kind === 'stages' && (
          <div className="nw-stages" style={{ marginTop: 28 }}>
            {sig.stages.map((s) => (
              <div key={s.title} className="nw-stage"><h3 className="nw-serif nw-stage-title">{s.title}</h3><p className="nw-muted">{s.body}</p><div className="nw-stage-chips">{s.chips.map((c) => <span key={c} className="nw-stage-chip">{c}</span>)}</div></div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── get listed CTA ───────────────────────────────────────────────────────── */
export function GetListedCta({ hubName }: { hubName: string }) {
  return (
    <section className="nw-section" data-section="get-listed-cta">
      <div className="nw-wrap">
        <div className="nw-cta-card">
          <div>
            <span className="nw-eyebrow">Get listed</span>
            <h2 className="nw-serif">Own your category on {hubName}.</h2>
            <p className="nw-muted">One exclusive seat per category. Pass the 704 Review, hold the seat, and every intro from this page comes to you.</p>
          </div>
          <div>
            <div className="nw-serif nw-cta-price">{LISTING_PRICE_LINE}</div>
            <p className="nw-cta-note">Rate locked for 12 months. Pricing increases as hubs fill.</p>
            <Link href="/get-listed" className="nw-btn light" style={{ marginTop: 16 }}>Apply for a seat</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── from the hub ─────────────────────────────────────────────────────────── */
export function FromTheHub({ posts, hubName }: { posts: HubBlogPost[]; hubName: string }) {
  if (posts.length === 0) return null;
  return (
    <section className="nw-section" style={{ paddingTop: 0 }} data-section="from-the-hub">
      <div className="nw-wrap">
        <span className="nw-eyebrow">From the hub</span>
        <h2 className="nw-serif nw-h2">Latest from {hubName}</h2>
        <div className="nw-posts" style={{ marginTop: 24 }}>
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="nw-post">
              {p.cover_image_url ? <img src={p.cover_image_url} alt="" /> : null}
              <div className="nw-post-body">
                <h3 className="nw-serif nw-post-title">{p.title}</h3>
                {p.excerpt ? <p className="nw-muted" style={{ fontSize: 14 }}>{p.excerpt}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── faq ──────────────────────────────────────────────────────────────────── */
export function HubFaq({ faqs }: { faqs: { q: string; a: string }[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="nw-section" style={{ paddingTop: 0 }} data-section="faq">
      <div className="nw-wrap">
        <span className="nw-eyebrow">FAQs</span>
        <h2 className="nw-serif nw-h2">Straight answers.</h2>
        <div className="nw-faq" style={{ marginTop: 20 }}>
          {faqs.map((f) => (
            <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── event teaser ─────────────────────────────────────────────────────────── */
export function EventTeaser({ event }: { event: HubEvent | null }) {
  return (
    <section className="nw-section" style={{ paddingTop: 0 }} data-section="event-teaser">
      <div className="nw-wrap">
        <div className="nw-event">
          <div className="nw-event-img">{event?.image_url ? <img src={event.image_url} alt="" /> : null}</div>
          <div className="nw-event-body">
            <span className="nw-eyebrow">Meet the room in person</span>
            <h2 className="nw-serif" style={{ fontSize: 30, lineHeight: 1.1 }}>{event ? event.title : 'The next 704 night is being set.'}</h2>
            <p className="nw-muted">
              {event ? `${format(new Date(event.start_time), 'EEEE, MMMM d · h:mm a')}${event.location_name ? ` · ${event.location_name}` : ''}` : 'Members meet the businesses on these pages at 704 events across Charlotte.'}
            </p>
            <div className="nw-card-actions">
              <Link href={event ? `/events/${event.id}` : '/events'} className="nw-btn primary">{event ? 'See the event' : 'See upcoming events'}</Link>
              <Link href="/join" className="nw-btn ghost">Join 704</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── footer band ──────────────────────────────────────────────────────────── */
export function HubFooter() {
  return (
    <footer className="nw-foot" data-section="footer">
      <div className="nw-wrap nw-foot-in">
        <div className="nw-serif" style={{ fontSize: 22 }}>This hub is part of The Network.</div>
        <nav className="nw-foot-links" aria-label="Network">
          <Link href="/reset">The Reset</Link><Link href="/nest">The Nest</Link><Link href="/foundry">The Foundry</Link><Link href="/experience">The Experience</Link>
          <Link href="/how-we-vet">How we vet</Link><Link href="/get-listed">Get listed</Link><Link href="/">704 Collective</Link>
        </nav>
        <p className="nw-disclosure">{DISCLOSURE_LINE}</p>
      </div>
    </footer>
  );
}
