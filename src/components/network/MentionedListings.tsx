// Wave H7 — "Mentioned in this guide": the live listings a post links to, as
// cards whose every CTA is routed through 704 (profile, /out website, /intro).
// Zero bare outbound links by construction.
import Link from 'next/link';
import type { NetworkCategory, NetworkListing } from '@/lib/network/queries';
import { HUB_ACCENTS, HUB_COPY } from '@/lib/network/hubs';

const categoryLabel = (cats: NetworkCategory[], id: string) => cats.find((c) => c.id === id)?.label ?? '';

/** Light (hub chrome) or dark (/blog) variant. */
export function MentionedListings({ listings, cats, variant = 'light' }: { listings: NetworkListing[]; cats: NetworkCategory[]; variant?: 'light' | 'dark' }) {
  if (listings.length === 0) return null;
  const dark = variant === 'dark';
  return (
    <section data-section="mentioned" aria-labelledby="mentioned-title" style={{ marginTop: dark ? 56 : 0, paddingTop: dark ? 40 : 0, borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : undefined }}>
      <p style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: dark ? 'rgba(198,166,100,0.85)' : 'var(--nw-muted)', margin: 0 }}>Mentioned in this guide</p>
      <h2 id="mentioned-title" className={dark ? '' : 'nw-serif'} style={{ fontSize: dark ? '1.25rem' : 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.1, margin: '8px 0 18px', color: dark ? '#FAF6F0' : undefined, fontWeight: dark ? 600 : undefined }}>Vetted by 704, counted for them.</h2>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {listings.map((l) => {
          const a = HUB_ACCENTS[l.hub];
          const photo = l.photo_urls?.[0] ?? l.logo_url ?? null;
          return (
            <article key={l.id} data-card="mentioned" data-kind={l.kind} data-slug={l.slug} style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'var(--nw-border)'}`, background: dark ? 'rgba(255,255,255,0.03)' : '#fff', borderTop: `3px solid ${a.accent}`, display: 'flex', flexDirection: 'column' }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', aspectRatio: '16/8', objectFit: 'cover', display: 'block' }} /> : null}
              <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: l.kind === 'seat' ? '#fff' : (dark ? '#FAF6F0' : 'var(--nw-ink)'), background: l.kind === 'seat' ? a.accent : 'transparent', border: `1px solid ${l.kind === 'seat' ? a.accent : a.soft}`, borderRadius: 999, padding: '3px 10px' }}>{l.kind === 'seat' ? 'Exclusive' : 'Vetted'}</span>
                  <span style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.5)' : 'var(--nw-muted)' }}>{HUB_COPY[l.hub].name}{categoryLabel(cats, l.category_id) ? ` · ${categoryLabel(cats, l.category_id)}` : ''}</span>
                </div>
                <h3 className={dark ? '' : 'nw-serif'} style={{ fontSize: dark ? '1.05rem' : 22, lineHeight: 1.15, margin: 0, color: dark ? '#FAF6F0' : undefined, fontWeight: dark ? 600 : undefined }}>{l.company_name}</h3>
                {l.hook ? <p style={{ margin: 0, fontSize: 14, color: dark ? 'rgba(255,255,255,0.6)' : 'var(--nw-muted)' }}>{l.hook}</p> : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8 }}>
                  <Link href={`/${l.hub}/${l.slug}`} data-cta="profile" style={{ ...btn(dark), background: dark ? '#C6A664' : a.accent, borderColor: dark ? '#C6A664' : a.accent, color: dark ? '#1A1A1A' : '#fff' }}>View profile</Link>
                  {l.website_url ? <a href={`/out/${l.slug}/website?utm_source=guide&utm_medium=blog`} data-cta="website" rel="nofollow" style={btn(dark)}>Website</a> : null}
                  <Link href={`/intro/${l.slug}`} data-cta="intro" style={btn(dark)}>Request an intro</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const btn = (dark: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: 'none',
  border: `1px solid ${dark ? 'rgba(255,255,255,0.3)' : 'var(--nw-ink)'}`, color: dark ? '#FAF6F0' : 'var(--nw-ink)', background: 'transparent',
});
