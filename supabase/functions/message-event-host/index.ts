// AUTH PATTERN: browser member call. Verifies the caller's user JWT, confirms
// the caller is an RSVP'd member of the event, then uses a service-role client
// to look up identities and send the host an email. ALL sender identity
// (name/email/phone) is resolved server-side — never trusted from the client.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? " - " + JSON.stringify(details) : "";
  console.log("[MESSAGE-EVENT-HOST] " + step + d);
};

// Rate limit: at most 2 messages per member per event per 5-minute window.
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 2;
const MAX_MESSAGE_LENGTH = 1000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ── 1. Auth: require a valid caller JWT (reject anonymous) ────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/+$/, "");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const userResult = await userClient.auth.getUser(token);
    const user = userResult.data.user;
    if (userResult.error || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── 2. Parse + validate body ──────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const event_id = typeof body.event_id === "string" ? body.event_id : "";
    const rawMessage = typeof body.message === "string" ? body.message : "";
    const message = rawMessage.trim();

    if (!event_id) return json({ error: "event_id is required" }, 400);
    if (!message) return json({ error: "Message cannot be empty" }, 400);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, 400);
    }

    // ── 3. Verify caller is an RSVP'd member of this event ────────────────────
    // Resolve the caller's people.id (canonical human record) and confirm an
    // active|used member_rsvp attendance credential scoped to the event.
    const personResult = await adminClient
      .from("people")
      .select("id")
      .filter("metadata->>profile_id", "eq", user.id)
      .maybeSingle();

    const personId = personResult.data?.id;
    if (!personId) {
      log("caller has no person record", { userId: user.id });
      return json({ error: "You must RSVP to this event before messaging the host" }, 403);
    }

    const credResult = await adminClient
      .from("attendance_credentials")
      .select("id")
      .eq("event_id", event_id)
      .eq("person_id", personId)
      .eq("credential_type", "member_rsvp")
      .in("status", ["active", "used"])
      .maybeSingle();

    if (credResult.error || !credResult.data) {
      log("caller not RSVP'd", { userId: user.id, event_id });
      return json({ error: "You must RSVP to this event before messaging the host" }, 403);
    }

    // ── 4. Rate limit ─────────────────────────────────────────────────────────
    // The rate_limits table schema is (key text, count int, window_start ts) —
    // see create-checkout / verify-checkout-session. Use those exact columns.
    const rlKey = `message-host:${user.id}:${event_id}`;
    const windowMs = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
    const nowIso = new Date().toISOString();

    const { data: rateRow } = await adminClient
      .from("rate_limits")
      .select("id, count, window_start")
      .eq("key", rlKey)
      .maybeSingle();

    if (rateRow) {
      const withinWindow = Date.now() - new Date(rateRow.window_start).getTime() < windowMs;
      if (withinWindow) {
        if (rateRow.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          log("rate limited", { key: rlKey });
          return json(
            { error: "You've sent a message recently — please wait a few minutes before sending another." },
            429,
          );
        }
        await adminClient.from("rate_limits").update({ count: rateRow.count + 1 }).eq("id", rateRow.id);
      } else {
        // Window expired — reset the counter.
        await adminClient.from("rate_limits").update({ count: 1, window_start: nowIso }).eq("id", rateRow.id);
      }
    } else {
      await adminClient.from("rate_limits").insert({ key: rlKey, count: 1, window_start: nowIso });
    }

    // ── 5. Fetch event + host ─────────────────────────────────────────────────
    const { data: event, error: eventErr } = await adminClient
      .from("events")
      .select("id, title, host_id, start_time")
      .eq("id", event_id)
      .maybeSingle();

    if (eventErr || !event) return json({ error: "Event not found" }, 404);
    if (!event.host_id) return json({ error: "This event does not have a host" }, 400);

    const { data: host } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", event.host_id)
      .maybeSingle();

    if (!host || !host.email) {
      log("host has no contact email", { host_id: event.host_id });
      return json({ error: "The host for this event is unavailable" }, 500);
    }

    // ── 6. Fetch CALLER's profile server-side (never trust client identity) ───
    const { data: sender } = await adminClient
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const memberName = sender?.full_name || "A 704 Collective member";
    const memberEmail = sender?.email || user.email || "";
    const memberPhone = sender?.phone || "";

    // Event date for context (Eastern time — the club's local timezone).
    const start = event.start_time ? new Date(event.start_time) : null;
    const eventDate = start
      ? start.toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          timeZone: "America/New_York",
        })
      : "";

    // ── 7. Send the host an email (service-role → restricted template) ────────
    const origin = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://704collective.com";
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        to: host.email,
        template: "host-message",
        skipCc: true,
        data: {
          hostName: host.full_name || "",
          memberName,
          memberEmail,
          memberPhone,
          eventName: event.title || "your event",
          eventDate,
          message,
          origin,
        },
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      log("send-email FAILED", { status: emailRes.status, body: errText });
      return json({ error: "We couldn't deliver your message. Please try again." }, 500);
    }

    log("host message sent", { event_id, host_id: event.host_id, from: user.id });
    return json({ success: true }, 200);
  } catch (err) {
    log("unhandled error", err instanceof Error ? err.message : String(err));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
