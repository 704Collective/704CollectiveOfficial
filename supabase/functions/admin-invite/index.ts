import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-INVITE] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Debug: log all incoming headers to diagnose auth issues
    console.log("[ADMIN-INVITE] incoming headers:", Object.fromEntries(req.headers.entries()));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    // Shared-secret auth — called only from our own server-side API route
    const secret = req.headers.get("x-admin-secret");
    if (!secret || secret !== serviceRoleKey) {
      log("Unauthorized — bad or missing x-admin-secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, origin } = await req.json();

    if (!email?.trim()) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    log("Processing invite", { email: cleanEmail });

    // Check if user already exists in profiles
    const { data: existingProfiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("email", cleanEmail)
      .limit(1);

    let isNewUser = false;
    let userId: string;
    let setupLink: string | null = null;
    const resolvedOrigin = origin ?? siteUrl;

    if (existingProfiles && existingProfiles.length > 0) {
      // Existing user — just elevate their role
      userId = existingProfiles[0].id;
      const existingRole = existingProfiles[0].role;

      if (existingRole === "admin" || existingRole === "super_admin") {
        return new Response(
          JSON.stringify({ error: `${existingProfiles[0].full_name || cleanEmail} is already an admin` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: roleErr } = await adminClient
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", userId);
      if (roleErr) throw new Error(roleErr.message);

      log("Admin role assigned to existing user", { userId });
    } else {
      // New user — create auth account and send setup link
      isNewUser = true;
      const displayName = full_name?.trim() || cleanEmail;

      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          data: { full_name: displayName },
          redirectTo: `${resolvedOrigin}/setup-password`,
        },
      );

      if (inviteErr) throw new Error(inviteErr.message);
      userId = inviteData.user.id;

      // Upsert profile
      await adminClient.from("profiles").upsert(
        {
          id: userId,
          email: cleanEmail,
          full_name: displayName,
          role: "admin",
          subscription_status: "inactive",
        },
        { onConflict: "id" },
      );

      // Also generate a recovery link to include in our branded email
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
        options: { redirectTo: `${resolvedOrigin}/setup-password` },
      });
      if (linkData?.properties?.action_link) {
        setupLink = linkData.properties.action_link;
      }

      log("New admin user created via inviteUserByEmail", { userId });
    }

    // Send branded invite email (non-blocking)
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: cleanEmail,
          template: "admin-invite",
          data: {
            name: full_name?.trim() || cleanEmail,
            setupLink,
            loginUrl: `${resolvedOrigin}/admin`,
          },
        }),
      });
      log("Admin invite email sent", { email: cleanEmail });
    } catch (emailErr) {
      log("Email send failed (non-blocking)", { error: String(emailErr) });
    }

    return new Response(
      JSON.stringify({ success: true, isNewUser }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ADMIN-INVITE] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});