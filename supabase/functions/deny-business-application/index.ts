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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
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

    // Build email content
    const isDenied = action === "denied";
    const subject = isDenied
      ? "Your 704 Business application"
      : "You've been added to our waitlist — 704 Business";

    const reasonSection = reason
      ? `<p style="color:#2E2E2E;line-height:1.7;"><strong>Note from our team:</strong> ${reason}</p>`
      : "";

    const html = isDenied
      ? `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#FAF6F0;">
          <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
          <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${app.first_name},</h2>
          <p style="color:#2E2E2E;line-height:1.7;">
            Thank you for applying to 704 Business. After reviewing your application, we've decided not to move forward at this time.
          </p>
          ${reasonSection}
          <p style="color:#2E2E2E;line-height:1.7;">
            We appreciate your interest in the Charlotte community. If you'd like to stay connected, 
            you're welcome to join as a Social member — access to all social events, wellness days, and the broader 704 Collective community.
          </p>
          <a href="${SITE_URL}/join/checkout?email=${encodeURIComponent(app.email)}"
             style="display:inline-block;margin-top:24px;padding:14px 32px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:700;">
            Join Social — $30/mo
          </a>
          <p style="color:#999;font-size:12px;margin-top:48px;">
            Questions? Reply to this email.<br/>
            704 Collective · Charlotte, NC
          </p>
        </div>
      `
      : `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#FAF6F0;">
          <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
          <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${app.first_name},</h2>
          <p style="color:#2E2E2E;line-height:1.7;">
            Thank you for applying to 704 Business. We've reviewed your application and added you to our waitlist. 
            We'll reach out as soon as a spot opens up.
          </p>
          ${reasonSection}
          <p style="color:#2E2E2E;line-height:1.7;">
            In the meantime, you're welcome to join as a Social member and get plugged into the community while you wait.
          </p>
          <a href="${SITE_URL}/join/checkout?email=${encodeURIComponent(app.email)}"
             style="display:inline-block;margin-top:24px;padding:14px 32px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:700;">
            Join Social — $30/mo
          </a>
          <p style="color:#999;font-size:12px;margin-top:48px;">
            Questions? Reply to this email.<br/>
            704 Collective · Charlotte, NC
          </p>
        </div>
      `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "704 Collective <no-reply@704collective.com>",
        to: `${app.first_name} ${app.last_name} <${app.email}>`,
        subject,
        html,
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