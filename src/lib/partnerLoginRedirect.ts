/** Safe post-login path for legacy partner login (open redirect hardening). */
export function partnerRedirectTarget(raw: string | null): string {
  if (!raw || !raw.startsWith('/partners/')) return '/partners/dashboard';
  if (raw.includes('//') || raw.includes('\\')) return '/partners/dashboard';
  return raw;
}
