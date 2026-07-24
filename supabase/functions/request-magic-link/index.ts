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
    // rate_limits schema: (key text, count int, window_start timestamptz).
    // Select newest row for the key so duplicate rows never break the limiter.
    // Any DB error is logged and fails open (never throws, never blocks); when the
    // limit is hit we still return the generic 200 to preserve anti-enumeration.
    const now = new Date();
    const rlKey = `magic-link:${email}`;
    const windowMs = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

    const { data: rlRows, error: rlSelErr } = await adminClient
      .from("rate_limits")
      .select("id, count, window_start")
      .eq("key", rlKey)
      .order("window_start", { ascending: false })
      .limit(1);
    if (rlSelErr) {
      console.error("RATE_LIMIT_DB_ERROR [request-magic-link] select", rlSelErr);
    } else {
      const rlRow = rlRows && rlRows.length > 0 ? rlRows[0] : null;
      if (rlRow) {
        const withinWindow = now.getTime() - new Date(rlRow.window_start).getTime() < windowMs;
        if (withinWindow) {
          if (rlRow.count >= RATE_LIMIT_MAX_ATTEMPTS) {
            // Return generic success — don't reveal rate limiting to prevent enumeration
            return new Response(JSON.stringify(GENERIC_SUCCESS), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const { error: rlUpdErr } = await adminClient.from("rate_limits").update({ count: rlRow.count + 1 }).eq("id", rlRow.id);
          if (rlUpdErr) console.error("RATE_LIMIT_DB_ERROR [request-magic-link] update", rlUpdErr);
        } else {
          const { error: rlResetErr } = await adminClient.from("rate_limits").update({ count: 1, window_start: now.toISOString() }).eq("id", rlRow.id);
          if (rlResetErr) console.error("RATE_LIMIT_DB_ERROR [request-magic-link] reset", rlResetErr);
        }
      } else {
        const { error: rlInsErr } = await adminClient.from("rate_limits").insert({ key: rlKey, count: 1, window_start: now.toISOString() });
        if (rlInsErr) console.error("RATE_LIMIT_DB_ERROR [request-magic-link] insert", rlInsErr);
      }
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
