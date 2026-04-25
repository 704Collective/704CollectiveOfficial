import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CAPTURE-PUBLIC-RSVP] ${step}${d}`);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const {
      event_id,
      first_name,
      last_name,
      email,
      phone,
      sms_consent,
      origin,
    } = body as {
      event_id?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      sms_consent?: boolean;
      origin?: string;
    };

    // Validation
    if (!event_id || !first_name || !last_name || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanFirst = first_name.trim().slice(0, 100);
    const cleanLast = last_name.trim().slice(0, 100);
    const cleanPhone = phone ? phone.trim().slice(0, 30) : null;

    if (!cleanFirst || !cleanLast) {
      return new Response(
        JSON.stringify({ error: "Name fields cannot be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify event exists and is actually public_free
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, location_name, location_address, access_type, is_published")
      .eq("id", event_id)
      .maybeSingle();

    if (eventErr || !event) {
      log("Event not found", { event_id, error: eventErr?.message });
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event.access_type !== "public_free") {
      log("Event is not public_free", { event_id, access_type: event.access_type });
      return new Response(
        JSON.stringify({ error: "This event does not accept public RSVPs" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!event.is_published) {
      log("Event not published", { event_id });
      return new Response(
        JSON.stringify({ error: "Event is not currently available" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting — no more than 5 RSVPs from the same email in 15 min across all events
    const rateWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("event_public_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("email", cleanEmail)
      .gte("created_at", rateWindow);

    if ((recentCount ?? 0) >= 5) {
      log("Rate limit hit", { email: cleanEmail, recentCount });
      return new Response(
        JSON.stringify({ error: "Too many recent RSVPs. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert a contact record (tie CRM to this person)
    const fullName = `${cleanFirst} ${cleanLast}`;
    let contactId: string | null = null;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      await supabase
        .from("contacts")
        .update({
          full_name: fullName,
          phone: cleanPhone ?? undefined,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", contactId);
    } else {
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          email: cleanEmail,
          full_name: fullName,
          phone: cleanPhone,
          source: "public_event_rsvp",
          source_detail: event.title,
          status: "lead",
          contact_type: "prospect",
          first_seen_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (contactErr) {
        log("Contact insert failed (non-fatal)", { error: contactErr.message });
      } else {
        contactId = newContact?.id ?? null;
      }
    }

    // Tag the contact for CRM segmentation
    if (contactId) {
      await supabase.from("contact_tags").upsert(
        [
          { contact_id: contactId, tag: "free-event-rsvp" },
          { contact_id: contactId, tag: "prospect" },
        ],
        { onConflict: "contact_id,tag" }
      );
    }

    // Extract metadata
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    // Insert the RSVP — on conflict (event_id + email), just update name/phone
    const { data: rsvp, error: rsvpErr } = await supabase
      .from("event_public_rsvps")
      .upsert(
        {
          event_id,
          contact_id: contactId,
          first_name: cleanFirst,
          last_name: cleanLast,
          email: cleanEmail,
          phone: cleanPhone,
          sms_consent: sms_consent === true,
          status: "rsvp",
          ip_address: ipAddress,
          user_agent: userAgent,
        },
        { onConflict: "event_id,email" }
      )
      .select("id")
      .single();

    if (rsvpErr) {
      // Capacity errors thrown by the trg_check_event_capacity_public_rsvps trigger
      if (rsvpErr.message?.toLowerCase().includes("capacity")) {
        log("RSVP rejected: event at capacity", { event_id, email: cleanEmail });
        return new Response(
          JSON.stringify({ error: "Event is at capacity" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      log("RSVP insert failed", { error: rsvpErr.message });
      return new Response(
        JSON.stringify({ error: "Failed to save RSVP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("RSVP saved", { rsvpId: rsvp?.id, eventId: event_id, email: cleanEmail });

    // Fire-and-forget confirmation email
    try {
      const emailOrigin = origin || "https://704collective.com";
      const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      const formatTime = (iso: string) =>
        new Date(iso).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York",
        });

      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: cleanEmail,
          template: "public-rsvp-confirmation",
          data: {
            name: cleanFirst,
            eventName: event.title,
            eventDate: formatDate(event.start_time),
            eventTime: `${formatTime(event.start_time)}${event.end_time ? " – " + formatTime(event.end_time) : ""}`,
            eventLocation: event.location_name || "TBA",
            eventAddress: event.location_address || undefined,
            origin: emailOrigin,
          },
        }),
      });
    } catch (emailErr) {
      log("Confirmation email failed (non-fatal)", { error: String(emailErr) });
    }

    return new Response(
      JSON.stringify({ success: true, rsvp_id: rsvp?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CAPTURE-PUBLIC-RSVP] Internal error:", msg);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
