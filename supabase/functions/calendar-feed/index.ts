import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_name: string | null;
}

// In-memory rate limiting store (resets on function cold start)
// For production, consider using Redis or Supabase for persistent rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per token

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(token);

  if (!entry || now > entry.resetTime) {
    // New window or expired
    rateLimitStore.set(token, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.count++;
  return false;
}

// Simple ICS generator
function generateICS(events: Event[]): string {
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
    "X-WR-CALNAME:704 Collective Events",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const startDate = new Date(event.start_time);
    const endDate = new Date(event.end_time);
    
    ics.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@704collective.com`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${escapeText(event.title)}`,
      event.description ? `DESCRIPTION:${escapeText(event.description)}` : "",
      event.location_name ? `LOCATION:${escapeText(event.location_name)}` : "",
      "END:VEVENT"
    );
  }

  ics.push("END:VCALENDAR");
  return ics.join("\r\n");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing calendar token", { status: 400, headers: corsHeaders });
    }

    // Validate token is a valid UUID format to prevent enumeration attacks
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return new Response("Invalid token format", { status: 400, headers: corsHeaders });
    }

    // Check rate limiting
    if (isRateLimited(token)) {
      return new Response("Too many requests. Please try again later.", { 
        status: 429, 
        headers: {
          ...corsHeaders,
          "Retry-After": "60"
        }
      });
    }
  
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
  
    // Validate token and check subscription status
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status")
      .eq("calendar_token", token)
      .is("deleted_at", null)
      .single();
  
    if (!profile) {
       return new Response("Invalid token", { status: 404, headers: corsHeaders });
    }

    if (profile.subscription_status !== 'active') {
      return new Response("Active membership required", { status: 403, headers: corsHeaders });
    }

    // Fetch future events
    const { data: events } = await supabase
      .from("events")
      .select("*")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });
  
    const icsFile = generateICS(events || []);

    return new Response(icsFile, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="704-events.ics"',
      },
    });
  } catch (error) {
    console.error("Calendar error:", error);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
