// Credential void cascade — the ONE implementation of "a member leaves an event".
//
// Lifted from void-credential (the member's own Cancel RSVP) so every other
// path that removes a member from an event behaves identically:
//   - cancel-subscription  (post-expiry RSVPs voided at cancel time)
//   - stripe-webhook       (period-end blanket void)
//   - membershipCascade    (admin-delete-user)
//
// One cascade = void the member_rsvp row (capacity frees by itself: the ledger
// counts active|used), void the business +1 guest credential linked through
// metadata.member_credential_id, then offer the freed seat to the next
// waitlister with a timed claim window. The per-event "rsvp-cancelled" email is
// NOT part of the cascade — void-credential sends it itself; the membership
// paths send one summary email per cancel instead.
//
// Callers import supabase-js from different esm.sh pins, so the client is typed
// loosely; every call is a plain PostgREST builder chain.
// deno-lint-ignore no-explicit-any
type AnySupabase = any;

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREDENTIAL-CASCADE] ${step}${d}`);
};

export const WAITLIST_CLAIM_WINDOW_HOURS = 24;

export type VoidedRsvp = {
  credential_id: string;
  event_id: string;
  title: string | null;
  start_time: string | null;
  plus_ones_voided: number;
  waitlist_notified: boolean;
};

export type CascadeEnv = {
  supabaseUrl: string;
  serviceKey: string;
  /** Site origin for links in the waitlist email. */
  siteUrl: string;
};

export function cascadeEnvFromDeno(): CascadeEnv {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    siteUrl: Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://704collective.com",
  };
}

export const fmtEventDateET = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }) : "";
export const fmtEventTimeET = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "";

/**
 * Business +1 cascade. A standing +1 (add-business-plus-one) hangs off the
 * member's RSVP via metadata.member_credential_id; the member leaving means the
 * guest leaves too. Non-fatal; returns the number of guest credentials voided.
 */
export async function voidLinkedPlusOnes(
  supabase: AnySupabase,
  args: { eventId: string; memberCredentialId: string },
): Promise<number> {
  try {
    const { data: linked, error } = await supabase
      .from("attendance_credentials")
      .update({ status: "voided" })
      .eq("event_id", args.eventId)
      .eq("credential_type", "guest_pass")
      .eq("status", "active")
      .contains("metadata", { source: "business_plus_one", member_credential_id: args.memberCredentialId })
      .select("id");
    if (error) { log("plus-one cascade failed (non-fatal)", { error: error.message }); return 0; }
    const n = (linked ?? []).length;
    if (n > 0) log("plus-one credential voided with the member RSVP", { ids: (linked as { id: string }[]).map((r) => r.id) });
    return n;
  } catch (e) {
    log("plus-one cascade error (non-fatal)", String(e));
    return 0;
  }
}

/**
 * Waitlist auto-notify. If the event has finite capacity and now has an open
 * seat, release stale holds and offer the seat to the next un-notified
 * waitlister with a timed claim window. Never throws; returns true when a
 * claimant was notified.
 */
export async function releaseWaitlistSeat(
  supabase: AnySupabase,
  env: CascadeEnv,
  eventId: string,
): Promise<boolean> {
  try {
    const { data: evt } = await supabase
      .from("events")
      .select("id, title, start_time, capacity")
      .eq("id", eventId)
      .maybeSingle();
    if (!evt || evt.capacity == null) return false;

    const { count: seated } = await supabase
      .from("attendance_credentials")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["active", "used"]);
    const seatedCount = typeof seated === "number" ? seated : 0;
    if (seatedCount >= evt.capacity) return false;

    // Release stale holds so those seats become claimable by others.
    await supabase
      .from("event_waitlist")
      .update({ notified_at: null, expires_at: null })
      .eq("event_id", eventId)
      .lt("expires_at", new Date().toISOString());

    const { data: nextUp } = await supabase
      .from("event_waitlist")
      .select("id, user_id")
      .eq("event_id", eventId)
      .is("notified_at", null)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!nextUp) return false;

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + WAITLIST_CLAIM_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from("event_waitlist")
      .update({ notified_at: nowIso, expires_at: expiresIso })
      .eq("id", nextUp.id);

    try {
      const { data: claimant } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", nextUp.user_id)
        .maybeSingle();
      if (claimant?.email) {
        await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}` },
          body: JSON.stringify({
            to: claimant.email,
            template: "waitlist-spot-open",
            data: {
              memberName: claimant.full_name || "there",
              eventTitle: evt.title || "an event",
              eventDate: fmtEventDateET(evt.start_time),
              eventTime: fmtEventTimeET(evt.start_time),
              claimUrl: `${env.siteUrl}/events/${eventId}?claim=1`,
              expiresHours: WAITLIST_CLAIM_WINDOW_HOURS,
              origin: env.siteUrl,
            },
          }),
        });
        log("waitlist claimant notified", { waitlistId: nextUp.id, eventId });
      }
    } catch (emailErr) {
      log("waitlist notify email error (non-critical)", String(emailErr));
    }
    return true;
  } catch (e) {
    log("waitlist auto-notify error (non-critical)", String(e));
    return false;
  }
}

/**
 * The full cascade for ONE already-identified member_rsvp credential:
 * void it, drop the linked +1, release a waitlist seat. Throws only if the
 * primary void fails.
 */
export async function voidMemberRsvpWithCascade(
  supabase: AnySupabase,
  env: CascadeEnv,
  args: { credentialId: string; eventId: string },
): Promise<{ plusOnesVoided: number; waitlistNotified: boolean }> {
  const { error } = await supabase
    .from("attendance_credentials")
    .update({ status: "voided" })
    .eq("id", args.credentialId)
    .eq("status", "active");
  if (error) throw new Error(`credential void failed: ${error.message}`);
  log("credential voided", { credId: args.credentialId, eventId: args.eventId });
  const plusOnesVoided = await voidLinkedPlusOnes(supabase, { eventId: args.eventId, memberCredentialId: args.credentialId });
  const waitlistNotified = await releaseWaitlistSeat(supabase, env, args.eventId);
  return { plusOnesVoided, waitlistNotified };
}

/**
 * Void every active member_rsvp a person holds for events starting AFTER
 * `afterIso`, each through the full cascade. Events before the cutoff are
 * untouched. Returns what was removed (for the member's summary email).
 */
export async function voidFutureRsvpsForPerson(
  supabase: AnySupabase,
  env: CascadeEnv,
  args: { personId: string; afterIso: string; source: string },
): Promise<VoidedRsvp[]> {
  const { data: rows, error } = await supabase
    .from("attendance_credentials")
    .select("id, event_id, event:events!attendance_credentials_event_id_fkey(id, title, start_time)")
    .eq("person_id", args.personId)
    .eq("credential_type", "member_rsvp")
    .eq("status", "active")
    .not("event_id", "is", null);
  if (error) { log("future-rsvp lookup failed", { error: error.message, source: args.source }); return []; }

  const cutoff = new Date(args.afterIso).getTime();
  const out: VoidedRsvp[] = [];
  for (const r of (rows ?? []) as Array<{ id: string; event_id: string; event: { id: string; title: string | null; start_time: string | null } | Array<{ id: string; title: string | null; start_time: string | null }> | null }>) {
    const ev = Array.isArray(r.event) ? r.event[0] : r.event;
    if (!ev?.start_time) continue;
    if (new Date(ev.start_time).getTime() <= cutoff) continue; // before the cutoff: untouched
    try {
      const res = await voidMemberRsvpWithCascade(supabase, env, { credentialId: r.id, eventId: r.event_id });
      out.push({ credential_id: r.id, event_id: r.event_id, title: ev.title, start_time: ev.start_time, ...res, plus_ones_voided: res.plusOnesVoided, waitlist_notified: res.waitlistNotified });
    } catch (e) {
      log("future-rsvp void failed (continuing)", { credId: r.id, error: String(e), source: args.source });
    }
  }
  log("future RSVPs voided", { personId: args.personId, count: out.length, afterIso: args.afterIso, source: args.source });
  return out;
}

/**
 * Period-end / account-end blanket void: every active credential the person
 * holds (member pass included), with the cascade applied to each member_rsvp.
 * Returns the voided RSVPs so the caller can list the future-dated ones.
 */
export async function voidAllCredentialsForPerson(
  supabase: AnySupabase,
  env: CascadeEnv,
  args: { personId: string; source: string },
): Promise<{ total: number; rsvps: VoidedRsvp[] }> {
  const { data: rows, error } = await supabase
    .from("attendance_credentials")
    .select("id, event_id, credential_type, event:events!attendance_credentials_event_id_fkey(id, title, start_time)")
    .eq("person_id", args.personId)
    .eq("status", "active");
  if (error) throw new Error(`credential lookup failed (${args.source}): ${error.message}`);

  const rsvps: VoidedRsvp[] = [];
  let total = 0;
  for (const r of (rows ?? []) as Array<{ id: string; event_id: string | null; credential_type: string; event: { id: string; title: string | null; start_time: string | null } | Array<{ id: string; title: string | null; start_time: string | null }> | null }>) {
    if (r.credential_type === "member_rsvp" && r.event_id) {
      try {
        const res = await voidMemberRsvpWithCascade(supabase, env, { credentialId: r.id, eventId: r.event_id });
        const ev = Array.isArray(r.event) ? r.event[0] : r.event;
        rsvps.push({ credential_id: r.id, event_id: r.event_id, title: ev?.title ?? null, start_time: ev?.start_time ?? null, plus_ones_voided: res.plusOnesVoided, waitlist_notified: res.waitlistNotified });
        total++;
      } catch (e) {
        log("rsvp void failed (continuing)", { credId: r.id, error: String(e), source: args.source });
      }
    } else {
      // Member pass, guest-held passes, public rows: plain void, no cascade to run.
      const { error: vErr } = await supabase.from("attendance_credentials").update({ status: "voided", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "active");
      if (vErr) log("credential void failed (continuing)", { credId: r.id, error: vErr.message, source: args.source });
      else total++;
    }
  }
  log("all credentials voided", { personId: args.personId, total, rsvps: rsvps.length, source: args.source });
  return { total, rsvps };
}

// ── Event-scoped cancellation (the event itself is closed) ────────────────────
// Unlike the person-scoped paths above, a cancelled/rescheduled event must NOT
// promote its waitlist: the seats are not freeing up, the event is gone. The
// waitlist is read (so those people get the cancel email) and then cleared so
// claim-waitlist-seat can never succeed on it.

export type EventVoidRow = {
  credential_id: string;
  event_id: string;
  person_id: string;
  credential_type: string;
  metadata: Record<string, unknown> | null;
  email: string | null;
  full_name: string | null;
};

/**
 * Void every ACTIVE credential bound to the given events (member_rsvp, guest_pass
 * incl. business +1s, public_rsvp, paid tickets). Lifetime member passes have
 * event_id NULL and are never touched. No waitlist release. Returns the voided
 * rows with the holder's email for the recipient list.
 */
export async function voidEventCredentials(
  supabase: AnySupabase,
  args: { eventIds: string[]; source: string },
): Promise<EventVoidRow[]> {
  if (args.eventIds.length === 0) return [];
  const { data: rows, error } = await supabase
    .from("attendance_credentials")
    .select("id, event_id, person_id, credential_type, metadata, person:people!attendance_credentials_person_id_fkey(email, full_name)")
    .in("event_id", args.eventIds)
    .eq("status", "active")
    .not("event_id", "is", null);
  if (error) throw new Error(`event credential lookup failed (${args.source}): ${error.message}`);
  const list = (rows ?? []) as Array<{ id: string; event_id: string; person_id: string; credential_type: string; metadata: Record<string, unknown> | null; person: { email: string | null; full_name: string | null } | Array<{ email: string | null; full_name: string | null }> | null }>;
  if (list.length === 0) return [];
  const ids = list.map((r) => r.id);
  const { error: vErr } = await supabase
    .from("attendance_credentials")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "active");
  if (vErr) throw new Error(`event credential void failed (${args.source}): ${vErr.message}`);
  log("event credentials voided", { events: args.eventIds.length, count: ids.length, source: args.source });
  return list.map((r) => {
    const p = Array.isArray(r.person) ? r.person[0] : r.person;
    return { credential_id: r.id, event_id: r.event_id, person_id: r.person_id, credential_type: r.credential_type, metadata: r.metadata, email: p?.email ?? null, full_name: p?.full_name ?? null };
  });
}

export type WaitlistRow = { event_id: string; user_id: string; email: string | null; full_name: string | null };

/** Read the waitlist for emailing, then delete it so no claim can succeed. No promotion. */
export async function closeEventWaitlist(
  supabase: AnySupabase,
  args: { eventIds: string[]; source: string },
): Promise<WaitlistRow[]> {
  if (args.eventIds.length === 0) return [];
  const { data: rows, error } = await supabase
    .from("event_waitlist")
    .select("id, event_id, user_id")
    .in("event_id", args.eventIds);
  if (error) throw new Error(`waitlist lookup failed (${args.source}): ${error.message}`);
  const list = (rows ?? []) as Array<{ id: string; event_id: string; user_id: string }>;
  if (list.length === 0) return [];
  const userIds = [...new Set(list.map((r) => r.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
  const byId: Record<string, { email: string | null; full_name: string | null }> = {};
  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) byId[p.id] = { email: p.email, full_name: p.full_name };
  const { error: dErr } = await supabase.from("event_waitlist").delete().in("id", list.map((r) => r.id));
  if (dErr) throw new Error(`waitlist clear failed (${args.source}): ${dErr.message}`);
  log("event waitlist cleared (no promotion)", { events: args.eventIds.length, rows: list.length, source: args.source });
  return list.map((r) => ({ event_id: r.event_id, user_id: r.user_id, email: byId[r.user_id]?.email ?? null, full_name: byId[r.user_id]?.full_name ?? null }));
}

export type LegacyRow = { event_id: string; email: string | null; full_name: string | null; kind: "ticket" | "public_rsvp"; amount_paid_cents?: number | null };

/**
 * Legacy mirrors: tickets (status→cancelled + cancelled_at + cancellation_reason)
 * and event_public_rsvps (status→cancelled). Returns the contacts found there so
 * nobody who only exists in a mirror is missed.
 */
export async function cancelLegacyMirrors(
  supabase: AnySupabase,
  args: { eventIds: string[]; reason: string; source: string },
): Promise<LegacyRow[]> {
  if (args.eventIds.length === 0) return [];
  const out: LegacyRow[] = [];
  const nowIso = new Date().toISOString();
  const { data: tix, error: tErr } = await supabase
    .from("tickets")
    .select("id, event_id, user_id, guest_email, guest_name, amount_paid_cents, status")
    .in("event_id", args.eventIds)
    .neq("status", "cancelled");
  if (tErr) log("legacy tickets lookup failed (non-fatal)", { error: tErr.message });
  const tickets = (tix ?? []) as Array<{ id: string; event_id: string; user_id: string | null; guest_email: string | null; guest_name: string | null; amount_paid_cents: number | null }>;
  if (tickets.length > 0) {
    const { error } = await supabase
      .from("tickets")
      .update({ status: "cancelled", cancelled_at: nowIso, cancellation_reason: args.reason })
      .in("id", tickets.map((t) => t.id));
    if (error) log("legacy tickets cancel failed (non-fatal)", { error: error.message });
    const userIds = [...new Set(tickets.map((t) => t.user_id).filter(Boolean))] as string[];
    const byId: Record<string, { email: string | null; full_name: string | null }> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) byId[p.id] = { email: p.email, full_name: p.full_name };
    }
    for (const t of tickets) {
      const email = t.guest_email ?? (t.user_id ? byId[t.user_id]?.email ?? null : null);
      const full_name = t.guest_name ?? (t.user_id ? byId[t.user_id]?.full_name ?? null : null);
      out.push({ event_id: t.event_id, email, full_name, kind: "ticket", amount_paid_cents: t.amount_paid_cents });
    }
  }
  const { data: prs, error: pErr } = await supabase
    .from("event_public_rsvps")
    .select("id, event_id, email, first_name, last_name, status")
    .in("event_id", args.eventIds)
    .neq("status", "cancelled");
  if (pErr) log("public rsvps lookup failed (non-fatal)", { error: pErr.message });
  const publics = (prs ?? []) as Array<{ id: string; event_id: string; email: string | null; first_name: string | null; last_name: string | null }>;
  if (publics.length > 0) {
    const { error } = await supabase.from("event_public_rsvps").update({ status: "cancelled", updated_at: nowIso }).in("id", publics.map((p) => p.id));
    if (error) log("public rsvps cancel failed (non-fatal)", { error: error.message });
    for (const p of publics) out.push({ event_id: p.event_id, email: p.email, full_name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null, kind: "public_rsvp" });
  }
  log("legacy mirrors cancelled", { tickets: tickets.length, public_rsvps: publics.length, source: args.source });
  return out;
}

/** Future-dated subset of a voided list (for "we removed these" emails). */
export const futureOnly = (rsvps: VoidedRsvp[], nowMs = Date.now()) =>
  rsvps.filter((r) => r.start_time && new Date(r.start_time).getTime() > nowMs);

/**
 * Email flavors (one template, send-email "membership-cancelled"):
 *   period_end - cancelled today, access continues until endsAt, no further charges
 *   immediate  - cancelled today, access ended now
 *   ended      - the paid period ended (period-end webhook); only sent when future RSVPs were removed
 */
export type CancelEmailMode = "period_end" | "immediate" | "ended";

/** Fire the membership-cancelled email (non-fatal). Returns the HTTP status (0 on throw). */
export async function sendMembershipCancelledEmail(
  env: CascadeEnv,
  args: {
    to: string;
    name: string | null;
    isBusiness: boolean;
    mode: CancelEmailMode;
    endsAt: string | null;
    removedRsvps: VoidedRsvp[];
  },
): Promise<number> {
  try {
    const res = await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey },
      body: JSON.stringify({
        to: args.to,
        template: "membership-cancelled",
        data: {
          name: args.name ?? "there",
          isBusiness: args.isBusiness,
          mode: args.mode,
          endsAtIso: args.endsAt,
          endsDate: args.endsAt ? fmtEventDateET(args.endsAt) : null,
          removedEvents: args.removedRsvps.map((r) => ({ title: r.title ?? "an event", dateLabel: r.start_time ? `${fmtEventDateET(r.start_time)} at ${fmtEventTimeET(r.start_time)}` : "" })),
          origin: env.siteUrl,
        },
      }),
    });
    if (!res.ok) log("membership-cancelled email FAILED (non-fatal)", { status: res.status, body: (await res.text()).slice(0, 200) });
    else log("membership-cancelled email sent", { to: args.to, mode: args.mode, removed: args.removedRsvps.length });
    return res.status;
  } catch (e) {
    log("membership-cancelled email threw (non-fatal)", String(e));
    return 0;
  }
}
