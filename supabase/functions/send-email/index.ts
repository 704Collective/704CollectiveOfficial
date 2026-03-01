import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-EMAIL] ${step}${d}`);
};

// ── email templates ──────────────────────────────────────────────────────

// ── Brand constants ──────────────────────────────────────────────────────
const BRAND = {
  color: "#1A1A1A",       // Charcoal background
  surface: "#2E2E2E",     // Graphite card surface
  accent: "#D4A853",      // Gold/amber CTA
  accentText: "#1A1A1A",  // Dark text on gold buttons
  text: "#FAF6F0",        // Ivory primary text
  textSecondary: "#D8D8D8", // Silver secondary text
  textMuted: "#A0A0A0",   // Grey metadata
  border: "rgba(255,255,255,0.10)",
  logoUrl: "https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png",
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function baseLayout(content: string, origin?: string): string {
  const homeUrl = origin || "#";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.color};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<!-- Header with Logo -->
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<a href="${homeUrl}" target="_blank" style="text-decoration:none;border:none;">
<img src="${BRAND.logoUrl}" alt="704 Collective" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
</a>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px 40px;">
${content}
</td></tr>
<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">${text}</a>
</td></tr>
</table>`;
}

function welcomeTemplate(data: { name: string; calendarUrl: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin;
  if (!base) throw new Error("[welcome] origin is required but was not provided. Ensure the calling function passes origin in the email data payload.");
  return {
    subject: "Welcome to 704 Collective! 🎉",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective — Charlotte's community for young professionals. Your membership is active and you're officially part of the crew.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Get started:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">
<span style="color:${BRAND.accent};font-weight:600;">1.</span>&nbsp;
<a href="${base}/events" style="color:${BRAND.accent};text-decoration:underline;">RSVP to an upcoming event</a>
</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">
<span style="color:${BRAND.accent};font-weight:600;">2.</span>&nbsp;
<a href="${data.calendarUrl}" style="color:${BRAND.accent};text-decoration:underline;">Subscribe to the event calendar</a>
</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">
<span style="color:${BRAND.accent};font-weight:600;">3.</span>&nbsp;
<a href="${base}/settings" style="color:${BRAND.accent};text-decoration:underline;">Set up your profile</a>
</td></tr>
</table>
${ctaButton("View Your Dashboard", `${base}/dashboard`)}
`, base),
  };
}

function passwordSetupTemplate(data: { name: string; setupLink: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: "Set up your 704 Collective account",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Collective membership has been set up. Click the button below to create your password and access your account.</p>
${ctaButton("Set Your Password", data.setupLink)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If it's expired, you can request a new one instantly from the setup page.</p>
`, data.origin),
  };
}

function rsvpConfirmationTemplate(data: {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: `You're in! ${data.eventName}`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're confirmed for <strong>${data.eventName}</strong>!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📅&nbsp;&nbsp;${data.eventDate}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">⏰&nbsp;&nbsp;${data.eventTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📍&nbsp;&nbsp;${data.eventLocation}</td></tr>
</table>
</td></tr>
</table>
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Need to cancel? You can update your RSVP on the event page.</p>
`, data.origin),
  };
}

function guestPassTemplate(data: {
  guestName: string;
  memberName: string;
  eventName?: string | null;
  eventDate?: string | null;
  eventTime?: string | null;
  eventLocation?: string | null;
  passCode: string;
  expiresDate: string;
  origin?: string;
}): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.passCode)}`;

  let eventBlock = `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Use this pass at any upcoming 704 Collective event this month.</p>`;
  if (data.eventName) {
    eventBlock = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're invited to:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 8px;font-size:17px;font-weight:600;color:${BRAND.text};">${data.eventName}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${data.eventDate ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📅&nbsp;&nbsp;${data.eventDate}</td></tr>` : ""}
${data.eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">⏰&nbsp;&nbsp;${data.eventTime}</td></tr>` : ""}
${data.eventLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📍&nbsp;&nbsp;${data.eventLocation}</td></tr>` : ""}
</table>
</td></tr>
</table>`;
  }

  return {
    subject: `${data.memberName} invited you to 704 Collective!`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};"><strong>${data.memberName}</strong> invited you to check out 704 Collective — Charlotte's community for young professionals!</p>
${eventBlock}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
<tr><td align="center" style="padding:24px 0;">
<img src="${qrUrl}" alt="Guest Pass QR Code" width="200" height="200" style="display:block;border-radius:8px;" />
</td></tr>
<tr><td align="center">
<p style="margin:0;font-size:18px;font-weight:600;color:${BRAND.text};letter-spacing:2px;">${data.passCode}</p>
<p style="margin:8px 0 0;font-size:13px;color:${BRAND.textMuted};">Show this QR code or pass code at check-in</p>
</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This pass expires ${data.expiresDate}. Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, data.origin),
  };
}

function guestFollowupTemplate(data: {
  guestName: string;
  memberName: string;
  eventName: string;
  origin?: string;
}): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const base = data.origin || "#";
  return {
    subject: `Thanks for joining us at ${data.eventName}!`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong> with us! We hope you had a great time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You were invited by <strong>${data.memberName}</strong> — shout out to them for bringing you along.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Loved it? Join 704 Collective and get free access to all our events, plus a community of young professionals in Charlotte.</p>
${ctaButton("Become a Member", `${base}/join`)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, base),
  };
}

function adminInviteTemplate(data: { name: string; setupLink?: string | null; loginUrl?: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const hasSetupLink = !!data.setupLink;
  const base = data.origin || data.loginUrl;

  if (hasSetupLink) {
    return {
      subject: "You've been invited as an admin on 704 Collective",
      html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been invited as an admin for 704 Collective. Set up your account to access the admin dashboard where you can manage events, members, and more.</p>
${ctaButton("Set Up Your Account", data.setupLink!)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Once you've set your password, you can access the admin dashboard at any time.</p>
`, base),
    };
  }

  if (!data.loginUrl) throw new Error("[admin-invite] loginUrl is required but was not provided. Check that the frontend passes origin in the request body.");
  const dashboardUrl = data.loginUrl;
  return {
    subject: "You've been made an admin on 704 Collective",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been given admin access to 704 Collective. You can now manage events, members, and more from the admin dashboard.</p>
${ctaButton("Go to Admin Dashboard", dashboardUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Just log in with your existing account and you'll see the admin panel.</p>
`, base),
  };
}

// ── template router ──────────────────────────────────────────────────────

function getTemplate(template: string, data: Record<string, unknown>): { subject: string; html: string } {
  switch (template) {
    case "welcome":
      return welcomeTemplate(data as { name: string; calendarUrl: string; origin?: string });
    case "password-setup":
      return passwordSetupTemplate(data as { name: string; setupLink: string });
    case "rsvp-confirmation":
      return rsvpConfirmationTemplate(data as {
        name: string;
        eventName: string;
        eventDate: string;
        eventTime: string;
        eventLocation: string;
        eventUrl: string;
      });
    case "guest-followup":
      return guestFollowupTemplate(data as {
        guestName: string; memberName: string; eventName: string; origin?: string;
      });
    case "admin-invite":
      return adminInviteTemplate(data as { name: string; setupLink?: string | null; loginUrl?: string });
    case "guest-pass":
      return guestPassTemplate(data as {
        guestName: string; memberName: string; eventName?: string | null;
        eventDate?: string | null; eventTime?: string | null; eventLocation?: string | null;
        passCode: string; expiresDate: string;
      });
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ── main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ── Auth check ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (token !== serviceRoleKey) {
      // Not the service role key — validate as user JWT
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { error } = await supabase.auth.getClaims(token);
      if (error) {
        log("Auth failed", { error: error.message });
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Parse body ──
    const { to, template, data } = await req.json();

    if (!to || !template) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'template'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Sending email", { to, template });

    const { subject, html } = getTemplate(template, data || {});

    // ── Send via Resend ──
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "704 Collective <hello@704collective.com>",
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      log("Resend API error", { status: resendRes.status, body: resendData });
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Email sent", { messageId: resendData.id });

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[SEND-EMAIL] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Failed to send email" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
