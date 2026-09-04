'use client';

import type React from 'react';
import { useState } from 'react';

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
  /** Open the disclosure on first paint (URL-prefilled codes). */
  defaultOpen?: boolean;
}

const DEFAULT_APPLIED_NOTE =
  'This code will be sent with checkout. Remove it to join at full price.';

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
  defaultOpen = false,
}: PromoCodeFieldProps) {
  const [open, setOpen] = useState(defaultOpen);
  const showApplied = Boolean(appliedCode) && !error;

  if (showApplied) {
    return (
      <div data-testid="promo-applied" style={{ textAlign: 'left' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <span
            data-testid="promo-applied-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              backgroundColor: 'rgba(198,166,100,0.15)',
              border: '1px solid rgba(198,166,100,0.45)',
              color: '#C6A664',
              fontSize: '0.8125rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {appliedCode} applied
          </span>
          <button
            type="button"
            data-testid="promo-remove"
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'rgba(255,255,255,0.55)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Remove
          </button>
        </div>
        <p
          data-testid="promo-applied-note"
          style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: '8px', marginBottom: 0 }}
        >
          {appliedNote}
        </p>
      </div>
    );
  }

  return (
    <details
      data-testid="promo-details"
      open={open}
      onToggle={(e) => {
        const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(nextOpen);
        // Collapsing dismisses promo entirely so a hidden invalid/stale
        // code cannot still be sent on Continue.
        if (!nextOpen) onDismiss();
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
        Have a discount code?
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
    </details>
  );
}
