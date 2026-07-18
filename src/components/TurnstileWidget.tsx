'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAD3gqCivsYyImeUH";

/**
 * Whether Cloudflare Turnstile is configured. When false (env var absent, e.g.
 * local dev without the key), the widget renders nothing and callers should
 * treat captcha as not-required so they don't block submits indefinitely.
 */
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with the captcha token once the challenge is solved. */
  onSuccess: (token: string) => void;
  /** Called when the token expires — parents should clear their held token. */
  onExpire?: () => void;
  /** Called when the widget errors — parents should clear their held token. */
  onError?: () => void;
  className?: string;
}

/**
 * Thin wrapper around @marsidev/react-turnstile's <Turnstile>. Reads the public
 * site key from NEXT_PUBLIC_TURNSTILE_SITE_KEY and exposes an imperative
 * reset() (tokens are single-use, so reset after a failed auth attempt).
 * Renders nothing if the site key is absent.
 */
const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess, onExpire, onError, className }, ref) {
    const innerRef = useRef<TurnstileInstance | undefined>(undefined);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => innerRef.current?.reset(),
      }),
      [],
    );

    if (!SITE_KEY) return null;

    return (
      <div className={className}>
        <Turnstile
          ref={innerRef}
          siteKey={SITE_KEY}
          onSuccess={onSuccess}
          onExpire={() => onExpire?.()}
          onError={() => onError?.()}
          options={{ theme: 'dark', size: 'flexible' }}
        />
      </div>
    );
  },
);

export default TurnstileWidget;
