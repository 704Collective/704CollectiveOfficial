import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generatePassCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GP-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getEndOfMonth(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return end.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Use service role for DB operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify active membership
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, subscription_status, membership_override, calendar_token")
      .eq("id", userId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isActiveMember =
      profile.subscription_status === "active" || profile.membership_override === true;

    if (!isActiveMember) {
      return new Response(JSON.stringify({ error: "Active membership required to send guest passes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const { guest_name, guest_email, guest_phone, event_id } = await req.json();

    if (!guest_name || !guest_email) {
      return new Response(JSON.stringify({ error: "Guest name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check monthly limit
    const monthYear = getCurrentMonthYear();
    const { count, error: countError } = await adminClient
      .from("guest_passes")
      .select("id", { count: "exact", head: true })
      .eq("member_id", userId)
      .eq("month_year", monthYear)
      .neq("status", "cancelled");

    if (countError) {
      console.error("Count error:", countError);
      return new Response(JSON.stringify({ error: "Failed to check pass limit" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((count ?? 0) >= 1) {
      return new Response(
        JSON.stringify({ error: "You've already used your guest pass this month" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate unique QR code
    const qrCode = generatePassCode();

    // Calculate expiry
    let expiresAt = getEndOfMonth();
    let eventName: string | null = null;
    let eventDate: string | null = null;
    let eventTime: string | null = null;
    let eventLocation: string | null = null;

    if (event_id) {
      const { data: event } = await adminClient
        .from("events")
        .select("title, start_time, end_time, location_name, location_address")
        .eq("id", event_id)
        .single();

      if (event) {
        // Expire 24h after event start
        const eventStart = new Date(event.start_time);
        expiresAt = new Date(eventStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
        eventName = event.title;

        // Format date/time
        const startDate = new Date(event.start_time);
        eventDate = startDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        eventTime = startDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        if (event.end_time) {
          const endDate = new Date(event.end_time);
          eventTime += ` - ${endDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}`;
        }
        eventLocation = [event.location_name, event.location_address].filter(Boolean).join(", ");
      }
    }

    // Insert guest pass
    const { data: pass, error: insertError } = await adminClient
      .from("guest_passes")
      .insert({
        member_id: userId,
        guest_name,
        guest_email,
        guest_phone: guest_phone || null,
        event_id: event_id || null,
        qr_code: qrCode,
        status: "pending",
        expires_at: expiresAt,
        month_year: monthYear,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create guest pass" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via send-email function
    const expiresDate = new Date(expiresAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const emailPayload = {
      to: guest_email,
      template: "guest-pass",
      data: {
        guestName: guest_name,
        memberName: profile.full_name || "A member",
        eventName,
        eventDate,
        eventTime,
        eventLocation,
        passCode: qrCode,
        expiresDate,
      },
    };

    try {
      const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(emailPayload),
      });

      if (!emailRes.ok) {
        console.error("Email send failed:", await emailRes.text());
      }
    } catch (emailErr) {
      console.error("Email error:", emailErr);
      // Don't fail the pass creation if email fails
    }

    return new Response(JSON.stringify({ success: true, pass }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-GUEST-PASS] Error:", msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
