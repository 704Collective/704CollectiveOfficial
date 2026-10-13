// cancel-event — admin CANCEL / RESCHEDULE of an event (or its upcoming series).
//
// AUTH PATTERN: browser admin call (user JWT verified, has_role admin — same as
// notify-event-change), service role for writes.
//
// Body:
//   { event_id, action: 'cancel' | 'reschedule', scope: 'occurrence' | 'series',
//     reason, note?, rescheduled_to_event_id?, mode: 'preview' | 'commit' | 'resume' }
//
// ORDER OF OPERATIONS (commit):
//   0. reschedule only: the NEW event must already exist, be scheduled and published,
//      and not be one of the affected events. We never mark an old event
//      rescheduled without a live target.
//   1. Mark status + cancel columns on every affected event FIRST (idempotent:
//      already-closed events are left as they are).
//   2. Void through the event-scoped helpers (no waitlist promotion): credentials,
//      waitlist (read, then cleared), legacy mirrors (tickets, event_public_rsvps).
//   3. Recipient list = voided holders + waitlist + mirrors, deduped by email,
//      grouped per person across dates. Each recipient is written to email_log as
//      status='queued' BEFORE any send (metadata.anchor_event_id = the request's
//      event). This queue is the idempotency ledger: 'resume' only sends rows that
//      are still queued/failed, so re-runs never duplicate.
//   4. Bump events.ics_sequence (CAS, as notify-event-change) once per event, then
//      send individually with one METHOD:CANCEL ICS per affected event, 250 ms
//      apart, with 429/5xx retry + backoff. Up to SEND_BATCH per invocation; the
//      response carries `remaining` and the UI loops mode:'resume' until 0, so a
//      large list never runs into the function wall clock.
//
// Preview reads everything and writes nothing.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { cancelLegacyMirrors, closeEventWaitlist, voidEventCredentials, type EventVoidRow, type LegacyRow, type WaitlistRow } from "../_shared/credentialCascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const log = (s: string, d?: unknown) => console.log(`[CANCEL-EVENT] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TEMPLATE = "event-cancelled";
const SEND_BATCH = 40;
const SEND_SPACING_MS = 250;
const NAME_PLACEHOLDER = "[[RECIPIENT_NAME]]";
const REASONS = ["Weather", "Venue issue", "Host or vendor issue", "Other"];

type EventRow = { id: string; title: string; description: string | null; start_time: string; end_time: string; location_name: string | null; location_address: string | null; parent_event_id: string | null; status: string; ics_sequence: number; eventbrite_published: boolean | null; eventbrite_event_id: string | null; is_published: boolean | null; rescheduled_to_event_id: string | null; cancel_reason: string | null; cancel_note: string | null };
type Recipient = { email: string; name: string; event_ids: string[]; kinds: string[] };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const locOf = (e: { location_name: string | null; location_address: string | null }) => [e.location_name, e.location_address].filter(Boolean).join(", ");

function toBase64Utf8(str: string): string { const bytes = new TextEncoder().encode(str); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }
// keep in sync with send-email buildEventIcs
function buildCancelIcs(e: EventRow, sequence: number): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//704 Collective//Events//EN", "CALSCALE:GREGORIAN", "METHOD:CANCEL",
    "BEGIN:VEVENT", `UID:${e.id}@704collective.com`, "ORGANIZER;CN=704 Collective:mailto:no-reply@704collective.com",
    `DTSTAMP:${fmt(new Date().toISOString())}`, `DTSTART:${fmt(e.start_time)}`, ...(e.end_time ? [`DTEND:${fmt(e.end_time)}`] : []),
    `SUMMARY:${esc(e.title)}`, ...(locOf(e) ? [`LOCATION:${esc(locOf(e))}`] : []), `SEQUENCE:${sequence}`, "STATUS:CANCELLED",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://704collective.com";

    // ── admin auth (notify-event-change pattern) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const adminUserId = (claims?.claims as { sub?: string } | undefined)?.sub;
    if (claimsErr || !adminUserId) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: adminUserId, _role: "admin" });
    const { data: isSuper } = isAdmin ? { data: false } : await admin.rpc("has_role", { _user_id: adminUserId, _role: "super_admin" });
    if (!isAdmin && !isSuper) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as { event_id?: string; action?: string; scope?: string; reason?: string; note?: string; rescheduled_to_event_id?: string; mode?: string; origin?: string };
    const action = body.action === "reschedule" ? "reschedule" : "cancel";
    const scope = body.scope === "series" ? "series" : "occurrence";
    const mode = body.mode === "preview" ? "preview" : body.mode === "resume" ? "resume" : "commit";
    const reason = (body.reason ?? "").trim();
    const note = (body.note ?? "").trim();
    const origin = body.origin && /^https?:\/\//.test(body.origin) ? body.origin : siteUrl;
    if (!body.event_id) return json({ error: "event_id is required" }, 400);
    if (mode !== "resume" && !reason) return json({ error: "reason is required" }, 400);
    if (mode !== "resume" && !REASONS.some((r) => reason.startsWith(r))) return json({ error: `reason must start with one of: ${REASONS.join(", ")}` }, 400);

    // ── anchor + affected events ──
    const { data: anchor } = await admin.from("events").select("*").eq("id", body.event_id).maybeSingle();
    if (!anchor) return json({ error: "Event not found" }, 404);
    const anchorEv = anchor as EventRow;
    let affected: EventRow[] = [anchorEv];
    if (scope === "series") {
      const rootId = anchorEv.parent_event_id ?? anchorEv.id;
      const { data: fam } = await admin.from("events").select("*").or(`id.eq.${rootId},parent_event_id.eq.${rootId}`).order("start_time");
      const nowMs = Date.now();
      // Entire series = ONLY upcoming occurrences; past ones are untouched.
      affected = ((fam ?? []) as EventRow[]).filter((e) => new Date(e.start_time).getTime() > nowMs || e.id === anchorEv.id);
    }
    const alreadyClosed = affected.filter((e) => e.status !== "scheduled");
    const toClose = affected.filter((e) => e.status === "scheduled");
    const affectedIds = affected.map((e) => e.id);

    // ── reschedule target (must be live BEFORE anything is marked) ──
    let target: EventRow | null = null;
    if (action === "reschedule") {
      if (!body.rescheduled_to_event_id && mode !== "preview") return json({ error: "rescheduled_to_event_id is required for a reschedule" }, 400);
      if (body.rescheduled_to_event_id) {
        const { data: t } = await admin.from("events").select("*").eq("id", body.rescheduled_to_event_id).maybeSingle();
        target = (t as EventRow | null) ?? null;
        if (!target) return json({ error: "The new event does not exist yet - create it first", code: "TARGET_MISSING" }, 409);
        if (affectedIds.includes(target.id)) return json({ error: "The new event cannot be one of the events being rescheduled", code: "TARGET_IN_SET" }, 409);
        if (target.status !== "scheduled") return json({ error: "The new event is not open", code: "TARGET_CLOSED" }, 409);
        if (target.is_published === false && mode !== "preview") return json({ error: "The new event must be published so the RSVP link works", code: "TARGET_UNPUBLISHED" }, 409);
      }
    }

    // ── recipient discovery (read-only; used by preview and to build the queue) ──
    const collectRecipients = async (ids: string[]): Promise<{ recipients: Recipient[]; paid: Array<{ email: string | null; name: string | null; amount_cents: number; via: string; event_id: string }> }> => {
      const map = new Map<string, Recipient>();
      const add = (email: string | null, name: string | null, eventId: string, kind: string) => {
        const key = (email ?? "").trim().toLowerCase(); if (!key || !key.includes("@")) return;
        const r = map.get(key) ?? { email: key, name: name?.trim() || "there", event_ids: [], kinds: [] };
        if (!r.event_ids.includes(eventId)) r.event_ids.push(eventId);
        if (!r.kinds.includes(kind)) r.kinds.push(kind);
        if (r.name === "there" && name?.trim()) r.name = name.trim();
        map.set(key, r);
      };
      const paid: Array<{ email: string | null; name: string | null; amount_cents: number; via: string; event_id: string }> = [];
      const { data: creds } = await admin.from("attendance_credentials").select("id, event_id, credential_type, status, metadata, person:people!attendance_credentials_person_id_fkey(email, full_name)").in("event_id", ids).in("status", ["active", "used"]);
      for (const c of (creds ?? []) as Array<{ event_id: string; credential_type: string; metadata: Record<string, unknown> | null; person: { email: string | null; full_name: string | null } | Array<{ email: string | null; full_name: string | null }> | null }>) {
        const p = Array.isArray(c.person) ? c.person[0] : c.person;
        const kind = c.metadata?.source === "business_plus_one" ? "business_plus_one" : c.credential_type;
        add(p?.email ?? null, p?.full_name ?? null, c.event_id, kind);
        const cents = Number(c.metadata?.amount_paid_cents ?? 0);
        if (c.metadata?.stripe_payment_id || cents > 0) paid.push({ email: p?.email ?? null, name: p?.full_name ?? null, amount_cents: cents, via: "credential", event_id: c.event_id });
      }
      const { data: wl } = await admin.from("event_waitlist").select("event_id, user_id").in("event_id", ids);
      const wlUsers = [...new Set(((wl ?? []) as Array<{ user_id: string }>).map((w) => w.user_id))];
      if (wlUsers.length) {
        const { data: profs } = await admin.from("profiles").select("id, email, full_name").in("id", wlUsers);
        const byId: Record<string, { email: string | null; full_name: string | null }> = {};
        for (const p of (profs ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) byId[p.id] = p;
        for (const w of (wl ?? []) as Array<{ event_id: string; user_id: string }>) add(byId[w.user_id]?.email ?? null, byId[w.user_id]?.full_name ?? null, w.event_id, "waitlist");
      }
      const { data: tix } = await admin.from("tickets").select("event_id, user_id, guest_email, guest_name, amount_paid_cents, status").in("event_id", ids).neq("status", "cancelled");
      const tUsers = [...new Set(((tix ?? []) as Array<{ user_id: string | null }>).map((t) => t.user_id).filter(Boolean))] as string[];
      const tById: Record<string, { email: string | null; full_name: string | null }> = {};
      if (tUsers.length) { const { data: profs } = await admin.from("profiles").select("id, email, full_name").in("id", tUsers); for (const p of (profs ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) tById[p.id] = p; }
      for (const t of (tix ?? []) as Array<{ event_id: string; user_id: string | null; guest_email: string | null; guest_name: string | null; amount_paid_cents: number | null }>) {
        const email = t.guest_email ?? (t.user_id ? tById[t.user_id]?.email ?? null : null);
        const name = t.guest_name ?? (t.user_id ? tById[t.user_id]?.full_name ?? null : null);
        add(email, name, t.event_id, "ticket");
        if ((t.amount_paid_cents ?? 0) > 0) paid.push({ email, name, amount_cents: t.amount_paid_cents ?? 0, via: "ticket", event_id: t.event_id });
      }
      const { data: prs } = await admin.from("event_public_rsvps").select("event_id, email, first_name, last_name, status").in("event_id", ids).neq("status", "cancelled");
      for (const p of (prs ?? []) as Array<{ event_id: string; email: string | null; first_name: string | null; last_name: string | null }>) add(p.email, [p.first_name, p.last_name].filter(Boolean).join(" "), p.event_id, "public_rsvp");
      const { data: pays } = await admin.from("payments").select("user_id, amount, status, metadata, created_at").eq("payment_type", "ticket").in("status", ["succeeded", "paid"]);
      for (const p of (pays ?? []) as Array<{ user_id: string | null; amount: number; metadata: Record<string, unknown> | null }>) {
        const evId = String(p.metadata?.event_id ?? ""); if (!ids.includes(evId)) continue;
        if (!paid.some((x) => x.via === "credential" && x.event_id === evId && x.amount_cents === p.amount)) paid.push({ email: null, name: p.user_id, amount_cents: p.amount, via: "payments", event_id: evId });
      }
      return { recipients: [...map.values()], paid };
    };

    // ── render the email once (name placeholder) ──
    const render = async (recipientsEvents: EventRow[]) => {
      const data = {
        name: NAME_PLACEHOLDER,
        mode: action === "reschedule" ? "rescheduled" : "cancelled",
        reason, note,
        events: recipientsEvents.map((e) => ({ title: e.title, dateLabel: fmtDate(e.start_time), timeLabel: `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}`, location: locOf(e) })),
        newEvent: target ? { title: target.title, dateLabel: fmtDate(target.start_time), timeLabel: `${fmtTime(target.start_time)} - ${fmtTime(target.end_time)}`, location: locOf(target), url: `${origin}/events/${target.id}` } : null,
        origin,
      };
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }, body: JSON.stringify({ mode: "render", template: TEMPLATE, data }) });
      if (!res.ok) throw new Error(`render failed: ${res.status} ${await res.text()}`);
      return (await res.json()) as { subject: string; html: string };
    };

    // ════════════════ PREVIEW ════════════════
    if (mode === "preview") {
      const { recipients, paid } = await collectRecipients(affectedIds);
      const { subject, html } = await render(affected);
      return json({
        success: true, action, scope,
        affected: affected.map((e) => ({ id: e.id, title: e.title, start_time: e.start_time, status: e.status })),
        already_closed: alreadyClosed.map((e) => e.id),
        recipients: recipients.map((r) => ({ email: r.email, name: r.name, event_count: r.event_ids.length, kinds: r.kinds })),
        recipient_count: recipients.length,
        paid,
        eventbrite_reminder: affected.filter((e) => e.eventbrite_published || e.eventbrite_event_id).map((e) => ({ id: e.id, title: e.title, eventbrite_event_id: e.eventbrite_event_id })),
        target: target ? { id: target.id, title: target.title, start_time: target.start_time } : null,
        email: { subject, html: html.replace(NAME_PLACEHOLDER, "there") },
      });
    }

    // ════════════════ COMMIT ════════════════
    const anchorId = anchorEv.id;
    if (mode === "commit") {
      // 1. mark FIRST (only still-scheduled rows; idempotent)
      if (toClose.length > 0) {
        const nowIso = new Date().toISOString();
        const { error: mErr } = await admin.from("events").update({
          status: action === "reschedule" ? "rescheduled" : "cancelled",
          cancelled_at: nowIso, cancelled_by: adminUserId, cancel_reason: reason, cancel_note: note || null,
          rescheduled_to_event_id: action === "reschedule" ? target!.id : null,
        }).in("id", toClose.map((e) => e.id)).eq("status", "scheduled");
        if (mErr) return json({ error: `Could not mark events: ${mErr.message}` }, 500);
        log("events marked", { action, ids: toClose.map((e) => e.id) });
      }

      // 2. void (event-scoped, no waitlist promotion) — collect contacts as we go
      const voided: EventVoidRow[] = await voidEventCredentials(admin, { eventIds: affectedIds, source: "cancel-event" });
      const waitlisted: WaitlistRow[] = await closeEventWaitlist(admin, { eventIds: affectedIds, source: "cancel-event" });
      const legacy: LegacyRow[] = await cancelLegacyMirrors(admin, { eventIds: affectedIds, reason, source: "cancel-event" });

      // 3. recipients -> email_log queue (dedupe against rows already queued/sent for this anchor)
      const map = new Map<string, Recipient>();
      const add = (email: string | null, name: string | null, eventId: string, kind: string) => {
        const key = (email ?? "").trim().toLowerCase(); if (!key || !key.includes("@")) return;
        const r = map.get(key) ?? { email: key, name: name?.trim() || "there", event_ids: [], kinds: [] };
        if (!r.event_ids.includes(eventId)) r.event_ids.push(eventId);
        if (!r.kinds.includes(kind)) r.kinds.push(kind);
        if (r.name === "there" && name?.trim()) r.name = name.trim();
        map.set(key, r);
      };
      for (const v of voided) add(v.email, v.full_name, v.event_id, v.metadata?.source === "business_plus_one" ? "business_plus_one" : v.credential_type);
      for (const w of waitlisted) add(w.email, w.full_name, w.event_id, "waitlist");
      for (const l of legacy) add(l.email, l.full_name, l.event_id, l.kind);
      // 'used' credentials (checked-in rows on a multi-day series) are not voided but still get the news
      const { data: usedRows } = await admin.from("attendance_credentials").select("event_id, credential_type, person:people!attendance_credentials_person_id_fkey(email, full_name)").in("event_id", affectedIds).eq("status", "used");
      for (const c of (usedRows ?? []) as Array<{ event_id: string; credential_type: string; person: { email: string | null; full_name: string | null } | Array<{ email: string | null; full_name: string | null }> | null }>) { const p = Array.isArray(c.person) ? c.person[0] : c.person; add(p?.email ?? null, p?.full_name ?? null, c.event_id, c.credential_type); }

      const { data: existingLog } = await admin.from("email_log").select("to_email").eq("template", TEMPLATE).filter("metadata->>anchor_event_id", "eq", anchorId);
      const already = new Set(((existingLog ?? []) as Array<{ to_email: string }>).map((r) => r.to_email.toLowerCase()));
      const { subject } = await render(affected);
      const queueRows = [...map.values()].filter((r) => !already.has(r.email)).map((r) => ({
        to_email: r.email, to_name: r.name, from_email: "no-reply@704collective.com", subject, template: TEMPLATE, status: "queued",
        metadata: { source: "cancel-event", anchor_event_id: anchorId, action, scope, reason, event_ids: r.event_ids, kinds: r.kinds, rescheduled_to_event_id: target?.id ?? null },
      }));
      if (queueRows.length > 0) {
        const { error: qErr } = await admin.from("email_log").insert(queueRows);
        if (qErr) return json({ error: `Could not queue emails: ${qErr.message}` }, 500);
      }
      log("queued", { anchorId, queued: queueRows.length, skipped_already_logged: already.size });

      // 4. bump ics_sequence once per affected event (CAS; best-effort)
      for (const e of affected) {
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const { data: row } = await admin.from("events").select("ics_sequence").eq("id", e.id).single();
            const cur = typeof row?.ics_sequence === "number" ? row.ics_sequence : 0;
            const { data: upd } = await admin.from("events").update({ ics_sequence: cur + 1 }).eq("id", e.id).eq("ics_sequence", cur).select("ics_sequence");
            if (upd && upd.length) { e.ics_sequence = cur + 1; break; }
          }
        } catch (seqErr) { console.error("[CANCEL-EVENT] ICS_SEQ_ERROR", String(seqErr)); }
      }
    }

    // ════════════════ SEND (commit continues here; resume starts here) ════════════════
    if (!resendKey) return json({ error: "RESEND_API_KEY not set" }, 500);
    const { data: pending } = await admin.from("email_log").select("id, to_email, to_name, metadata").eq("template", TEMPLATE).in("status", ["queued", "failed"]).filter("metadata->>anchor_event_id", "eq", anchorId).order("created_at").limit(SEND_BATCH);
    const batch = (pending ?? []) as Array<{ id: string; to_email: string; to_name: string | null; metadata: Record<string, unknown> }>;
    // Re-read affected events for the current ICS sequence + template data (resume has no in-memory copy).
    const { data: freshAffected } = await admin.from("events").select("*").in("id", affectedIds);
    const byId: Record<string, EventRow> = {}; for (const e of (freshAffected ?? []) as EventRow[]) byId[e.id] = e;
    if (!target && anchorEv.rescheduled_to_event_id) { const { data: t } = await admin.from("events").select("*").eq("id", anchorEv.rescheduled_to_event_id).maybeSingle(); target = (t as EventRow | null) ?? null; }
    const storedReason = (batch[0]?.metadata?.reason as string | undefined) ?? reason;
    const effectiveAction = (batch[0]?.metadata?.action as string | undefined) ?? action;

    let sent = 0, failed = 0;
    if (batch.length > 0) {
      // Render per distinct event set (series members may hold different date subsets)
      const renderCache = new Map<string, { subject: string; html: string }>();
      for (const row of batch) {
        const evIds = (row.metadata?.event_ids as string[] | undefined)?.filter((id) => byId[id]) ?? affectedIds;
        const key = evIds.slice().sort().join(",");
        let tpl = renderCache.get(key);
        if (!tpl) {
          const data = {
            name: NAME_PLACEHOLDER, mode: effectiveAction === "reschedule" ? "rescheduled" : "cancelled",
            reason: storedReason, note: (row.metadata?.note as string | undefined) ?? (byId[affectedIds[0]]?.cancel_note ?? note),
            events: evIds.map((id) => byId[id]).map((e) => ({ title: e.title, dateLabel: fmtDate(e.start_time), timeLabel: `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}`, location: locOf(e) })),
            newEvent: target ? { title: target.title, dateLabel: fmtDate(target.start_time), timeLabel: `${fmtTime(target.start_time)} - ${fmtTime(target.end_time)}`, location: locOf(target), url: `${origin}/events/${target.id}` } : null,
            origin,
          };
          const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }, body: JSON.stringify({ mode: "render", template: TEMPLATE, data }) });
          if (!res.ok) return json({ error: `render failed: ${res.status}` }, 500);
          tpl = (await res.json()) as { subject: string; html: string };
          renderCache.set(key, tpl);
        }
        const safeName = (row.to_name || "there").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const attachments = evIds.map((id) => byId[id]).map((e) => ({ filename: `cancel-${e.id.slice(0, 8)}.ics`, content: toBase64Utf8(buildCancelIcs(e, e.ics_sequence)), content_type: "text/calendar; method=CANCEL" }));
        const payload = JSON.stringify({ from: "704 Collective <no-reply@704collective.com>", to: [row.to_email], subject: tpl.subject, html: tpl.html.replace(NAME_PLACEHOLDER, safeName), attachments });
        let ok = false, lastStatus = 0, resendId: string | null = null;
        for (let attempt = 0; attempt < 4 && !ok; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
          try {
            const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` }, body: payload });
            lastStatus = res.status;
            if (res.ok) { ok = true; try { resendId = ((await res.json()) as { id?: string }).id ?? null; } catch { /* */ } }
            else if (res.status === 429 || res.status >= 500) { const ra = Number(res.headers.get("retry-after") ?? 0); if (ra > 0) await new Promise((r) => setTimeout(r, ra * 1000)); continue; }
            else { log("send rejected", { status: res.status, body: (await res.text()).slice(0, 160) }); break; }
          } catch (e) { log("send threw", { error: String(e) }); }
        }
        const nowIso = new Date().toISOString();
        await admin.from("email_log").update(ok ? { status: "sent", sent_at: nowIso, resend_message_id: resendId, failed_at: null, failure_reason: null } : { status: "failed", failed_at: nowIso, failure_reason: `resend ${lastStatus}` }).eq("id", row.id);
        if (ok) sent++; else failed++;
        await new Promise((r) => setTimeout(r, SEND_SPACING_MS));
      }
    }
    const { count: remaining } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("template", TEMPLATE).eq("status", "queued").filter("metadata->>anchor_event_id", "eq", anchorId);
    const { count: failedTotal } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("template", TEMPLATE).eq("status", "failed").filter("metadata->>anchor_event_id", "eq", anchorId);
    const { count: sentTotal } = await admin.from("email_log").select("id", { count: "exact", head: true }).eq("template", TEMPLATE).eq("status", "sent").filter("metadata->>anchor_event_id", "eq", anchorId);
    log("send pass done", { anchorId, mode, sent, failed, remaining, sentTotal, failedTotal });
    return json({ success: true, action, scope, mode, affected: affectedIds, already_closed: alreadyClosed.map((e) => e.id), sent, failed, remaining: remaining ?? 0, sent_total: sentTotal ?? 0, failed_total: failedTotal ?? 0, rescheduled_to_event_id: target?.id ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CANCEL-EVENT] Internal error:", msg);
    return json({ error: msg }, 500);
  }
});
