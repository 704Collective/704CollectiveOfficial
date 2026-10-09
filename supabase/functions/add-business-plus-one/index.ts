// add-business-plus-one — business members' standing +1 (the 3.4d shape).
//
// A member_type='business' member who holds an active member_rsvp on an
// eligible event may bring exactly ONE named guest. This is a membership
// right: it ignores events.allows_guest_passes and the monthly guest-pass cap.
// The guest is its own attendance_credentials row (credential_type='guest_pass',
// issued_by_person_id = the member's person) with metadata.source =
// 'business_plus_one' and metadata.member_credential_id linking it to the RSVP.
// Never routes through create-guest-pass; never writes legacy tickets rows.
//
// Eligible event: event_type='social', or event_type='business' whose
// required_tier is not business-only ('business' / 'founder').
//
// AUTH PATTERN: browser member call (user JWT verified, service role for writes).
// Body: { action: 'add' | 'remove' | 'status', event_id, guest_first_name?, guest_last_name?, guest_email? }
//
// RESPONSE SHAPE: hard refusals (auth, not a business member, ineligible event,
// no RSVP, event started, bad input) are 4xx. The three *expected* outcomes the
// UI renders inline — PLUS_ONE_NO_ROOM, GUEST_ALREADY_ATTENDING, PLUS_ONE_EXISTS —
// come back HTTP 200 with { success: false, code } so a kind "no room for your +1"
// never surfaces as a browser console error.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePerson } from "../_shared/resolvePerson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const log = (s: string, d?: unknown) => console.log(`[BUSINESS-PLUS-ONE] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
/** Expected, user-facing outcome: HTTP 200 + success:false + code (see RESPONSE SHAPE above). */
const soft = (code: string, error: string, extra: Record<string, unknown> = {}) => json({ success: false, code, error, ...extra }, 200);
const NO_ROOM_MSG = "You're in, but there's no room left for your +1 right now. If a spot opens you can add them then.";
export const PLUS_ONE_SOURCE = "business_plus_one";

type PlusOneRow = { id: string; token: string; status: string; checked_in_at: string | null; created_at: string; metadata: Record<string, unknown> | null; person: { full_name: string | null; email: string | null } | null };

const eligible = (ev: { event_type: string | null; required_tier: string | null }) =>
  ev.event_type === "social" || (ev.event_type === "business" && !["business", "founder"].includes(ev.required_tier ?? ""));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = (await req.json().catch(() => ({}))) as { action?: string; event_id?: string; guest_first_name?: string; guest_last_name?: string; guest_email?: string };
    const action = body.action ?? "add";
    if (!body.event_id) return json({ error: "event_id is required" }, 400);
    if (!["add", "remove", "status"].includes(action)) return json({ error: "Unknown action" }, 400);

    // ── member + right ──
    const { data: profile } = await admin.from("profiles").select("id, email, full_name, phone, member_type, subscription_status, membership_override, role").eq("id", user.id).is("deleted_at", null).maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);
    const isAdmin = profile.role === "admin" || profile.role === "super_admin";
    if (profile.member_type !== "business" && !isAdmin) return json({ error: "The +1 is a business-membership right.", code: "NOT_BUSINESS_MEMBER" }, 403);
    const isActive = profile.subscription_status === "active" || profile.subscription_status === "trialing" || profile.membership_override === true;
    if (!isActive && !isAdmin) return json({ error: "Membership is not active.", code: "NOT_ACTIVE" }, 403);

    const { personId } = await resolvePerson(admin, { authUserId: user.id, email: profile.email ?? user.email ?? undefined, profile, source: "business_plus_one", mint: action === "add" });
    if (!personId) return json({ error: "Member record not found" }, 404);

    // ── event eligibility ──
    const { data: event } = await admin.from("events").select("id, title, start_time, end_time, location_name, location_address, capacity, event_type, required_tier, allows_guest_passes, is_published").eq("id", body.event_id).maybeSingle();
    if (!event) return json({ error: "Event not found" }, 404);

    // ── the member's own active RSVP (the anchor) ──
    const { data: memberCred } = await admin.from("attendance_credentials").select("id").eq("person_id", personId).eq("event_id", event.id).eq("credential_type", "member_rsvp").in("status", ["active", "used"]).limit(1).maybeSingle();

    // ── existing +1 ──
    const { data: existingRows } = await admin.from("attendance_credentials")
      .select("id, token, status, checked_in_at, created_at, metadata, person:people!attendance_credentials_person_id_fkey(full_name, email)")
      .eq("event_id", event.id).eq("credential_type", "guest_pass").eq("issued_by_person_id", personId).eq("status", "active").contains("metadata", { source: PLUS_ONE_SOURCE }).limit(1);
    const existing = ((existingRows ?? []) as unknown as PlusOneRow[]).map((r) => ({ ...r, person: Array.isArray(r.person) ? (r.person[0] ?? null) : r.person }))[0] ?? null;
    const summarize = (r: PlusOneRow | null) => (r ? { id: r.id, guest_name: r.person?.full_name ?? null, guest_email: r.person?.email ?? null, checked_in_at: r.checked_in_at, created_at: r.created_at } : null);
    const started = new Date(event.start_time).getTime() <= Date.now();

    if (action === "status") {
      return json({ eligible: eligible(event), has_rsvp: !!memberCred, started, plus_one: summarize(existing) });
    }

    if (action === "remove") {
      if (!existing) return json({ success: true, removed: false, plus_one: null });
      const { error } = await admin.from("attendance_credentials").update({ status: "voided" }).eq("id", existing.id).eq("status", "active");
      if (error) return json({ error: "Could not remove your +1" }, 500);
      log("plus-one voided", { credId: existing.id, personId, event_id: event.id });
      return json({ success: true, removed: true, plus_one: null });
    }

    // ── add ──
    if (!eligible(event)) return json({ error: "This event doesn't include a +1 for business members.", code: "EVENT_NOT_ELIGIBLE" }, 403);
    if (!memberCred) return json({ error: "RSVP yourself first, then add your +1.", code: "NO_RSVP" }, 409);
    if (started) return json({ error: "This event has already started.", code: "EVENT_STARTED" }, 409);
    if (existing) return soft("PLUS_ONE_EXISTS", "You've already brought your +1 to this event.", { plus_one: summarize(existing) });
    const first = (body.guest_first_name ?? "").trim(), last = (body.guest_last_name ?? "").trim();
    const guestEmail = (body.guest_email ?? "").trim().toLowerCase();
    if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return json({ error: "Your guest's first name, last name and a valid email are required.", code: "INVALID_GUEST" }, 400);
    if (guestEmail === (profile.email ?? "").toLowerCase()) return json({ error: "Your +1 needs their own email address.", code: "INVALID_GUEST" }, 400);
    const guestName = `${first} ${last}`;

    // ── capacity (same ledger as member RSVPs; the DB trigger backstops) ──
    if (event.capacity != null) {
      const { count } = await admin.from("attendance_credentials").select("id", { count: "exact", head: true }).eq("event_id", event.id).in("status", ["active", "used"]);
      if (typeof count === "number" && count >= event.capacity) {
        log("no room for plus-one", { event_id: event.id, count, capacity: event.capacity });
        return soft("PLUS_ONE_NO_ROOM", NO_ROOM_MSG);
      }
    }

    // ── guest person row by email (create-guest-pass's pattern) ──
    let guestPersonId: string | null = null;
    const { data: existingGuest } = await admin.from("people").select("id, roles").eq("email_lower", guestEmail).maybeSingle();
    if (existingGuest) {
      guestPersonId = existingGuest.id;
      const roles: string[] = existingGuest.roles ?? [];
      if (!roles.includes("guest")) await admin.from("people").update({ roles: [...roles, "guest"], updated_at: new Date().toISOString() }).eq("id", guestPersonId);
    } else {
      const { data: newGuest, error: guestErr } = await admin.from("people").insert({ email: guestEmail, full_name: guestName, roles: ["guest"], metadata: { source: PLUS_ONE_SOURCE, invited_by_profile_id: user.id } }).select("id").single();
      if (guestErr || !newGuest) { log("guest person insert failed", { error: guestErr?.message }); return json({ error: "Could not save your guest" }, 500); }
      guestPersonId = newGuest.id;
    }
    if (guestPersonId === personId) return json({ error: "Your +1 needs their own email address.", code: "INVALID_GUEST" }, 400);

    // ── the +1 credential ──
    const tokenBytes = new Uint8Array(8); crypto.getRandomValues(tokenBytes);
    const token = "C-" + Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
    const memberName = profile.full_name?.trim() || profile.email || "a 704 member";
    const { data: cred, error: credErr } = await admin.from("attendance_credentials").insert({
      token, person_id: guestPersonId, event_id: event.id, credential_type: "guest_pass", status: "active", issued_by_person_id: personId,
      metadata: { source: PLUS_ONE_SOURCE, member_credential_id: memberCred.id, member_profile_id: user.id, member_name: memberName, guest_name: guestName, guest_email: guestEmail },
    }).select("id, token").single();
    if (credErr || !cred) {
      const code = (credErr as { code?: string } | null)?.code;
      const msg = credErr?.message ?? "";
      if (code === "23505") return soft("GUEST_ALREADY_ATTENDING", `${guestName} already has a spot at this event.`);
      if (msg.includes("EVENT_AT_CAPACITY") || msg.toLowerCase().includes("capacity")) return soft("PLUS_ONE_NO_ROOM", NO_ROOM_MSG);
      if (msg.includes("RSVP_NOT_OPEN")) return json({ error: "RSVPs for this event haven't opened yet.", code: "RSVP_NOT_OPEN" }, 409);
      log("credential insert failed", { error: msg, code });
      return json({ error: "Could not add your +1" }, 500);
    }
    log("plus-one issued", { credId: cred.id, personId, guestPersonId, event_id: event.id });

    // ── guest email: the existing guest-pass template, QR encodes the CREDENTIAL TOKEN ──
    let emailStatus = 0;
    try {
      const origin = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "https://704collective.com";
      const start = new Date(event.start_time);
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          to: guestEmail, template: "guest-pass", skipCc: true,
          data: {
            guestName, eventTitle: event.title, eventName: event.title,
            eventDate: start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }),
            eventTime: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }),
            eventLocation: [event.location_name, event.location_address].filter(Boolean).join(", "),
            inviterName: memberName, memberName,
            personalMessage: `${memberName} is bringing you as their +1.`,
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(cred.token)}`,
            guestPassCode: cred.token, passCode: cred.token,
            origin, startTimeIso: event.start_time, endTimeIso: event.end_time, eventId: event.id, recipientEmail: guestEmail,
          },
        }),
      });
      emailStatus = res.status;
      if (!res.ok) log("guest email failed (non-blocking)", { status: res.status });
    } catch (e) { log("guest email threw (non-blocking)", { error: String(e) }); }

    return json({ success: true, plus_one: { id: cred.id, guest_name: guestName, guest_email: guestEmail, checked_in_at: null, created_at: new Date().toISOString() }, email_status: emailStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BUSINESS-PLUS-ONE] Internal error:", msg);
    return json({ error: "Internal error" }, 500);
  }
});
