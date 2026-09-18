// Membership-end cascade helpers (Wave 10).
//
// These are the steps stripe-webhook's handleSubscriptionDeleted runs when a
// subscription ends, lifted so admin-delete-user can run the same cascade
// BEFORE it soft-deletes a profile — because once a profile is soft-deleted the
// webhook's findProfileByCustomerId (deleted_at is null) never sees that
// customer again and the cascade can no longer happen from the Stripe side.
//
// The webhook keeps its own copies unchanged this wave (its cancellation path
// is regression-locked); the bodies here are the same statements.

import { resolvePerson } from "./resolvePerson.ts";

// Callers import supabase-js from different esm.sh pins (the webhook and the
// admin functions are on different versions), so the client is typed loosely
// here; every call is a plain PostgREST builder chain.
// deno-lint-ignore no-explicit-any
type AnySupabase = any;

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[MEMBERSHIP-CASCADE] ${step}${d}`);
};

/**
 * Remove every hub seat a person holds. Throws on failure so the caller can
 * refuse to continue rather than leave a ghost seat behind.
 */
export async function removeHubSeats(
  supabase: AnySupabase,
  profileId: string,
  source: string,
): Promise<number> {
  const { data: removed, error } = await supabase
    .from("hub_members")
    .delete()
    .eq("user_id", profileId)
    .select("hub_id");
  if (error) {
    throw new Error(`hub seat cascade failed (${source}): ${error.message}`);
  }
  log("Hub seats removed", { userId: profileId, count: removed?.length ?? 0, source });
  return removed?.length ?? 0;
}

/**
 * Stamp the person canceled through the shared resolver (auth_user_id first,
 * then email). Returns the person id, or null when none could be resolved.
 */
export async function markPersonCanceled(
  supabase: AnySupabase,
  args: { authUserId: string; email?: string | null; source: string },
): Promise<string | null> {
  const { personId, via } = await resolvePerson(supabase, {
    authUserId: args.authUserId,
    email: args.email ?? undefined,
    source: args.source,
    mint: false,
  });
  if (!personId) {
    log("markPersonCanceled: no person resolved", { authUserId: args.authUserId, source: args.source });
    return null;
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("people")
    .update({ member_status: "canceled", canceled_at: now, updated_at: now })
    .eq("id", personId);
  if (error) throw new Error(`people cancel stamp failed (${args.source}): ${error.message}`);
  log("People row canceled", { personId, via, source: args.source });
  return personId;
}

/**
 * Void every active attendance credential for a person and dispatch the
 * wallet refreshes. Best-effort on the wallet pushes; the void itself throws.
 */
export async function voidPersonCredentials(
  supabase: AnySupabase,
  args: { personId: string; profileId: string; source: string },
): Promise<number> {
  const { data: voided, error } = await supabase
    .from("attendance_credentials")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .eq("person_id", args.personId)
    .eq("status", "active")
    .select("id");
  if (error) throw new Error(`credential void failed (${args.source}): ${error.message}`);
  log("Credentials voided", { personId: args.personId, count: voided?.length ?? 0, source: args.source });

  // Wallet passes: same two dispatches the webhook makes, fire-and-forget.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const pushKey = Deno.env.get("WALLET_PUSH_SECRET") ?? "";
    for (const fn of ["send-apple-wallet-push", "update-google-wallet-pass"]) {
      fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pushKey}` },
        body: JSON.stringify({ serialNumber: args.profileId }),
      }).catch((e: unknown) => log(`${fn} dispatch failed (non-blocking)`, { error: String(e) }));
    }
  } catch (e) {
    log("wallet push block threw (non-blocking)", { error: e instanceof Error ? e.message : String(e) });
  }
  return voided?.length ?? 0;
}
