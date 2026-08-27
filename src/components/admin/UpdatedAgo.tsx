'use client';

import { useEffect, useState } from 'react';

/**
 * "updated Xs ago", driven by the last SUCCESSFUL fetch.
 *
 * A stalled poll and a dead connection look identical on screen, which is the
 * real danger during an event: the numbers simply stop moving and nobody
 * notices. This turns that invisible failure into a visible one, at which point
 * the fix is the Refresh button already sitting next to it.
 */

const STALE_AFTER_MS = 30_000;

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function UpdatedAgo({
  at,
  paused,
  className = '',
}: {
  /** Epoch ms of the last successful fetch, or null if none has landed yet. */
  at: number | null;
  /** Optional note explaining why background refreshes are currently held. */
  paused?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ageMs = at === null ? null : Math.max(0, now - at);
  const stale = ageMs !== null && ageMs >= STALE_AFTER_MS;

  const label =
    ageMs === null ? 'not loaded yet'
      : ageMs < 2000 ? 'updated just now'
        : `updated ${formatAge(ageMs)} ago`;

  return (
    <span
      data-testid="updated-ago"
      data-stale={stale ? 'true' : 'false'}
      data-age-seconds={ageMs === null ? '' : String(Math.floor(ageMs / 1000))}
      data-paused={paused ? 'true' : 'false'}
      className={`text-xs tabular-nums ${stale ? 'text-amber-400' : 'text-muted-foreground/70'} ${className}`}
    >
      {label}
      {paused && <span className="text-muted-foreground/60"> · {paused}</span>}
    </span>
  );
}
