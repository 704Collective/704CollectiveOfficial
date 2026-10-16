// Comped-member test shared by every path that could enrol someone in the
// member_canceled ("win-back") drip. Adam's rule: a comped member never gets it.
//
// Truth lives on profiles, where admins set it:
//   - profiles.membership_override = true  (comp seat; bypasses the Stripe check)
//   - profiles.comp_reason non-empty       (why the seat was comped / billed outside Stripe)
// people.override_paying is deliberately NOT consulted: on prod it is true for 63
// rows, 37 of which have real Stripe payments (stale import flag), so it cannot
// distinguish comped from paying. process-drips keeps its own send-time guard.

export type CompedFields = {
  membership_override?: boolean | null;
  comp_reason?: string | null;
};

/** Returns the field that marks the member comped, or null when they are not. */
export function compedReason(p: CompedFields | null | undefined): string | null {
  if (!p) return null;
  if (p.membership_override === true) return "membership_override";
  if (typeof p.comp_reason === "string" && p.comp_reason.trim() !== "") return "comp_reason";
  return null;
}

export const isCompedMember = (p: CompedFields | null | undefined): boolean => compedReason(p) !== null;
