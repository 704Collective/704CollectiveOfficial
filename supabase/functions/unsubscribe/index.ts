import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[UNSUBSCRIBE] ${step}${d}`);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the recipient email from either a token (base64 "email:campaign_id",
// the real campaign link format) or a plain email param (bare/legacy links).
function resolveEmail(token: string | null | undefined, email: string | null | undefined): string {
  if (token) {
    try {
      const decoded = atob(token);
      const fromToken = decoded.split(":")[0]?.trim().toLowerCase() ?? "";
      if (EMAIL_REGEX.test(fromToken)) return fromToken;
    } catch (_e) {
      // malformed token: fall through to email param
    }
  }
  if (email) {
    const clean = email.trim().toLowerCase();
    if (EMAIL_REGEX.test(clean)) return clean;
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, email, resubscribe } = body as {
      token?: string;
      email?: string;
      resubscribe?: boolean;
    };

    const resolvedEmail = resolveEmail(token, email);
    if (!resolvedEmail) {
      log("no valid email resolved");
      return new Response(JSON.stringify({ error: "No valid email address provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const unsub = resubscribe !== true; // default action is unsubscribe

    log(unsub ? "unsubscribing" : "resubscribing", { email: resolvedEmail });

    // Write both tables so every send path honors it. Service-role bypasses RLS.
    // A zero-row update (person not in that table) is not an error.
    const profileRes = await supabase
      .from("profiles")
      .update({ marketing_unsubscribed: unsub })
      .eq("email", resolvedEmail);

    const contactRes = await supabase
      .from("contacts")
      .update({
        unsubscribed: unsub,
        unsubscribed_at: unsub ? new Date().toISOString() : null,
      })
      .eq("email", resolvedEmail);

    if (profileRes.error && contactRes.error) {
      log("both updates failed", {
        profile: profileRes.error.message,
        contact: contactRes.error.message,
      });
      return new Response(JSON.stringify({ error: "Failed to update preferences" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profileRes.error) log("profiles update error (continuing)", profileRes.error.message);
    if (contactRes.error) log("contacts update error (continuing)", contactRes.error.message);

    return new Response(JSON.stringify({ ok: true, action: unsub ? "unsubscribed" : "resubscribed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("error", String(err));
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
