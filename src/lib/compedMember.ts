// Browser/server mirror of supabase/functions/_shared/compedMember.ts.
// A comped member never receives the member_canceled ("win-back") drip.
// Truth lives on profiles: membership_override = true, or a non-empty comp_reason.
// people.override_paying is intentionally ignored (stale on prod; true for many payers).

export type CompedFields = {
  membership_override?: boolean | null;
  comp_reason?: string | null;
};

export function compedReason(p: CompedFields | null | undefined): string | null {
  if (!p) return null;
  if (p.membership_override === true) return 'membership_override';
  if (typeof p.comp_reason === 'string' && p.comp_reason.trim() !== '') return 'comp_reason';
  return null;
}

export const isCompedMember = (p: CompedFields | null | undefined): boolean => compedReason(p) !== null;
