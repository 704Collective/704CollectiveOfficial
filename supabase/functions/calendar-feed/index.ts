import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  updated_at: string | null;
  tags: string[] | null;
}

type Scope = "social" | "business" | "all" | "rsvp_only";

const VALID_SCOPES: ReadonlySet<Scope> = new Set<Scope>([
  "social",
  "business",
  "all",
  "rsvp_only",
]);

const SCOPE_CALENDAR_NAME: Record<Scope, string> = {
  social: "704 Social Events",
  business: "704 Business Events",
  all: "704 Collective — All Events",
  rsvp_only: "704 Collective Events",
};

// Column on profiles where we stamp the first successful fetch. null = no stamp.
const SCOPE_STAMP_COLUMN: Record<Scope, string | null> = {
  social: "calendar_subscribed_social_at",
  business: "calendar_subscribed_business_at",
  all: "calendar_subscribed_all_at",
  rsvp_only: null,
};

// In-memory rate limiting store (resets on function cold start).
// For production, consider Redis or a Supabase table for persistent limits.
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per token

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(token);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(token, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.count++;
  return false;
}

function parseScope(raw: string | null): Scope {
  if (raw && VALID_SCOPES.has(raw as Scope)) return raw as Scope;
  return "rsvp_only";
}

function isScopeAuthorized(scope: Scope, memberType: string | null): boolean {
  // business + all are gated to business-tier members; social + rsvp_only are
  // open to any active member (social / business / partner).
  if (scope === "business" || scope === "all") {
    return memberType === "business";
  }
  return true;
}

// Simple ICS generator
function generateICS(events: Event[], calendarName: string): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const escapeText = (text: string | null): string => {
    return text
      ? text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
      : "";
  };

  const ics: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//704 Collective//Member Calendar//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    const startDate = new Date(event.start_time);
    const endDate = event.end_time ? new Date(event.end_time) : null;

    ics.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@704collective.com`,
      `DTSTAMP:${formatDate(new Date())}`,
      event.updated_at ? `LAST-MODIFIED:${formatDate(new Date(event.updated_at))}` : "",
      event.updated_at ? `SEQUENCE:${Math.floor(new Date(event.updated_at).getTime() / 1000)}` : "",
      `DTSTART:${formatDate(startDate)}`,
      endDate ? `DTEND:${formatDate(endDate)}` : "",
      `SUMMARY:${escapeText(event.title)}`,
      event.description ? `DESCRIPTION:${escapeText(event.description)}` : "",
      event.location_name ? `LOCATION:${escapeText(event.location_name)}` : "",
      "END:VEVENT",
    );
  }

  ics.push("END:VCALENDAR");
  return ics.join("\r\n");
}

// RSVP feed: events this member holds an active/used attendance credential for,
// future only. Canonical source is attendance_credentials (bridged profiles -> people
// by email), replacing the legacy tickets-table read.
async function fetchRsvpEvents(
  supabase: SupabaseClient,
  profileEmail: string | null,
): Promise<Event[] | { error: string }> {
  if (!profileEmail) return [];

  const { data: person, error: personErr } = await supabase
    .from("people")
    .select("id")
    .eq("email_lower", profileEmail.toLowerCase())
    .maybeSingle();

  if (personErr) {
    console.error("Calendar people query:", personErr);
    return { error: "Server error" };
  }
  if (!person) return [];

  const { data: credRows, error: credErr } = await supabase
    .from("attendance_credentials")
    .select("event_id")
    .eq("person_id", person.id)
    .in("status", ["active", "used"]);

  if (credErr) {
    console.error("Calendar credentials query:", credErr);
    return { error: "Server error" };
  }

  const eventIds = [
    ...new Set(
      (credRows ?? [])
        .map((c: { event_id: string | null }) => c.event_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (eventIds.length === 0) return [];

  const { data: evs, error: evErr } = await supabase
    .from("events")
    .select("id, title, description, start_time, end_time, location_name, updated_at")
    .in("id", eventIds)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true });

  if (evErr) {
    console.error("Calendar events query (rsvp_only):", evErr);
    return { error: "Server error" };
  }

  return (evs ?? []) as Event[];
}

// social / business / all: filter by event_type, 30-day backwindow.
async function fetchScopeEvents(
  supabase: SupabaseClient,
  scope: Exclude<Scope, "rsvp_only">,
): Promise<Event[] | { error: string }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("events")
    .select("id, title, description, start_time, end_time, location_name, updated_at, tags")
    .gte("start_time", thirtyDaysAgo)
    .order("start_time", { ascending: true });

  if (scope === "social") {
    // Social feed: all social events, PLUS any business event explicitly opened to
    // social members via the 'open_to_social' tag (rare one-off cross-tier events).
    // Business members get social events through the business feed instead.
    query = query.or("event_type.eq.social,and(event_type.eq.business,tags.cs.{open_to_social})");
  } else if (scope === "business") {
    // Business feed: business members are all-access, so they receive BOTH business
    // events and social events. (event_type is only ever 'social' or 'business'.)
    query = query.in("event_type", ["social", "business"]);
  }
  // scope === "all": no extra filter — return everything in the window.

  const { data, error } = await query;

  if (error) {
    console.error(`Calendar events query (${scope}):`, error);
    return { error: "Server error" };
  }

  return (data ?? []) as Event[];
}

// Stamp profiles.calendar_subscribed_<scope>_at on first successful fetch.
// Idempotent (only writes when the column is currently null). Silently best-effort:
// failures are logged but never break the calendar response.
async function stampSubscription(
  supabase: SupabaseClient,
  profileId: string,
  scope: Scope,
): Promise<void> {
  const column = SCOPE_STAMP_COLUMN[scope];
  if (!column) return;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: new Date().toISOString() })
      .eq("id", profileId)
      .is(column, null);
    if (error) {
      console.error(`Calendar subscription stamp (${scope}) failed:`, error);
    }
  } catch (err) {
    console.error(`Calendar subscription stamp (${scope}) threw:`, err);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const scope = parseScope(url.searchParams.get("scope"));

    if (!token) {
      return new Response("Missing calendar token", { status: 400, headers: corsHeaders });
    }

    // Validate token is a valid UUID format to prevent enumeration attacks
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return new Response("Invalid token format", { status: 400, headers: corsHeaders });
    }

    // Check rate limiting (per-token, regardless of scope)
    if (isRateLimited(token)) {
      return new Response("Too many requests. Please try again later.", {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": "60",
        },
      });
    }

    // Create Supabase client (service role)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Validate token; pull member_type for scope authorization.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, subscription_status, member_type")
      .eq("calendar_token", token)
      .is("deleted_at", null)
      .single();

    if (!profile) {
      // 404 — do not leak existence
      return new Response("Invalid token", { status: 404, headers: corsHeaders });
    }

    if (profile.subscription_status !== "active") {
      return new Response("Active membership required", { status: 403, headers: corsHeaders });
    }

    const memberType = (profile.member_type as string | null) ?? null;

    if (!isScopeAuthorized(scope, memberType)) {
      console.log(
        `[calendar-feed] scope=${scope} denied for tier=${memberType ?? "unknown"}`,
      );
      return new Response("Scope not available for your membership tier", {
        status: 403,
        headers: corsHeaders,
      });
    }

    console.log(`[calendar-feed] scope=${scope} tier=${memberType ?? "unknown"}`);

    const result = scope === "rsvp_only"
      ? await fetchRsvpEvents(supabase, (profile.email as string | null) ?? null)
      : await fetchScopeEvents(supabase, scope);

    if (!Array.isArray(result)) {
      return new Response(result.error, { status: 500, headers: corsHeaders });
    }

    // Best-effort first-fetch stamp; never blocks the response.
    await stampSubscription(supabase, profile.id, scope);

    const icsFile = generateICS(result, SCOPE_CALENDAR_NAME[scope]);

    return new Response(icsFile, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="704-events.ics"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Calendar error:", error);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
