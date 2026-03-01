import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { firstName, lastName, email, origin: bodyOrigin } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return new Response(JSON.stringify({ error: "firstName, lastName, and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    log("Processing invite", { email: cleanEmail, fullName });

    // Check if user already exists
    const { data: existingProfiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", cleanEmail)
      .limit(1);

    let isNewUser = false;
    let userId: string;
    let setupLink: string | null = null;

    if (existingProfiles && existingProfiles.length > 0) {
      // Existing user
      userId = existingProfiles[0].id;

      // Check if already admin
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (existingRole) {
        return new Response(
          JSON.stringify({ error: `${existingProfiles[0].full_name || cleanEmail} is already an admin` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Assign admin role
      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (roleErr) throw new Error(roleErr.message);

      log("Admin role assigned to existing user", { userId });
    } else {
      // New user — create auth account
      isNewUser = true;
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const createResult = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createResult.error) throw new Error(createResult.error.message);
      userId = createResult.data.user.id;

      // Create / upsert profile
      const { error: profileErr } = await adminClient.from("profiles").upsert(
        {
          id: userId,
          email: cleanEmail,
          full_name: fullName,
          subscription_status: "inactive",
        },
        { onConflict: "id" },
      );
      if (profileErr) log("Profile upsert error", { error: profileErr.message });

      // Assign admin role
      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (roleErr) throw new Error(roleErr.message);

      // Generate password setup link
      if (!bodyOrigin) throw new Error("origin is required in the request body");
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
        options: { redirectTo: `${bodyOrigin}/setup-password` },
      });

      if (!linkErr && linkData?.properties?.action_link) {
        setupLink = linkData.properties.action_link;
      }

      log("New admin user created", { userId });
    }

    // Send admin invite email (non-blocking)
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
            name: firstName.trim(),
            setupLink,
            loginUrl: `${bodyOrigin}/admin`,
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
