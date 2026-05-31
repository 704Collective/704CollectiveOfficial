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
      .select("id, title, start_time, end_time, location_name, location_address, required_tier, is_published")
      .eq("id", event_id)
      .maybeSingle();

    if (eventErr || !event) {
      log("Event not found", { event_id, error: eventErr?.message });
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event.required_tier !== "public") {
      log("Event is not public", { event_id, required_tier: event.required_tier });
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

    // Additive: mirror this RSVP into the new people + attendance_credentials schema.
    // Best-effort - must not break the event_public_rsvps RSVP saved above.
    let credentialToken: string | null = null;
    try {
      // Find or create the person by email_lower.
      let personId: string | null = null;
      const { data: existingPerson } = await supabase
        .from("people")
        .select("id, roles")
        .eq("email_lower", cleanEmail)
        .maybeSingle();

      if (existingPerson) {
        personId = existingPerson.id;
        const roles: string[] = existingPerson.roles ?? [];
        if (!roles.includes("guest")) {
          roles.push("guest");
          await supabase.from("people").update({ roles, updated_at: new Date().toISOString() }).eq("id", personId);
        }
      } else {
        const { data: newPerson, error: personErr } = await supabase
          .from("people")
          .insert({
            email: cleanEmail,
            email_lower: cleanEmail,
            full_name: fullName,
            phone: cleanPhone,
            roles: ["guest"],
            sms_consent: sms_consent === true,
            sms_consent_at: sms_consent === true ? new Date().toISOString() : null,
            metadata: { source: "capture_public_rsvp" },
          })
          .select("id")
          .single();
        if (personErr) {
          log("people insert failed (non-fatal)", { error: personErr.message });
        } else {
          personId = newPerson.id;
        }
      }

      if (personId) {
        // Check for an existing active credential for this person + event (idempotency).
        const { data: existingCred } = await supabase
          .from("attendance_credentials")
          .select("id, token")
          .eq("person_id", personId)
          .eq("event_id", event_id)
          .eq("status", "active")
          .maybeSingle();

        if (existingCred) {
          credentialToken = existingCred.token;
          log("public_rsvp credential already exists", { personId, eventId: event_id });
        } else {
          const tokenBytes = new Uint8Array(8);
          crypto.getRandomValues(tokenBytes);
          const token = "C-" + Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

          const { data: cred, error: credErr } = await supabase
            .from("attendance_credentials")
            .insert({
              token,
              person_id: personId,
              event_id,
              credential_type: "public_rsvp",
              status: "active",
              metadata: { source: "capture_public_rsvp" },
            })
            .select("token")
            .single();

          if (credErr) {
            // 23505 = unique violation (one_active_credential_per_person_per_event)
            if ((credErr as { code?: string }).code === "23505") {
              const { data: raceCred } = await supabase
                .from("attendance_credentials")
                .select("token")
                .eq("person_id", personId)
                .eq("event_id", event_id)
                .eq("status", "active")
                .maybeSingle();
              credentialToken = raceCred?.token ?? null;
            } else {
              log("credential insert failed (non-fatal)", { error: credErr.message });
            }
          } else {
            credentialToken = cred.token;
            log("public_rsvp credential issued", { personId, eventId: event_id, token });
          }
        }
      }
    } catch (syncErr) {
      log("new-schema sync threw (non-blocking)", {
        error: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

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
      JSON.stringify({ success: true, rsvp_id: rsvp?.id, credential_token: credentialToken }),
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
