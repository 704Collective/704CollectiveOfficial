'use client';

import type React from 'react';

// Shared Stripe discount-code entry. Extracted from the /join social form so the
// logged-in Join Social button and the embedded /join/checkout door present the
// same field with the same rules rather than three near-copies.
//
// Codes are never validated here. The caller decides when that happens: the
// /join form defers to create-checkout, the embedded door resolves on Apply
// because its session is minted with the discount baked in.

export interface PromoCodeFieldProps {
  value: string;
  onValueChange: (next: string) => void;
  appliedCode: string;
  onApply: () => void;
  /** Fired when the disclosure collapses, so a stale code cannot ride along. */
  onDismiss: () => void;
  error: string | null;
  inputStyle: React.CSSProperties;
  /** Apply is async on the embedded door; it mints a session to prove the code. */
  applying?: boolean;
  appliedNote?: string;
}

const DEFAULT_APPLIED_NOTE =
  'Code will be applied at checkout. Clear the field to join without it.';

export function PromoCodeField({
  value,
  onValueChange,
  appliedCode,
  onApply,
  onDismiss,
  error,
  inputStyle,
  applying = false,
  appliedNote = DEFAULT_APPLIED_NOTE,
}: PromoCodeFieldProps) {
  return (
    <details
      data-testid="promo-details"
      onToggle={(e) => {
        // Collapsing dismisses promo entirely so a hidden invalid/stale
        // code cannot still be sent on Continue.
        if (!(e.currentTarget as HTMLDetailsElement).open) onDismiss();
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
        Have a discount code?
        {appliedCode ? (
          <span
            data-testid="promo-applied-badge"
            style={{ color: '#C6A664', marginLeft: '8px', fontWeight: 600 }}
          >
            {appliedCode}
          </span>
        ) : null}
      </summary>
      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          aria-label="Discount code"
          data-testid="promo-input"
          placeholder="Enter code"
          value={value}
          onChange={(e) => onValueChange(e.target.value.toUpperCase())}
          style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
        />
        <button
          type="button"
          data-testid="promo-apply"
          onClick={onApply}
          disabled={applying}
          style={{
            padding: '0 18px',
            backgroundColor: applying ? 'rgba(198,166,100,0.4)' : '#C6A664',
            color: '#1A1A1A',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: applying ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {applying ? 'Checking...' : 'Apply'}
        </button>
      </div>
      {error && (
        <p
          data-testid="promo-error"
          style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}
        >
          {error}
        </p>
      )}
      {appliedCode && !error && (
        <p
          data-testid="promo-applied-note"
          style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}
        >
          {appliedNote}
        </p>
      )}
    </details>
  );
}
