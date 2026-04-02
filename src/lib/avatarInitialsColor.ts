import type { CSSProperties } from 'react';

/**
 * Deterministic avatar background for initials from user id (preferred) or name.
 * Palette order matches spec: indigo, violet, rose, pink, amber, orange, teal, cyan, blue, emerald.
 */
const PALETTE_RGB: string[] = [
  'rgb(79,70,229)', // indigo-600
  'rgb(124,58,237)', // violet-600
  'rgb(225,29,72)', // rose-600
  'rgb(219,39,119)', // pink-600
  'rgb(217,119,6)', // amber-600
  'rgb(234,88,12)', // orange-600
  'rgb(13,148,136)', // teal-600
  'rgb(8,145,178)', // cyan-600
  'rgb(37,99,235)', // blue-600
  'rgb(5,150,105)', // emerald-600
];

export const BUSINESS_PORTAL_AVATAR_GOLD = 'rgb(196,167,100)';

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getInitialsAvatarBackground(userIdOrName: string): string {
  const i = hashString(userIdOrName) % PALETTE_RGB.length;
  return PALETTE_RGB[i]!;
}

export function getInitialsAvatarStyle(
  userIdOrName: string,
  options?: { businessPortal?: boolean }
): CSSProperties {
  if (options?.businessPortal) {
    return { backgroundColor: BUSINESS_PORTAL_AVATAR_GOLD, color: 'rgb(0,0,0)' };
  }
  return {
    backgroundColor: getInitialsAvatarBackground(userIdOrName),
    color: '#fff',
  };
}
