'use client';

import { useState, useSyncExternalStore } from 'react';

/**
 * Display-only rescue banner for social in-app browsers (Instagram, Facebook,
 * and similar), which can silently fail the Turnstile check and strand a
 * signup. Detects by user agent on the client only, never blocks the page,
 * and offers a tap-to-copy of the current URL (query string included) so the
 * visitor can reopen it in Safari or Chrome. Dismissal is per browser session.
 */

const DISMISS_KEY = '704-in-app-banner-dismissed';

// Marker → app name. Generic Android `wv` and iOS WKWebView are deliberately
// not matched so ordinary embedded browsers do not trip it.
const IN_APP_MARKERS: Array<[RegExp, string]> = [
  [/\bInstagram\b/i, 'Instagram'],
  [/\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bFBIOS\b|\bFBSS\b|\bFB4A\b/i, 'Facebook'],
  [/\bMessenger(?:Lite)?\b/i, 'Messenger'],
  [/\bSnapchat\b/i, 'Snapchat'],
  [/\bTikTok\b|\bmusical_ly\b|\bBytedanceWebview\b/i, 'TikTok'],
  [/\bLinkedInApp\b/i, 'LinkedIn'],
  [/\bPinterest\b/i, 'Pinterest'],
  [/\bTwitter\b|\bTwitterAndroid\b/i, 'X'],
  [/\bLine\//i, 'LINE'],
];

export function detectInAppBrowser(userAgent: string): string | null {
  for (const [pattern, name] of IN_APP_MARKERS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

// Client snapshot: detected app name, or null when not in-app or already
// dismissed this session. Server snapshot is always null, so SSR and the first
// client render agree and the banner appears after hydration without an effect.
const noopSubscribe = () => () => {};
function readClientSnapshot(): string | null {
  try {
    if (window.sessionStorage.getItem(DISMISS_KEY) === '1') return null;
  } catch {
    /* storage unavailable: still evaluate the UA */
  }
  return detectInAppBrowser(window.navigator.userAgent || '');
}
const readServerSnapshot = () => null;

export function InAppBrowserBanner() {
  const detected = useSyncExternalStore(noopSubscribe, readClientSnapshot, readServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  const appName = dismissed ? null : detected;
  if (!appName) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const copyLink = async () => {
    const url = window.location.href;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      role="region"
      aria-label="Open in a full browser"
      data-testid="in-app-browser-banner"
      data-app={appName}
      style={{
        position: 'relative',
        zIndex: 60,
        backgroundColor: '#F3E9D2',
        color: '#3d3426',
        borderBottom: '1px solid rgba(139,105,20,0.35)',
        padding: '12px 48px 12px 16px',
        fontSize: '0.875rem',
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>{appName}&apos;s built-in browser can block signup.</strong>{' '}
          For the smoothest checkout, open this page in Safari or Chrome.
        </p>
        <button
          type="button"
          data-testid="in-app-browser-copy"
          onClick={copyLink}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(139,105,20,0.5)',
            backgroundColor: copied ? '#8B6914' : '#FFFFFF',
            color: copied ? '#FFFFFF' : '#5c4f3a',
            fontWeight: 600,
            fontSize: '0.8125rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? 'Link copied' : 'Copy this link'}
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="in-app-browser-dismiss"
        onClick={dismiss}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '32px',
          height: '32px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: '#5c4f3a',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

export default InAppBrowserBanner;
