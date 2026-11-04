/** Helper admins (profiles.role = admin) may only use Tasks plus auth/profile basics. */

export function isSuperAdminRole(role?: string | null): boolean {
  return role === 'super_admin';
}

export function isHelperAdminRole(role?: string | null): boolean {
  return role === 'admin';
}

export function isStaffRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isHelperAdminAllowedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (
    p === '/admin/tasks' ||
    p.startsWith('/admin/tasks/') ||
    p === '/admin/login' ||
    p === '/admin/request-access'
  );
}
