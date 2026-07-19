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
      .select("id, full_name, email, subscription_status, membership_override, role")
      .eq("id", inviterUserId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Super admins can issue guest passes regardless of their own membership,
    // the event's guest-pass flag, capacity, or the monthly cap.
    const isSuperAdmin = profile.role === "super_admin";

    const isActiveMember =
      profile.subscription_status === "active" || profile.membership_override === true;

    if (!isActiveMember && !isSuperAdmin) {
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

    // Monthly guest-pass cap: 1 per member per calendar month.
    // Resolve the inviter's person row, then count guest_pass credentials this month.
    const { data: inviterPerson } = await adminClient
      .from("people")
      .select("id")
      .filter("metadata->>profile_id", "eq", inviterUserId)
      .maybeSingle();

    if (!isSuperAdmin && inviterPerson) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const { count: passesThisMonth } = await adminClient
        .from("attendance_credentials")
        .select("id", { count: "exact", head: true })
        .eq("issued_by_person_id", inviterPerson.id)
        .eq("credential_type", "guest_pass")
        .in("status", ["active", "used"])
        .gte("created_at", monthStart.toISOString());

      if ((passesThisMonth ?? 0) >= 1) {
        return new Response(
          JSON.stringify({ error: "You have already used your guest pass for this month." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // If inviterPerson is null, the member predates the people backfill - allow the pass
    // (the additive block below will still create their person row).

    // ── Fetch event details ───────────────────────────────────────────────────
    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("id, title, start_time, end_time, location_name, location_address, allows_guest_passes, capacity")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Guest passes must be enabled for this event ─────────────────────────
    if (!isSuperAdmin && event.allows_guest_passes === false) {
      return new Response(
        JSON.stringify({ error: "This event doesn't allow guest passes." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Capacity guard (mirrors create-member-rsvp: attendance_credentials active|used)
    if (!isSuperAdmin && event.capacity != null) {
      const { count: capCount, error: capErr } = await adminClient
        .from("attendance_credentials")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event_id)
        .in("status", ["active", "used"]);
      if (capErr) {
        return new Response(JSON.stringify({ error: "Could not verify capacity" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof capCount === "number" && capCount >= event.capacity) {
        return new Response(JSON.stringify({ error: "Event is at capacity" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Generate unique guest_pass_code ───────────────────────────────────────
    const guestPassCode = crypto.randomUUID();
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(guestPassCode)}`;

    // ── Insert ticket (counts toward event attendee numbers) ──────────────────
    const ticketMetadata: Record<string, unknown> = {
      inviter_user_id: inviterUserId,
      guest_pass_code: guestPassCode,
      personal_message: personal_message || null,
    };
    if (isSuperAdmin) {
      ticketMetadata.issued_via_admin_override = true;
      ticketMetadata.admin_override = "true";
    }

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

    // Additive: mirror this guest pass into people + attendance_credentials.
    // Best-effort - must not break the tickets-based guest pass created above.
    try {
      // Resolve the inviter's person id (may already be fetched above as inviterPerson).
      let inviterPersonId: string | null = null;
      {
        const { data: ip } = await adminClient
          .from("people")
          .select("id")
          .filter("metadata->>profile_id", "eq", inviterUserId)
          .maybeSingle();
        inviterPersonId = ip?.id ?? null;
      }

      // Find or create the GUEST's person row by email_lower.
      let guestPersonId: string | null = null;
      const { data: existingGuest } = await adminClient
        .from("people")
        .select("id, roles")
        .eq("email_lower", guestEmailLower)
        .maybeSingle();

      if (existingGuest) {
        guestPersonId = existingGuest.id;
        const roles: string[] = existingGuest.roles ?? [];
        if (!roles.includes("guest")) {
          roles.push("guest");
          await adminClient.from("people").update({ roles, updated_at: new Date().toISOString() }).eq("id", guestPersonId);
        }
      } else {
        const { data: newGuest, error: guestErr } = await adminClient
          .from("people")
          .insert({
            email: guestEmailLower,
            full_name: guestName,
            roles: ["guest"],
            metadata: { source: "create_guest_pass" },
          })
          .select("id")
          .single();
        if (guestErr) {
          log("guest person insert failed (non-fatal)", { error: guestErr.message });
        } else {
          guestPersonId = newGuest.id;
        }
      }

      if (guestPersonId) {
        // Idempotency: existing active credential for this guest + event?
        const { data: existingCred } = await adminClient
          .from("attendance_credentials")
          .select("id")
          .eq("person_id", guestPersonId)
          .eq("event_id", event_id)
          .eq("status", "active")
          .maybeSingle();

        if (!existingCred) {
          const tokenBytes = new Uint8Array(8);
          crypto.getRandomValues(tokenBytes);
          const credToken = "C-" + Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

          const { error: credErr } = await adminClient
            .from("attendance_credentials")
            .insert({
              token: credToken,
              person_id: guestPersonId,
              event_id,
              credential_type: "guest_pass",
              status: "active",
              issued_by_person_id: inviterPersonId,
              metadata: {
                source: "create_guest_pass",
                guest_pass_code: guestPassCode,
                ...(isSuperAdmin ? { admin_override: "true" } : {}),
              },
            });
          if (credErr) {
            if ((credErr as { code?: string }).code === "23505") {
              log("guest_pass credential already present (unique guard)", { guestPersonId, event_id });
            } else {
              log("guest_pass credential insert failed (non-fatal)", { error: credErr.message });
            }
          } else {
            log("guest_pass credential issued", { guestPersonId, event_id, token: credToken });
          }
        }
      }
    } catch (syncErr) {
      log("new-schema sync threw (non-blocking)", {
        error: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

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
