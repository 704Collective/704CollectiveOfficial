'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const STORAGE_KEY = 'promo_banner_dismissed_may2025';

export function PromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(STORAGE_KEY);
      if (!dismissed) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        backgroundColor: '#C6A664',
        color: '#1A1A1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '8px 48px 8px 16px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        lineHeight: 1.4,
        position: 'relative',
        zIndex: 60,
      }}
    >
      <span>
        Social rate ends May 1st — join at $35/mo before it{"'"}s $49.{' '}
        <Link
          href="/social"
          style={{ fontWeight: 700, textDecoration: 'underline', color: '#1A1A1A' }}
        >
          Join Now
        </Link>
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss banner"
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#1A1A1A',
          display: 'flex',
          alignItems: 'center',
          opacity: 0.7,
          padding: '4px',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
