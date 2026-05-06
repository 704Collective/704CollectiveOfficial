
/**
 * Shown automatically by Next.js while the /auth/callback segment loads.
 * Displays the 704 Collective logo, a gold spinner, and "Signing you in…"
 * so the user never sees a blank screen during the OAuth exchange.
 */
export default function AuthCallbackLoading() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <img
        src="/logo-nav.svg"
        alt="704 Collective"
        width={72}
        height={72}
        style={{ borderRadius: '18px', marginBottom: '32px' }}
      />

      {/* Gold spinner */}
      <div style={{ position: 'relative', width: '36px', height: '36px', marginBottom: '16px' }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid rgba(198,166,100,0.15)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#C6A664',
          animation: 'spin 0.75s linear infinite',
        }} />
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.01em' }}>
        Signing you in&hellip;
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
