'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer
      role="contentinfo"
      style={{
        backgroundColor: '#1A1A1A',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        padding: 'clamp(32px, 5vw, 40px) clamp(16px, 5vw, 24px)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Nav Links */}
        <nav
          aria-label="Footer navigation"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px 24px',
          }}
        >
          {[
            { href: '/', label: 'Home' },
            { href: '/social', label: 'Social' },
            { href: '/events', label: 'Events' },
            { href: '/about', label: 'About' },
            { href: '/contact', label: 'Contact' },
            { href: '/ambassadors/leaderboard', label: 'Ambassadors' },
            { href: '/terms', label: 'Terms' },
            { href: '/privacy', label: 'Privacy' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: '0.8125rem',
                color: 'rgba(255, 255, 255, 0.45)',
                textDecoration: 'none',
                transition: 'color 200ms ease',
                // Minimum touch target height
                padding: '4px 0',
                display: 'inline-block',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'; }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Copyright + Socials - wraps on small screens */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px 16px',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.3)',
              textAlign: 'center',
            }}
          >
            © {new Date().getFullYear()} 704 Collective. All rights reserved.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Instagram */}
            <a
              href="https://www.instagram.com/704_collective/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="704 Collective on Instagram"
              style={{
                color: 'rgba(255, 255, 255, 0.35)',
                transition: 'color 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                minHeight: '44px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </a>

            {/* Facebook */}
            <a
              href="https://www.facebook.com/704collectiveclt/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="704 Collective on Facebook"
              style={{
                color: 'rgba(255, 255, 255, 0.35)',
                transition: 'color 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                minHeight: '44px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>

            {/* TikTok */}
            <a
              href="https://www.tiktok.com/@704_collective"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="704 Collective on TikTok"
              style={{
                color: 'rgba(255, 255, 255, 0.35)',
                transition: 'color 200ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                minHeight: '44px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.78a4.86 4.86 0 0 1-1-.09z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
