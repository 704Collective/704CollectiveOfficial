/** True for `/dashboard` and `/dashboard/...` only (not `/dashboardfoo`). */
export function isMemberDashboardRoute(pathname: string | null | undefined): boolean {
  if (pathname == null || pathname === '') return false;
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}
