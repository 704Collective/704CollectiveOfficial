'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const STORAGE_KEY = 'promo_banner_dismissed_may2025';

function setBannerHeight(px: number) {
  document.documentElement.style.setProperty('--banner-height', `${px}px`);
}

export function PromoBanner() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(STORAGE_KEY);
      if (!dismissed) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (visible && ref.current) {
      setBannerHeight(ref.current.offsetHeight);
    } else {
      setBannerHeight(0);
    }
    return () => setBannerHeight(0);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div
      ref={ref}
      style={{
        backgroundColor: '#2E2E2E',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '8px 48px 8px 16px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        lineHeight: 1.4,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 51,
        textAlign: 'center' as const,
      }}
    >
      <span className="promo-banner-inner">
        Social rate ends May 1st — join at $35/mo before it{"'"}s $49.{' '}
        <Link
          href="/social"
          style={{ fontWeight: 700, textDecoration: 'underline', color: '#C6A664' }}
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
          color: 'rgba(255,255,255,0.7)',
          display: 'flex',
          alignItems: 'center',
          opacity: 0.7,
          padding: '4px',
        }}
      >
        <X size={16} />
      </button>
      <style>{`
        @media (max-width: 640px) {
          .promo-banner-inner { justify-content: center; text-align: center; }
        }
      `}</style>
    </div>
  );
}
