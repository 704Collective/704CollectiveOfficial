import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-GUEST-PASS] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");

    // Validate user JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviterUserId = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Verify active membership ──────────────────────────────────────────────
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, subscription_status, membership_override")
      .eq("id", inviterUserId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isActiveMember =
      profile.subscription_status === "active" || profile.membership_override === true;

    if (!isActiveMember) {
      return new Response(JSON.stringify({ error: "Active membership required to send guest passes" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const { guest_first_name, guest_last_name, guest_email, event_id, personal_message } =
      await req.json();

    if (!guest_first_name || !guest_last_name || !guest_email || !event_id) {
      return new Response(JSON.stringify({ error: "guest_first_name, guest_last_name, guest_email, and event_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guestName = `${guest_first_name.trim()} ${guest_last_name.trim()}`;
    const guestEmailLower = guest_email.trim().toLowerCase();

    // ── Fetch event details ───────────────────────────────────────────────────
    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("id, title, start_time, end_time, location_name, location_address")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Generate unique guest_pass_code ───────────────────────────────────────
    const guestPassCode = crypto.randomUUID();
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(guestPassCode)}`;

    // ── Insert ticket (counts toward event attendee numbers) ──────────────────
    const ticketMetadata = {
      inviter_user_id: inviterUserId,
      guest_pass_code: guestPassCode,
      personal_message: personal_message || null,
    };

    const { data: ticket, error: ticketError } = await adminClient
      .from("tickets")
      .insert({
        user_id: null,
        event_id,
        ticket_type: "guest_pass",
        status: "confirmed",
        guest_email: guestEmailLower,
        guest_name: guestName,
        source: "guest_pass",
        metadata: ticketMetadata,
      })
      .select("id")
      .single();

    if (ticketError) {
      log("Ticket insert error", ticketError.message);
      return new Response(JSON.stringify({ error: "Failed to create guest pass ticket" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Ticket created", { ticketId: ticket.id, guestPassCode });

    // ── Upsert contact ────────────────────────────────────────────────────────
    let contactId: string | null = null;
    try {
      const { data: contact, error: contactError } = await adminClient
        .from("contacts")
        .upsert(
          {
            email: guestEmailLower,
            full_name: guestName,
            source: "guest_pass",
            source_detail: "invited_by_member",
            status: "active",
            metadata: {
              inviter_user_id: inviterUserId,
              invited_to_event_id: event_id,
              guest_pass_code: guestPassCode,
            },
          },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (!contactError && contact) {
        contactId = contact.id;
        log("Contact upserted", { contactId });

        // ── Tag the contact ───────────────────────────────────────────────────
        try {
          await adminClient.from("contact_tags").upsert(
            [
              { contact_id: contactId, tag: "guest" },
              { contact_id: contactId, tag: "guest_pass_invitee" },
            ],
            { onConflict: "contact_id,tag", ignoreDuplicates: true }
          );
        } catch (tagErr) {
          log("Tag insert skipped (non-critical)", String(tagErr));
        }
      } else {
        log("Contact upsert skipped (non-critical)", contactError?.message);
      }
    } catch (contactErr) {
      log("Contact upsert skipped (non-critical)", String(contactErr));
    }

    // ── Insert guest_pass_events tracking row ─────────────────────────────────
    try {
      await adminClient.from("guest_pass_events").insert({
        guest_pass_code: guestPassCode,
        contact_id: contactId,
        event_id,
        inviter_user_id: inviterUserId,
      });
      log("guest_pass_events row inserted");
    } catch (gpeErr) {
      log("guest_pass_events insert skipped (non-critical)", String(gpeErr));
    }

    // ── Format event date/time for email ──────────────────────────────────────
    const startDate = new Date(event.start_time);
    const eventDate = startDate.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    let eventTime = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (event.end_time) {
      const endDate = new Date(event.end_time);
      eventTime += ` – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    const eventLocation = [event.location_name, event.location_address].filter(Boolean).join(", ") || "TBA";
    const origin = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://704collective.com";

    // ── Send branded email via send-email function ────────────────────────────
    try {
      const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: guestEmailLower,
          template: "guest-pass",
          data: {
            guestName,
            eventTitle: event.title,
            eventDate,
            eventTime,
            eventLocation,
            inviterName: profile.full_name || "A member",
            personalMessage: personal_message || null,
            qrCodeUrl,
            guestPassCode,
            origin,
          },
        }),
      });

      if (!emailRes.ok) {
        log("Email send failed", await emailRes.text());
      } else {
        log("Email sent to guest", { email: guestEmailLower });
      }
    } catch (emailErr) {
      log("Email error (non-critical)", String(emailErr));
    }

    return new Response(
      JSON.stringify({ success: true, ticketId: ticket.id, guestPassCode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-GUEST-PASS] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
