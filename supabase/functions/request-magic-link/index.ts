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

// ── Brand constants ──────────────────────────────────────────────────────────
const BRAND = {
  color: "#1A1A1A",
  surface: "#2E2E2E",
  accent: "#C6A664",
  accentText: "#1A1A1A",
  text: "#FAF6F0",
  textSecondary: "#D8D8D8",
  textMuted: "#A0A0A0",
  border: "rgba(255,255,255,0.10)",
  logoUrl: "https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png",
  fontStack: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function baseLayout(content: string, siteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.color};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<a href="${siteUrl}" target="_blank" style="text-decoration:none;border:none;">
<img src="${BRAND.logoUrl}" alt="704 Collective" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
</a>
</td></tr>
<tr><td style="padding:32px 40px;">
${content}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function magicLinkTemplate(magicLink: string, siteUrl: string): { subject: string; html: string } {
  return {
    subject: "Your 704 Collective sign-in link",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Sign in to 704 Collective</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Click below to sign in to your account. No password needed.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${magicLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">Sign In to 704 Collective</a>
</td></tr>
</table>
<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in <strong>1 hour</strong> and can only be used once.</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you didn't request this link, you can safely ignore this email. Your account is secure.</p>
`, siteUrl),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://704collective.com";

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

    // ── Generate magic link ───────────────────────────────────────────────────
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?source=magic`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[REQUEST-MAGIC-LINK] Failed to generate link:", linkError?.message);
      // Return generic success — don't reveal internal errors
      return new Response(JSON.stringify(GENERIC_SUCCESS), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const magicLink = linkData.properties.action_link;

    // ── Send email via Resend ─────────────────────────────────────────────────
    const { subject, html } = magicLinkTemplate(magicLink, siteUrl);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "704 Collective <no-reply@704collective.com>",
        to: [email],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}));
      console.error("[REQUEST-MAGIC-LINK] Resend error:", resendErr);
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
