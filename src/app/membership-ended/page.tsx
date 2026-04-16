import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Membership Ended | 704 Collective',
};

export default function MembershipEndedPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#0A0A0A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <Link href="/" style={{ display: 'block', marginBottom: '40px' }}>
        <Image
          src="https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png"
          alt="704 Collective"
          width={120}
          height={40}
          style={{ height: '40px', width: 'auto' }}
          priority
        />
      </Link>

      <div
        style={{
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '48px 40px',
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(198,166,100,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C6A664"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#FAF6F0',
            marginBottom: '12px',
            lineHeight: 1.3,
          }}
        >
          Your membership has ended
        </h1>

        <p
          style={{
            fontSize: '0.9375rem',
            color: 'rgba(255,255,255,0.5)',
            lineHeight: 1.7,
            marginBottom: '36px',
          }}
        >
          {"We'd love to have you back. Rejoin 704 Collective to access events, the member directory, and the Charlotte community."}
        </p>

        <Link
          href="/join"
          style={{
            display: 'block',
            width: '100%',
            padding: '14px 24px',
            backgroundColor: '#C6A664',
            color: '#1A1A1A',
            borderRadius: '10px',
            fontSize: '0.9375rem',
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
            marginBottom: '12px',
          }}
        >
          Rejoin Now
        </Link>

        <Link
          href="/contact"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            color: 'rgba(255,255,255,0.4)',
            textDecoration: 'none',
            padding: '8px',
          }}
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}