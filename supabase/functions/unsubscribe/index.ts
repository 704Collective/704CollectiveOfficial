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

    // One writer for the one flag (Wave 6C): set_marketing_optout sets
    // people.marketing_unsubscribed - minting an unknown email as a prospect so
    // the preference is never lost - and keeps the legacy profiles/contacts
    // columns in step for readers not yet moved. service_role execute only.
    const { data: result, error: rpcError } = await supabase.rpc("set_marketing_optout", {
      p_email: resolvedEmail,
      p_unsubscribe: unsub,
      p_source: "unsubscribe_link",
    });

    const outcome = result as { ok?: boolean; error?: string; action?: string; minted?: boolean } | null;
    if (rpcError || !outcome?.ok) {
      log("set_marketing_optout failed", { error: rpcError?.message ?? outcome?.error ?? "unknown" });
      return new Response(JSON.stringify({ error: "Failed to update preferences" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("preference recorded", { email: resolvedEmail, action: outcome.action, minted: outcome.minted === true });

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
