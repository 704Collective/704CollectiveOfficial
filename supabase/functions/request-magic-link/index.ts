import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GENERIC_SUCCESS = {
  message: "If an account exists for this email you will receive a sign-in link shortly",
};

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const email = (body?.email ?? "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Rate limit check ─────────────────────────────────────────────────────
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: rateRow } = await adminClient
      .from("rate_limits")
      .select("id, attempts, window_start")
      .eq("identifier", `magic-link:${email}`)
      .gte("window_start", windowStart)
      .maybeSingle();

    if (rateRow && rateRow.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
      // Return generic success — don't reveal rate limiting to prevent enumeration
      return new Response(JSON.stringify(GENERIC_SUCCESS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert rate_limits row, incrementing attempts
    if (rateRow) {
      await adminClient
        .from("rate_limits")
        .update({ attempts: rateRow.attempts + 1, updated_at: new Date().toISOString() })
        .eq("id", rateRow.id);
    } else {
      await adminClient
        .from("rate_limits")
        .insert({
          identifier: `magic-link:${email}`,
          attempts: 1,
          window_start: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }

    // ── Check profile exists ─────────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();

    if (!profile) {
      // Return generic success — do not reveal whether account exists
      return new Response(JSON.stringify(GENERIC_SUCCESS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Send magic link via Supabase Auth REST (redirect uses dashboard Site / Redirect URLs) ───
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
      },
      body: JSON.stringify({
        email,
        create_user: false,
      }),
    });

    if (!authResponse.ok) {
      const err = await authResponse.json().catch(() => ({}));
      console.error("[REQUEST-MAGIC-LINK] Auth OTP error:", authResponse.status, err);
      return new Response(JSON.stringify(GENERIC_SUCCESS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(GENERIC_SUCCESS), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[REQUEST-MAGIC-LINK] Unhandled error:", err instanceof Error ? err.message : err);
    // Always return generic success to prevent enumeration
    return new Response(JSON.stringify(GENERIC_SUCCESS), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
