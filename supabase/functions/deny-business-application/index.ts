import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * deny-business-application
 * Handles both "denied" and "waitlisted" actions.
 * Payload: { application_id, action: "denied" | "waitlisted", reason: string }
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorization: super_admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authedUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: authedProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();
    if (!authedProfile || authedProfile.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    const { application_id, action, reason } = await req.json() as {
      application_id: string;
      action: "denied" | "waitlisted";
      reason?: string;
    };

    if (!application_id || !action) {
      return new Response(JSON.stringify({ error: "application_id and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load application
    const { data: app, error: appErr } = await supabase
      .from("business_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update application status
    await supabase
      .from("business_applications")
      .update({
        status: action,
        admin_notes: reason || null,
        reviewed_at: new Date().toISOString(),
        decision_email_sent_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    // Update profile application_status
    await supabase
      .from("profiles")
      .update({ application_status: action })
      .eq("email", app.email);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to: app.email,
        template: "business-application-decision",
        data: {
          firstName: (app.first_name || "there").trim(),
          action,
          reason: reason ?? undefined,
          checkoutEmail: app.email,
          origin: SITE_URL,
        },
      }),
    });

    return new Response(
      JSON.stringify({ success: true, action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("deny-business-application error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});