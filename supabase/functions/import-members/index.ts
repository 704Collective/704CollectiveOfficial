import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[IMPORT-MEMBERS] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Auth check — admin only
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const userId = claimsData.claims.sub as string;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const { members, sendEmails, membershipTier, origin: bodyOrigin } = await req.json();

    if (!members || !Array.isArray(members) || members.length === 0) {
      return new Response(JSON.stringify({ error: "No members provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Starting import", { count: members.length, sendEmails, membershipTier });

    const results: Array<{
      email: string;
      name: string;
      status: "created" | "already_exists" | "failed";
      error?: string;
    }> = [];

    const BATCH_SIZE = 5;

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);

      for (const member of batch) {
        const email = member.email?.trim()?.toLowerCase();
        const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim();

        if (!email) {
          results.push({ email: email || "", name: fullName, status: "failed", error: "Missing email" });
          continue;
        }

        try {
          // Check if user already exists
          const { data: existingProfiles } = await adminClient
            .from("profiles")
            .select("id")
            .eq("email", email)
            .limit(1);

          if (existingProfiles && existingProfiles.length > 0) {
            results.push({ email, name: fullName, status: "already_exists" });
            continue;
          }

          // Create auth user
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const createResult = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });

          if (createResult.error) {
            if (createResult.error.message?.includes("already been registered")) {
              results.push({ email, name: fullName, status: "already_exists" });
              continue;
            }
            throw new Error(createResult.error.message);
          }

          const newUserId = createResult.data.user.id;

          // Create profile
          const profileData: Record<string, unknown> = {
            id: newUserId,
            email,
            full_name: fullName,
            subscription_status: "active",
            member_type: membershipTier || "social",
            membership_override: true,
            member_since: new Date().toISOString(),
            imported_at: new Date().toISOString(),
          };

          if (member.stripe_customer_id) {
            profileData.stripe_customer_id = member.stripe_customer_id;
          }

          const { error: profileErr } = await adminClient.from("profiles").upsert(profileData, { onConflict: "id" });

          if (profileErr) {
            log("Profile upsert error", { email, error: profileErr.message });
          }

          // Add member role
          await adminClient
            .from("user_roles")
            .upsert({ user_id: newUserId, role: "member" }, { onConflict: "user_id,role" });

          // Send password setup email if enabled
          if (sendEmails) {
            try {
              const redirectBase = bodyOrigin || req.headers.get("origin") || "https://704collective.com";
              const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
                type: "recovery",
                email,
                options: { redirectTo: `${redirectBase}/setup-password` },
              });

              if (!linkErr && linkData?.properties?.action_link) {
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({
                    to: email,
                    template: "password-setup",
                    data: {
                      name: member.first_name || fullName,
                      setupLink: linkData.properties.action_link,
                    },
                  }),
                });
              }
            } catch (emailErr) {
              log("Email send failed (non-blocking)", { email, error: String(emailErr) });
            }
          }

          results.push({ email, name: fullName, status: "created" });
          log("Member created", { email });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ email, name: fullName, status: "failed", error: msg });
          log("Member failed", { email, error: msg });
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < members.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const summary = {
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "already_exists").length,
      failed: results.filter((r) => r.status === "failed").length,
    };

    log("Import complete", summary);

    return new Response(JSON.stringify({ results, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[IMPORT-MEMBERS] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
