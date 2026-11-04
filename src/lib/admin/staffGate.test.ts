import { describe, expect, it } from 'vitest';
import { isHelperAdminAllowedPath, isHelperAdminRole, isStaffRole, isSuperAdminRole } from './staffGate';

describe('staffGate', () => {
  it('treats lead as not staff', () => {
    expect(isStaffRole('lead')).toBe(false);
    expect(isHelperAdminRole('lead')).toBe(false);
    expect(isSuperAdminRole('lead')).toBe(false);
  });

  it('allows helper admins only on tasks and auth basics', () => {
    expect(isHelperAdminAllowedPath('/admin/tasks')).toBe(true);
    expect(isHelperAdminAllowedPath('/admin/tasks/')).toBe(true);
    expect(isHelperAdminAllowedPath('/admin/tasks/x')).toBe(true);
    expect(isHelperAdminAllowedPath('/admin/login')).toBe(true);
    expect(isHelperAdminAllowedPath('/admin/request-access')).toBe(true);
    expect(isHelperAdminAllowedPath('/admin')).toBe(false);
    expect(isHelperAdminAllowedPath('/admin/contacts')).toBe(false);
    expect(isHelperAdminAllowedPath('/admin/sources')).toBe(false);
    expect(isHelperAdminAllowedPath('/admin/events')).toBe(false);
  });
});
