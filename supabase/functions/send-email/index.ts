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
  accent: "#C6A664",      // Gold CTA (704 brand)
  accentText: "#1A1A1A",  // Dark text on gold buttons
  text: "#FAF6F0",        // Ivory primary text
  textSecondary: "#D8D8D8", // Silver secondary text
  textMuted: "#A0A0A0",   // Grey metadata
  border: "rgba(255,255,255,0.10)",
  logoUrl: "https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704-logo.png",
  fontStack:
    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToPlainText(html: string): string {
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "704 Collective notification";
}

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

function welcomeBackTemplate(data: { name: string; calendarUrl: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin;
  if (!base) throw new Error("[welcome-back] origin is required but was not provided. Ensure the calling function passes origin in the email data payload.");
  return {
    subject: "You're back - welcome home",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome back. We kept the lights on for you.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">A few things to get you rolling again:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> <a href="${base}/events" style="color:${BRAND.accent};text-decoration:underline;">Check out what's coming up and RSVP</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Subscribe to the calendar so you never miss one</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Make sure your profile is up to date</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Good to have you back in the room.</p>
${ctaButton("See Upcoming Events", `${base}/events`)}
`, base),
  };
}

function welcomeNewTemplate(data: { name: string; calendarUrl: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin;
  if (!base) throw new Error("[welcome-new] origin is required but was not provided. Ensure the calling function passes origin in the email data payload.");
  return {
    subject: "You're in. Welcome to 704 Collective.",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective. You just joined a room full of people who are actually worth knowing in Charlotte.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Here's what to do next:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${base}/events" style="color:${BRAND.accent};text-decoration:underline;">Browse upcoming events and grab your spot</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${data.calendarUrl}" style="color:${BRAND.accent};text-decoration:underline;">Subscribe to the member calendar</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${base}/settings" style="color:${BRAND.accent};text-decoration:underline;">Fill out your profile so people know who you are</a></td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">If you need anything, reply to this email. A real person reads it.</p>
${ctaButton("See Upcoming Events", `${base}/events`)}
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">704 Collective</p>
`, base),
  };
}

function passwordSetupTemplate(data: { name: string; setupLink: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: "Set up your 704 Collective account",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Collective account is ready - you just need to set a password.</p>
${ctaButton("Set Up Your Account", data.setupLink)}
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Once you're in, you can RSVP to events, access your membership QR code, and connect with other members.</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Just reply here.</p>
`, data.origin),
  };
}

function toGCalTime(iso: string): string {
  // Format: YYYYMMDDTHHmmssZ (UTC)
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function rsvpConfirmationTemplate(data: {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventUrl: string;
  qrData?: string;
  origin?: string;
  // Optional fields for calendar buttons
  startTimeIso?: string;
  endTimeIso?: string;
  calendarToken?: string;
}): { subject: string; html: string } {
  const name = data.name || "there";
  const qrUrl = data.qrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrData)}`
    : null;

  const qrBlock = qrUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
<tr><td align="center" style="padding:24px 0;">
<img src="${qrUrl}" alt="Check-in QR Code" width="200" height="200" style="display:block;border-radius:8px;" />
</td></tr>
<tr><td align="center">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};">Show this QR code at check-in</p>
</td></tr>
</table>`
    : "";

  // Calendar buttons (only rendered when time data is available)
  let calendarBlock = "";
  if (data.startTimeIso && data.endTimeIso) {
    const gcalStart = toGCalTime(data.startTimeIso);
    const gcalEnd   = toGCalTime(data.endTimeIso);
    const gcalUrl   = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(data.eventName)}` +
      `&dates=${gcalStart}/${gcalEnd}` +
      `&details=${encodeURIComponent(`Join us at ${data.eventName}! ${data.eventUrl}`)}` +
      `&location=${encodeURIComponent(data.eventLocation)}`;

    const supabaseProjectUrl = (data.origin || "https://704collective.com")
      .replace("https://704collective.com", "https://bnmtynevbuplqpuqvmna.supabase.co");
    const icsUrl = data.calendarToken
      ? `${supabaseProjectUrl}/functions/v1/calendar-feed?token=${data.calendarToken}`
      : null;

    calendarBlock = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
<tr><td align="center">
<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${BRAND.text};">Add to your calendar</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:0 6px;">
<a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;font-size:14px;font-weight:600;color:${BRAND.accent};text-decoration:none;">📅 Google Calendar</a>
</td>
${icsUrl ? `<td style="padding:0 6px;">
<a href="${icsUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;font-size:14px;font-weight:600;color:${BRAND.accent};text-decoration:none;">🍎 Apple / ICS</a>
</td>` : ""}
</tr>
</table>
</td></tr>
</table>`;
  }

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
${qrBlock}
${calendarBlock}
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Need to cancel? You can update your RSVP on the event page.</p>
`, data.origin),
  };
}

function guestPassTemplate(data: {
  guestName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  inviterName: string;
  personalMessage?: string | null;
  qrCodeUrl: string;
  guestPassCode: string;
  origin?: string;
  // Legacy fields (backward compat — ignored in new flow)
  memberName?: string;
  eventName?: string | null;
  passCode?: string;
  expiresDate?: string;
}): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const inviterName = data.inviterName || data.memberName || "A member";
  const eventTitle = data.eventTitle || data.eventName || "an upcoming event";
  const qrUrl = data.qrCodeUrl ||
    (data.passCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.passCode)}` : "");
  const passCode = data.guestPassCode || data.passCode || "";
  const base = data.origin || "https://704collective.com";

  const personalMessageBlock = data.personalMessage
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
<tr><td style="padding:16px 20px;background-color:${BRAND.color};border-left:3px solid ${BRAND.accent};border-radius:0 6px 6px 0;">
<p style="margin:0;font-size:14px;font-style:italic;color:${BRAND.textSecondary};">"${escapeHtml(data.personalMessage)}"</p>
<p style="margin:8px 0 0;font-size:13px;color:${BRAND.textMuted};">— ${escapeHtml(inviterName)}</p>
</td></tr>
</table>`
    : "";

  return {
    subject: `You've been invited to ${eventTitle} by ${inviterName}`,
    html: baseLayout(`
<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.accent};text-align:center;">You're Invited!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};text-align:center;">
  <strong style="color:${BRAND.text};">${escapeHtml(inviterName)}</strong> has invited you to join them at
  <strong style="color:${BRAND.text};">${escapeHtml(eventTitle)}</strong>
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:17px;font-weight:600;color:${BRAND.text};">${escapeHtml(eventTitle)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${data.eventDate ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📅&nbsp;&nbsp;${escapeHtml(data.eventDate)}</td></tr>` : ""}
${data.eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">⏰&nbsp;&nbsp;${escapeHtml(data.eventTime)}</td></tr>` : ""}
${data.eventLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📍&nbsp;&nbsp;${escapeHtml(data.eventLocation)}</td></tr>` : ""}
</table>
</td></tr>
</table>
${personalMessageBlock}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 8px;">
<tr><td align="center">
<p style="margin:0 0 16px;font-size:14px;font-weight:600;color:${BRAND.text};">Show this QR code at the door for entry</p>
${qrUrl ? `<img src="${qrUrl}" alt="Guest Pass QR Code" width="220" height="220" style="display:block;border-radius:8px;margin:0 auto;" />` : ""}
</td></tr>
<tr><td align="center" style="padding:16px 0 8px;">
<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMuted};">Pass Code</p>
<p style="margin:0;font-size:16px;font-weight:700;color:${BRAND.text};font-family:monospace;letter-spacing:2px;">${escapeHtml(passCode)}</p>
</td></tr>
</table>
${ctaButton("Learn More About 704 Collective", base)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};text-align:center;">
Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a>
</p>
`, base),
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
${ctaButton("Become a Member", "https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04")}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, base),
  };
}

function ticketFollowupTemplate(data: {
  guestName: string;
  eventName: string;
  origin?: string;
}): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const base = data.origin || "#";
  return {
    subject: `Thanks for joining us at ${data.eventName}!`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong>! We hope you had an amazing time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Want to skip the ticket line next time? Members get <strong>free access to all events</strong>, plus you'll be part of Charlotte's best community for young professionals.</p>
${ctaButton("Become a Member", "https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04")}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, base),
  };
}

function welcomeSetupTemplate(data: { name: string; setupLink: string; calendarUrl?: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin || "#";
  return {
    subject: "You're in. Let's get you set up.",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective. You just joined a room full of people who are actually worth knowing in Charlotte.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">First thing — set up your account so you can RSVP to events, get your member QR code, and see who else is in here.</p>
${ctaButton("Set Up Your Account", data.setupLink)}
<p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour, so handle it now.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Once you're in:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Browse upcoming events and grab your spot</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Subscribe to the member calendar</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Fill out your profile so people know who you are</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you need anything, reply to this email. A real person reads it.</p>
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

function eventChangeTemplate(data: {
  name: string;
  eventName: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  newLocation?: string;
  eventUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: `📅 Schedule Change: ${data.eventName}`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Heads up — <strong>${data.eventName}</strong> has been rescheduled.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.textMuted};">Updated Schedule</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textMuted};text-decoration:line-through;">📅&nbsp;&nbsp;${data.oldDate} at ${data.oldTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.accent};font-weight:600;">📅&nbsp;&nbsp;${data.newDate} at ${data.newTime}</td></tr>
${data.newLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📍&nbsp;&nbsp;${data.newLocation}</td></tr>` : ""}
</table>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your RSVP is still confirmed — no action needed unless the new time doesn't work for you.</p>
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Can't make it anymore? You can cancel your RSVP on the event page.</p>
`, data.origin),
  };
}

function hubAddedTemplate(data: { name: string; hubTitle: string; addedByName: string; hubUrl: string }): { subject: string; html: string } {
  return {
    subject: `You've been added to a hub: ${data.hubTitle}`,
    html: baseLayout(`
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">Welcome to the hub!</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.addedByName}</strong> has added you to the hub 
  <strong style="color:${BRAND.text};">${data.hubTitle}</strong> on the 704 Collective member portal.
  You can now view the hub feed, connect with members, and access shared resources.
</p>
${ctaButton("View Hub", data.hubUrl)}
`),
  };
}

function newMessageTemplate(data: { name: string; senderName: string; messagesUrl: string }): { subject: string; html: string } {
  return {
    subject: `New message from ${data.senderName}`,
    html: baseLayout(`
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">You have a new message</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.senderName}</strong> sent you a message on the 704 Collective member portal.
</p>
${ctaButton("View Message", data.messagesUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You'll only receive this notification once per new conversation.</p>
`),
  };
}

function feedMentionTemplate(data: { name: string; mentionerName: string; dashboardUrl: string }): { subject: string; html: string } {
  return {
    subject: `${data.mentionerName} mentioned you on 704 Collective`,
    html: baseLayout(`
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">You were mentioned</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.mentionerName}</strong> mentioned you in a post on the member portal.
</p>
${ctaButton("Open your dashboard", data.dashboardUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This is a one-time email for this mention.</p>
`),
  };
}

function partnerApplicationSubmittedTemplate(data: { name: string; companyName: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "We received your 704 Collective partner application",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Thank you for applying to partner with 704 Collective as <strong style="color:${BRAND.text};">${data.companyName}</strong>.
  Our team is reviewing your application and will follow up soon.
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  If you have questions in the meantime, reply to this email or write to hello@704collective.com.
</p>
${ctaButton("Visit 704 Collective", base)}
`, base),
  };
}

function partnerNewApplicationAdminTemplate(data: { companyName: string; applicantEmail: string }): { subject: string; html: string } {
  return {
    subject: `New partner application: ${data.companyName}`,
    html: baseLayout(`
<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.text};">New partner application</h2>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">Applicant email:</strong> ${data.applicantEmail}
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Review applications in the admin dashboard when partner tooling is enabled.</p>
`),
  };
}

function partnerApplicationDeniedTemplate(data: { name: string; reason: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "Update on your 704 Collective partner application",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Thank you for your interest in partnering with 704 Collective. After review, we&apos;re not able to move forward with this application at this time.
</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.reason}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">If you have questions, you can reach us at hello@704collective.com.</p>
${ctaButton("Visit 704 Collective", base)}
`, base),
  };
}

function partnerWelcomeInviteTemplate(data: { name: string; dashboardUrl: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "You're approved — welcome to 704 Collective partners",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Your partner invitation has been accepted. You're approved to collaborate with 704 Collective — we're excited to build with you in Charlotte.
</p>
${ctaButton("Go to your dashboard", data.dashboardUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Log in with the email and password you used to apply.</p>
`, base),
  };
}

function partnerEventInquiryAdminTemplate(data: {
  partnerEmail: string;
  partnerName: string;
  companyName: string;
  inquiryType: string;
  eventLabel: string;
  bodyHtml: string;
}): { subject: string; html: string } {
  return {
    subject: `Partner inquiry (${data.inquiryType}): ${data.companyName}`,
    html: baseLayout(`
<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${BRAND.text};">New partner event inquiry</h2>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Contact:</strong> ${data.partnerName} &lt;${data.partnerEmail}&gt;</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Type:</strong> ${data.inquiryType}</p>
<p style="margin:0 0 20px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Event:</strong> ${data.eventLabel}</p>
<div style="font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">${data.bodyHtml}</div>
`),
  };
}

function partnerInquiryAdminReplyPartnerTemplate(data: {
  name: string;
  inquiriesUrl: string;
  preview: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "704 Collective replied to your inquiry",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">The team sent a new message on your event inquiry thread.</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("View thread", data.inquiriesUrl)}
`, base),
  };
}

function partnerTeamFirstSuperadminTemplate(data: {
  superAdminName: string;
  partnerCompany: string;
  partnerName: string;
  partnerEmail: string;
  preview: string;
  adminUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Partner message: ${data.partnerCompany}`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.superAdminName},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">${data.partnerCompany}</strong> (${data.partnerName}, ${data.partnerEmail}) started a conversation with the 704 Collective team.
</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("Open admin portal", data.adminUrl)}
<p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">This is a one-time email for the first message in this thread. Further replies appear only in the portal.</p>
`),
  };
}

function partnerTeamReplyPartnerTemplate(data: {
  name: string;
  preview: string;
  messagesUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "704 Collective replied to your message",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">The team sent a new message.</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("Open messages", data.messagesUrl)}
`, base),
  };
}

function partnerAccountDeletionRequestTemplate(data: {
  userId: string;
  email: string;
  companyName: string;
  fullName: string;
}): { subject: string; html: string } {
  return {
    subject: `Partner account deletion request: ${data.companyName}`,
    html: baseLayout(`
<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${BRAND.text};">Account deletion requested</h2>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};">A partner requested account deletion from the partner portal (confirmation matched company name).</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">User ID:</strong> ${data.userId}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Email:</strong> ${data.email}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Name:</strong> ${data.fullName}</p>
<p style="margin:0 0 0;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}</p>
`, "https://704collective.com"),
  };
}

function socialSignupConfirmationTemplate(data: { name: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "You're signed up — confirm your email | 704 Collective",
    html: baseLayout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for creating your 704 Collective account. Use the confirmation link in your inbox to verify your email and continue.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">Questions? hello@704collective.com</p>`,
      base,
    ),
  };
}

function businessApplicationMemberConfirmTemplate(data: {
  name: string;
  company: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "We received your 704 Business application",
    html: baseLayout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for applying to <strong style="color:${BRAND.text};">704 Business</strong> for <strong>${data.company}</strong>. Our team will review your application and follow up by email.</p>
${ctaButton("Visit 704 Collective", base)}`,
      base,
    ),
  };
}

function businessApplicationAdminNotifyTemplate(data: {
  company: string;
  applicantEmail: string;
  adminPanelUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: `New 704 Business application: ${data.company}`,
    html: baseLayout(
      `<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:${BRAND.text};">New business application</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong>Company:</strong> ${data.company}</p>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.textSecondary};"><strong>Email:</strong> ${data.applicantEmail}</p>
${ctaButton("Review in admin", data.adminPanelUrl)}`,
      base,
    ),
  };
}

function businessMembershipApprovedTemplate(data: {
  firstName: string;
  creditNoteHtml?: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  const credit = data.creditNoteHtml
    ? `<div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">${data.creditNoteHtml}</div>`
    : "";
  return {
    subject: "You're in — welcome to 704 Business",
    html: baseLayout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Welcome to 704 Business, ${data.firstName}.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your application has been approved. Log in to your member portal for meetings, workshops, introductions, and full community access.</p>
${credit}
${ctaButton("Go to my portal", `${base}/dashboard`)}`,
      base,
    ),
  };
}

function businessApplicationDecisionTemplate(data: {
  firstName: string;
  action: string;
  reason?: string;
  checkoutEmail: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  const isDenied = data.action === "denied";
  const subject = isDenied
    ? "Your 704 Business application"
    : "You've been added to our waitlist — 704 Business";
  const reasonBlock = data.reason
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};"><strong>Note from our team:</strong> ${escapeHtml(data.reason)}</p>`
    : "";
  const body = isDenied
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thank you for applying to 704 Business. After reviewing your application, we've decided not to move forward at this time.</p>
${reasonBlock}
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're welcome to join as a Social member while you stay connected to the community.</p>
${ctaButton("Join Social — $35/mo", `${base}/join/checkout?email=${encodeURIComponent(data.checkoutEmail)}`)}`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thank you for applying to 704 Business. We've added you to our waitlist and will reach out when a spot opens.</p>
${reasonBlock}
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">In the meantime, you're welcome to join as a Social member.</p>
${ctaButton("Join Social — $35/mo", `${base}/join/checkout?email=${encodeURIComponent(data.checkoutEmail)}`)}`;
  return {
    subject,
    html: baseLayout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.firstName},</p>
${body}`,
      base,
    ),
  };
}

function welcomeOnboardingCompleteTemplate(data: {
  name: string;
  calendarUrl: string;
  dashboardUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "You're all set — welcome to 704 Collective",
    html: baseLayout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've finished onboarding. Head to your dashboard for events, messages, and your member calendar.</p>
${ctaButton("Open your dashboard", data.dashboardUrl)}
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Add events to your calendar: <a href="${data.calendarUrl}" style="color:${BRAND.accent};word-break:break-all;">Subscribe</a></p>`,
      base,
    ),
  };
}

// ── template router ──────────────────────────────────────────────────────

function getTemplate(template: string, data: Record<string, unknown>): { subject: string; html: string } {
  switch (template) {
    case "welcome-back":
      return welcomeBackTemplate(data as { name: string; calendarUrl: string; origin?: string });
    case "welcome-new":
      return welcomeNewTemplate(data as { name: string; calendarUrl: string; origin?: string });
    case "password-setup":
      return passwordSetupTemplate(data as { name: string; setupLink: string });
    case "welcome-setup":
      return welcomeSetupTemplate(data as { name: string; setupLink: string; calendarUrl?: string; origin?: string });
    case "rsvp-confirmation":
      return rsvpConfirmationTemplate(data as {
        name: string;
        eventName: string;
        eventDate: string;
        eventTime: string;
        eventLocation: string;
        eventUrl: string;
        qrData?: string;
        origin?: string;
        startTimeIso?: string;
        endTimeIso?: string;
        calendarToken?: string;
      });
    case "event-change":
      return eventChangeTemplate(data as {
        name: string; eventName: string;
        oldDate: string; oldTime: string; newDate: string; newTime: string;
        newLocation?: string; eventUrl: string; origin?: string;
      });
    case "guest-followup":
      return guestFollowupTemplate(data as {
        guestName: string; memberName: string; eventName: string; origin?: string;
      });
    case "ticket-followup":
      return ticketFollowupTemplate(data as {
        guestName: string; eventName: string; origin?: string;
      });
    case "admin-invite":
      return adminInviteTemplate(data as { name: string; setupLink?: string | null; loginUrl?: string });
    case "guest-pass":
      return guestPassTemplate(data as {
        guestName: string;
        eventTitle: string;
        eventDate: string;
        eventTime: string;
        eventLocation: string;
        inviterName: string;
        personalMessage?: string | null;
        qrCodeUrl: string;
        guestPassCode: string;
        origin?: string;
        memberName?: string;
        eventName?: string | null;
        passCode?: string;
        expiresDate?: string;
      });
    case "new-message":
      return newMessageTemplate(data as { name: string; senderName: string; messagesUrl: string });
    case "hub-added":
      return hubAddedTemplate(data as { name: string; hubTitle: string; addedByName: string; hubUrl: string });
    case "feed-mention":
      return feedMentionTemplate(data as { name: string; mentionerName: string; dashboardUrl: string });
    case "partner-application-submitted":
      return partnerApplicationSubmittedTemplate(data as { name: string; companyName: string; origin?: string });
    case "partner-new-application-admin":
      return partnerNewApplicationAdminTemplate(data as { companyName: string; applicantEmail: string });
    case "partner-welcome-invite":
      return partnerWelcomeInviteTemplate(data as { name: string; dashboardUrl: string; origin?: string });
    case "partner-application-denied":
      return partnerApplicationDeniedTemplate(data as { name: string; reason: string; origin?: string });
    case "partner-event-inquiry-admin":
      return partnerEventInquiryAdminTemplate(data as {
        partnerEmail: string;
        partnerName: string;
        companyName: string;
        inquiryType: string;
        eventLabel: string;
        bodyHtml: string;
      });
    case "partner-inquiry-admin-reply-partner":
      return partnerInquiryAdminReplyPartnerTemplate(data as {
        name: string;
        inquiriesUrl: string;
        preview: string;
        origin?: string;
      });
    case "partner-team-first-superadmin":
      return partnerTeamFirstSuperadminTemplate(data as {
        superAdminName: string;
        partnerCompany: string;
        partnerName: string;
        partnerEmail: string;
        preview: string;
        adminUrl: string;
      });
    case "partner-team-reply-partner":
      return partnerTeamReplyPartnerTemplate(data as {
        name: string;
        preview: string;
        messagesUrl: string;
        origin?: string;
      });
    case "partner-account-deletion-request":
      return partnerAccountDeletionRequestTemplate(data as {
        userId: string;
        email: string;
        companyName: string;
        fullName: string;
      });
    case "social-signup-confirmation":
      return socialSignupConfirmationTemplate(data as { name: string; origin?: string });
    case "business-application-member-confirm":
      return businessApplicationMemberConfirmTemplate(data as { name: string; company: string; origin?: string });
    case "business-application-admin-notify":
      return businessApplicationAdminNotifyTemplate(data as {
        company: string;
        applicantEmail: string;
        adminPanelUrl: string;
        origin?: string;
      });
    case "business-membership-approved":
      return businessMembershipApprovedTemplate(data as {
        firstName: string;
        creditNoteHtml?: string;
        origin?: string;
      });
    case "business-application-decision":
      return businessApplicationDecisionTemplate(data as {
        firstName: string;
        action: string;
        reason?: string;
        checkoutEmail: string;
        origin?: string;
      });
    case "welcome-onboarding-complete":
      return welcomeOnboardingCompleteTemplate(data as {
        name: string;
        calendarUrl: string;
        dashboardUrl: string;
        origin?: string;
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

    let isServiceRole = token === serviceRoleKey;

    // Accept new-format Supabase secret keys
    if (!isServiceRole && token.startsWith("sb_secret_")) {
      isServiceRole = true;
    }

    // Accept legacy JWT if payload indicates service_role and project ref matches
    if (!isServiceRole && token.startsWith("eyJ")) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const supabaseRef = (Deno.env.get("SUPABASE_URL") || "").replace("https://", "").split(".")[0];
        if (payload.role === "service_role" && payload.ref === supabaseRef) {
          isServiceRole = true;
        }
      } catch (_e) {
        // Not a valid JWT — leave isServiceRole false
      }
    }

    // Templates that require service role (internal/admin only)
    const restrictedTemplates = [
      "admin-invite", "welcome-setup", "welcome-back", "welcome-new", "password-setup", "event-change", "guest-followup",
      "ticket-followup", "guest-pass", "feed-mention", "partner-application-submitted",
      "partner-new-application-admin", "partner-welcome-invite", "partner-application-denied",
      "partner-event-inquiry-admin", "partner-inquiry-admin-reply-partner", "partner-team-first-superadmin",
      "partner-team-reply-partner", "partner-account-deletion-request", "social-signup-confirmation",
      "business-application-member-confirm", "business-application-admin-notify", "business-membership-approved",
      "business-application-decision", "welcome-onboarding-complete",
    ];

    // ── Parse body first so we can check template ──
    const { to, template, data, skipCc } = await req.json();

    if (!to || !template) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'template'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isServiceRole) {
      // Validate as user JWT
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error } = await supabase.auth.getClaims(token);
      if (error || !claimsData?.claims) {
        log("Auth failed", { error: error?.message });
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Regular users can only send rsvp-confirmation to their own email
      if (restrictedTemplates.includes(template)) {
        log("Restricted template requested by regular user", { template, userId: claimsData.claims.sub });
        return new Response(JSON.stringify({ error: "Forbidden: insufficient permissions for this template" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For rsvp-confirmation, verify the "to" matches the caller's email
      const userEmail = claimsData.claims.email;
      if (template === "rsvp-confirmation" && to.toLowerCase() !== String(userEmail).toLowerCase()) {
        log("User tried to send rsvp-confirmation to another email", { to, userEmail });
        return new Response(JSON.stringify({ error: "Forbidden: can only send to your own email" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    log("Sending email", { to, template });

    const { subject, html } = getTemplate(template, data || {});
    const text = htmlToPlainText(html);

    // ── Send via Resend ──
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const fromAddress = "704 Collective <no-reply@704collective.com>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        ...(!skipCc && (template === "welcome-back" || template === "password-setup" || template === "welcome-setup")
          ? { cc: ["hello@704collective.com"] }
          : {}),
        subject,
        html,
        text,
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

    // ── Fire-and-forget email_log insert ─────────────────────────────────────
    try {
      const serviceRoleClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await serviceRoleClient.from("email_log").insert({
        to_email: to,
        to_name: (data as Record<string, unknown>)?.name as string ?? null,
        subject,
        template,
        status: "sent",
        resend_id: resendData.id ?? null,
        created_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("[SEND-EMAIL] email_log insert failed:", logErr instanceof Error ? logErr.message : logErr);
    }

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
