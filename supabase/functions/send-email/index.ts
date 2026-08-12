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

// Templates that CC hello@704collective.com so the team is aware of
// member onboarding moments. Members can suppress CC by passing skipCc: true.
const TEAM_CC_TEMPLATES = new Set([
  "welcome-new",
  "welcome-back",
  "welcome-setup",
  "password-setup",
  "welcome-onboarding-complete",
  "business-membership-approved",
]);
const TEAM_CC_ADDRESS = "hello@704collective.com";

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

// ── Shared layout ────────────────────────────────────────────────────────
interface BaseLayoutOpts {
  /** Used in the <title> tag */
  title: string;
  /** Short 1-line inbox preview (15–90 chars). Hidden from rendered email. */
  previewText?: string;
  /** HTML content rendered inside the 600px card body cell */
  content: string;
  /** 'dark' (default) or 'light' — controls colors and logo variant */
  theme?: "dark" | "light";
  /** Optional extra line in footer (e.g. support contact) */
  footerNote?: string;
}

function baseLayout(opts: BaseLayoutOpts): string {
  const theme       = opts.theme ?? "dark";
  const outerBg     = theme === "dark" ? BRAND.color   : "#FAF6F0";
  const cardBg      = theme === "dark" ? BRAND.surface  : "#FFFFFF";
  const textColor   = theme === "dark" ? BRAND.text     : "#1A1A1A";
  const mutedColor  = theme === "dark" ? "rgba(255,255,255,0.4)" : "#6b7280";
  const borderColor = theme === "dark" ? BRAND.border   : "rgba(0,0,0,0.08)";
  const logoUrl     = theme === "dark"
    ? "https://704collective.com/logo-email-dark.png"
    : "https://704collective.com/logo-email-light.png";

  // Preheader: hidden first line visible in inbox snippets.
  // Padded with invisible zero-width characters so it fills the ~150-char
  // preview window and prevents body text from bleeding through.
  const preheader = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;">${opts.previewText} ${"&nbsp;&#8203;".repeat(30)}</div>`
    : "";

  const footerNoteHtml = opts.footerNote
    ? `<p style="margin:6px 0 0;font-size:12px;color:${mutedColor};text-align:center;">${opts.footerNote}</p>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${opts.title}</title>
<style type="text/css">
body{margin:0;padding:0;background-color:${outerBg};font-family:${BRAND.fontStack};}
table{border-collapse:collapse;}
.container{max-width:600px;}
img{display:block;border:0;max-width:100%;height:auto;}
a{color:${BRAND.accent};text-decoration:none;}
</style>
</head>
<body bgcolor="${outerBg}" style="margin:0;padding:0;background-color:${outerBg};font-family:${BRAND.fontStack};color:${textColor};">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${outerBg}" style="background-color:${outerBg};">
<tr>
<td align="center" valign="top" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="max-width:600px;width:100%;background-color:${cardBg};border-radius:12px;overflow:hidden;border:1px solid ${borderColor};">
<!-- Logo header -->
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${borderColor};">
<img src="${logoUrl}" alt="704 Collective" width="120" style="display:block;width:120px;height:auto;border:0;" />
</td></tr>
<!-- Body -->
<tr><td style="padding:32px 40px;">
${opts.content}
</td></tr>
<!-- Footer divider -->
<tr><td style="padding:0;height:0;line-height:0;border-top:1px solid ${borderColor};font-size:0;">&nbsp;</td></tr>
<!-- Footer -->
<tr><td align="center" style="padding:24px 40px;">
<p style="margin:0;font-size:13px;color:${mutedColor};text-align:center;">704 Collective &middot; Charlotte, NC</p>
${footerNoteHtml}
<p style="margin:8px 0 0;font-size:12px;text-align:center;"><a href="https://704collective.com/unsubscribe" style="color:${mutedColor};text-decoration:underline;">Unsubscribe</a></p>
</td></tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:#FAF6F0;border-radius:8px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">${text}</a>
</td></tr>
</table>`;
}

function welcomeBackTemplate(data: { name: string; calendarUrl: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin;
  if (!base) throw new Error("[welcome-back] origin is required but was not provided. Ensure the calling function passes origin in the email data payload.");
  return {
    subject: "You're back - welcome home",
    html: baseLayout({
      title: "Welcome Back - 704 Collective",
      previewText: "Welcome back. We kept the lights on for you.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome back. We kept the lights on for you.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">A few things to get you rolling again:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> <a href="${base}/events" style="color:${BRAND.accent};text-decoration:underline;">Check out what's coming up and RSVP</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Subscribe to the calendar so you never miss one</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Make sure your profile is up to date</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Good to have you back in the room.</p>
${ctaButton("See Upcoming Events", `${base}/events`)}`,
    }),
  };
}

function welcomeNewTemplate(data: { name: string; calendarUrl: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin;
  if (!base) throw new Error("[welcome-new] origin is required but was not provided. Ensure the calling function passes origin in the email data payload.");
  return {
    subject: "You're in. Welcome to 704 Collective.",
    html: baseLayout({
      title: "Welcome to 704 Collective",
      previewText: "You're in. Welcome to 704 Collective - Charlotte's community of people worth knowing.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective. You just joined a room full of people who are actually worth knowing in Charlotte.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">You'll receive a confirmation email. In the meantime, here's what to do next:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${base}/events" style="color:${BRAND.accent};text-decoration:underline;">Browse upcoming events and grab your spot</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${data.calendarUrl}" style="color:${BRAND.accent};text-decoration:underline;">Subscribe to the member calendar</a></td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<a href="${base}/settings" style="color:${BRAND.accent};text-decoration:underline;">Fill out your profile so people know who you are</a></td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">If you need anything, reply to this email. A real person reads it.</p>
${ctaButton("See Upcoming Events", `${base}/events`)}
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">704 Collective</p>`,
    }),
  };
}

function publicRsvpConfirmationTemplate(data: {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventAddress?: string;
  origin?: string;
  // Optional fields for a real organizer invite (METHOD:REQUEST invite.ics)
  startTimeIso?: string;
  endTimeIso?: string;
  eventId?: string;
  recipientEmail?: string;
}): { subject: string; html: string; attachments?: EmailAttachment[] } {
  const name = data.name || "there";
  const base = data.origin || "https://704collective.com";

  // Same METHOD:REQUEST invite.ics + UID scheme as rsvpConfirmationTemplate.
  let attachments: EmailAttachment[] | undefined;
  if (data.startTimeIso && data.eventId) {
    const ics = buildEventIcs({
      title: data.eventName,
      startIso: data.startTimeIso,
      endIso: data.endTimeIso,
      location: [data.eventLocation, data.eventAddress].filter(Boolean).join(", ") || undefined,
      uid: `${data.eventId}@704collective.com`,
      method: "REQUEST",
      status: "CONFIRMED",
      sequence: 0,
      attendeeEmail: data.recipientEmail,
    });
    attachments = [{ filename: "invite.ics", content: toBase64Utf8(ics), content_type: "text/calendar; method=REQUEST" }];
  }

  return {
    subject: `You're confirmed: ${data.eventName}`,
    html: baseLayout({
      title: `You're Confirmed: ${data.eventName}`,
      previewText: `You're confirmed for ${data.eventName}. We'll see you there.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're confirmed for <strong>${data.eventName}</strong>. We'll see you there.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${data.eventDate}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${data.eventTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${data.eventLocation}${data.eventAddress ? `, ${data.eventAddress}` : ""}</td></tr>
</table>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">704 Collective is Charlotte's community for young professionals who want to meet people worth knowing. We host events, dinners, and experiences throughout the year.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Want access to more events like this?</p>
${ctaButton("Learn About 704 Collective", `${base}/join`)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">No pressure - just glad you're coming.</p>`,
    }),
    attachments,
  };
}

function passwordSetupTemplate(data: { name: string; setupLink: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: "Set up your 704 Collective account",
    html: baseLayout({
      title: "Set Up Your Account - 704 Collective",
      previewText: "Your 704 Collective account is ready - set your password to get started.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Collective account is ready - you just need to set a password.</p>
${ctaButton("Set Up Your Account", data.setupLink)}
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Once you're in, you can RSVP to events, access your membership QR code, and connect with other members.</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Just reply here.</p>`,
    }),
  };
}

interface EmailAttachment {
  filename: string;
  content: string; // base64
  content_type?: string;
}

function toGCalTime(iso: string): string {
  // Format: YYYYMMDDTHHmmssZ (UTC). new Date() safely parses both the
  // space-separated and T-separated forms; emit UTC with a trailing Z.
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// UTF-8-safe base64 (btoa alone throws on non-latin1 chars).
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Minimal single-event VEVENT/VCALENDAR string (UTC times, trailing Z).
// Defaults to an "add" invite (METHOD:PUBLISH, SEQUENCE:0). Pass method:"CANCEL"
// + status:"CANCELLED" + sequence:1 with the SAME uid to produce a cancellation
// that calendar clients match to the original event and remove.
function buildEventIcs(opts: {
  title: string;
  startIso: string;
  endIso?: string;
  location?: string;
  description?: string;
  uid: string;
  method?: "PUBLISH" | "CANCEL" | "REQUEST";
  status?: "CONFIRMED" | "CANCELLED";
  sequence?: number;
  attendeeEmail?: string;
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  // A REQUEST is an organizer invite; default its STATUS to CONFIRMED when the
  // caller did not specify one (matches how calendar clients expect invites).
  const status = opts.status ?? (opts.method === "REQUEST" ? "CONFIRMED" : undefined);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//704 Collective//Events//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method ?? "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `ORGANIZER;CN=704 Collective:mailto:no-reply@704collective.com`,
    ...(opts.attendeeEmail ? [`ATTENDEE;CN=${opts.attendeeEmail};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`] : []),
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(opts.startIso)}`,
    ...(opts.endIso ? [`DTEND:${fmt(opts.endIso)}`] : []),
    `SUMMARY:${esc(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description)}`] : []),
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    `SEQUENCE:${opts.sequence ?? 0}`,
    ...(status ? [`STATUS:${status}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
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
  // Optional fields for a real organizer invite (METHOD:REQUEST invite.ics)
  eventId?: string;
  recipientEmail?: string;
}): { subject: string; html: string; attachments?: EmailAttachment[] } {
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
<a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;font-size:14px;font-weight:600;color:${BRAND.accent};text-decoration:none;">&#128197; Google Calendar</a>
</td>
${icsUrl ? `<td style="padding:0 6px;">
<a href="${icsUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;font-size:14px;font-weight:600;color:${BRAND.accent};text-decoration:none;">&#127822; Apple / ICS</a>
</td>` : ""}
</tr>
</table>
</td></tr>
</table>`;
  }

  // Real organizer invite (METHOD:REQUEST) attached as invite.ics so Apple Mail /
  // Outlook surface an accept/decline card. The GCal + subscription-feed links
  // above remain as a fallback. Same UID scheme as the cancel path so clients
  // match this invite to any later CANCEL for the same event.
  let attachments: EmailAttachment[] | undefined;
  if (data.startTimeIso && data.eventId) {
    const ics = buildEventIcs({
      title: data.eventName,
      startIso: data.startTimeIso,
      endIso: data.endTimeIso,
      location: data.eventLocation,
      uid: `${data.eventId}@704collective.com`,
      method: "REQUEST",
      status: "CONFIRMED",
      sequence: 0,
      attendeeEmail: data.recipientEmail,
    });
    attachments = [{ filename: "invite.ics", content: toBase64Utf8(ics), content_type: "text/calendar; method=REQUEST" }];
  }

  return {
    subject: `You're in! ${data.eventName}`,
    html: baseLayout({
      title: `RSVP Confirmed: ${data.eventName}`,
      previewText: `You're in! Your RSVP for ${data.eventName} is confirmed.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're confirmed for <strong>${data.eventName}</strong>!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${data.eventDate}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${data.eventTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${data.eventLocation}</td></tr>
</table>
</td></tr>
</table>
${qrBlock}
${calendarBlock}
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Need to cancel? You can update your RSVP on the event page.</p>`,
    }),
    attachments,
  };
}

function rsvpCancelledTemplate(data: {
  name?: string;
  eventName: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  startTimeIso?: string;
  endTimeIso?: string;
  eventId?: string;
  origin?: string;
  // Current per-event ICS sequence (advanced only on event edits). The cancel
  // must carry a SEQUENCE strictly greater than the last invite/update so
  // calendar clients accept the removal.
  icsSequence?: number;
}): { subject: string; html: string; attachments?: EmailAttachment[] } {
  const name = data.name || "there";
  const eventName = data.eventName || "your event";
  const base = data.origin || "https://704collective.com";

  // Cancellation ICS: same UID as the add-path so calendar clients match and
  // remove the event when the recipient opens it (METHOD:CANCEL + STATUS:CANCELLED).
  // SEQUENCE = current counter + 1 so it supersedes the latest invite/update.
  let attachments: EmailAttachment[] | undefined;
  if (data.startTimeIso && data.eventId) {
    const ics = buildEventIcs({
      title: eventName,
      startIso: data.startTimeIso,
      endIso: data.endTimeIso,
      location: data.eventLocation,
      uid: `${data.eventId}@704collective.com`,
      method: "CANCEL",
      status: "CANCELLED",
      sequence: (data.icsSequence ?? 0) + 1,
    });
    attachments = [{ filename: "cancel.ics", content: toBase64Utf8(ics), content_type: "text/calendar" }];
  }

  const detailsBlock = (data.eventDate || data.eventTime || data.eventLocation)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
${data.eventDate ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${escapeHtml(data.eventDate)}</td></tr>` : ""}
${data.eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${escapeHtml(data.eventTime)}</td></tr>` : ""}
${data.eventLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${escapeHtml(data.eventLocation)}</td></tr>` : ""}
</table>
</td></tr>
</table>`
    : "";

  const icsNote = attachments
    ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">&#128197; Opening the attached <strong>cancel.ics</strong> file removes this event from your calendar.</p>`
    : "";

  return {
    subject: `Your RSVP for ${eventName} has been cancelled`,
    html: baseLayout({
      title: `RSVP Cancelled: ${eventName}`,
      previewText: `Your RSVP for ${eventName} has been cancelled.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${escapeHtml(name)},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your RSVP for <strong>${escapeHtml(eventName)}</strong> has been cancelled. Your spot has been released.</p>
${detailsBlock}
${icsNote}
${ctaButton("Browse Upcoming Events", `${base}/events`)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Changed your mind? You can RSVP again any time from the event page.</p>`,
    }),
    attachments,
  };
}

// ── Host message ────────────────────────────────────────────────────────────
// Sent to an event's host when an RSVP'd member messages them from the event
// page. All identity fields (name/email/phone) are resolved SERVER-SIDE by the
// message-event-host function — never trusted from the client.
function hostMessageTemplate(data: {
  hostName?: string;
  memberName?: string;
  memberEmail?: string;
  memberPhone?: string;
  eventName?: string;
  eventDate?: string;
  message?: string;
  origin?: string;
}): { subject: string; html: string } {
  const hostName = data.hostName || "there";
  const memberName = data.memberName || "A member";
  const eventName = data.eventName || "your event";
  const message = (data.message || "").trim();
  const phone = data.memberPhone && data.memberPhone.trim() ? data.memberPhone.trim() : "not provided";
  const email = data.memberEmail && data.memberEmail.trim() ? data.memberEmail.trim() : "not provided";

  const contextLine = data.eventDate
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">Regarding <strong style="color:${BRAND.textSecondary};">${escapeHtml(eventName)}</strong> &middot; ${escapeHtml(data.eventDate)}</p>`
    : `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">Regarding <strong style="color:${BRAND.textSecondary};">${escapeHtml(eventName)}</strong></p>`;

  return {
    subject: `Question about ${eventName} from ${memberName}`,
    html: baseLayout({
      title: `Message about ${eventName}`,
      previewText: `${memberName} sent you a question about ${eventName}.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${escapeHtml(hostName)},</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};"><strong>${escapeHtml(memberName)}</strong> sent you a message as the host of this event:</p>
${contextLine}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-left:3px solid ${BRAND.accent};border-radius:8px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.text};white-space:pre-wrap;">${escapeHtml(message)}</p>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.surface};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.textMuted};">Reply directly to</p>
<p style="margin:0 0 4px;font-size:15px;color:${BRAND.text};"><strong>${escapeHtml(memberName)}</strong></p>
<p style="margin:0 0 4px;font-size:14px;color:${BRAND.textSecondary};">Email: <a href="mailto:${escapeHtml(email)}" style="color:${BRAND.accent};text-decoration:none;">${escapeHtml(email)}</a></p>
<p style="margin:0;font-size:14px;color:${BRAND.textSecondary};">Phone: ${escapeHtml(phone)}</p>
</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You're receiving this because you're listed as the host of ${escapeHtml(eventName)}.</p>`,
    }),
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
  // Calendar fields (guests get a Google link + an attached per-event ICS;
  // never a member subscription-feed / calendarToken link).
  startTimeIso?: string;
  endTimeIso?: string;
  eventId?: string;
  recipientEmail?: string;
  // Legacy fields (backward compat — ignored in new flow)
  memberName?: string;
  eventName?: string | null;
  passCode?: string;
  expiresDate?: string;
}): { subject: string; html: string; attachments?: EmailAttachment[] } {
  const guestName = data.guestName || "there";
  const inviterName = data.inviterName || data.memberName || "A member";
  const eventTitle = data.eventTitle || data.eventName || "an upcoming event";
  const qrUrl = data.qrCodeUrl ||
    (data.passCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.passCode)}` : "");
  const passCode = data.guestPassCode || data.passCode || "";
  const base = data.origin || "https://704collective.com";

  // ── Calendar block + ICS attachment (only when time data is available) ──
  // Google Calendar is a plain https link (reliable in all mail clients);
  // the per-event ICS ships as a real Resend attachment (data: URIs and the
  // download attribute are stripped by Gmail/Apple Mail, so a link is not
  // reliable — an attachment is). No calendarToken/subscription link for guests.
  let calendarBlock = "";
  let attachments: EmailAttachment[] | undefined;
  if (data.startTimeIso && data.endTimeIso) {
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(eventTitle)}` +
      `&dates=${toGCalTime(data.startTimeIso)}/${toGCalTime(data.endTimeIso)}` +
      `&details=${encodeURIComponent(`You're invited to ${eventTitle}! ${base}`)}` +
      `&location=${encodeURIComponent(data.eventLocation || "")}`;

    calendarBlock = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
<tr><td align="center">
<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${BRAND.text};">Add to your calendar</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:0 6px;">
<a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;font-size:14px;font-weight:600;color:${BRAND.accent};text-decoration:none;">&#128197; Google Calendar</a>
</td>
</tr>
</table>
<p style="margin:12px 0 0;font-size:12px;color:${BRAND.textMuted};">&#127822; Apple Calendar / Outlook: open the attached <strong>event.ics</strong> file.</p>
</td></tr>
</table>`;

    const ics = buildEventIcs({
      title: eventTitle,
      startIso: data.startTimeIso,
      endIso: data.endTimeIso,
      location: data.eventLocation,
      description: `You're invited to ${eventTitle}!`,
      uid: data.eventId ? `${data.eventId}@704collective.com` : `${passCode || crypto.randomUUID()}@704collective.com`,
      method: "REQUEST",
      status: "CONFIRMED",
      attendeeEmail: data.recipientEmail,
    });
    attachments = [{ filename: "event.ics", content: toBase64Utf8(ics), content_type: "text/calendar; method=REQUEST" }];
  }

  const personalMessageBlock = data.personalMessage
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
<tr><td style="padding:16px 20px;background-color:rgba(255,255,255,0.04);border-left:3px solid ${BRAND.accent};border-radius:0 6px 6px 0;">
<p style="margin:0;font-size:14px;font-style:italic;color:${BRAND.textSecondary};">"${escapeHtml(data.personalMessage)}"</p>
<p style="margin:8px 0 0;font-size:13px;color:${BRAND.textMuted};">- ${escapeHtml(inviterName)}</p>
</td></tr>
</table>`
    : "";

  return {
    subject: `You've been invited to ${eventTitle} by ${inviterName}`,
    html: baseLayout({
      title: `You're Invited to ${eventTitle}`,
      previewText: `${escapeHtml(inviterName)} has invited you to join them at ${escapeHtml(eventTitle)}.`,
      content: `
<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.accent};text-align:center;">You're Invited!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};text-align:center;">
  <strong style="color:${BRAND.text};">${escapeHtml(inviterName)}</strong> has invited you to join them at
  <strong style="color:${BRAND.text};">${escapeHtml(eventTitle)}</strong>
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:17px;font-weight:600;color:${BRAND.text};">${escapeHtml(eventTitle)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${data.eventDate ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${escapeHtml(data.eventDate)}</td></tr>` : ""}
${data.eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${escapeHtml(data.eventTime)}</td></tr>` : ""}
${data.eventLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${escapeHtml(data.eventLocation)}</td></tr>` : ""}
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
${calendarBlock}
${ctaButton("Learn More About 704 Collective", base)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};text-align:center;">
Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a>
</p>`,
    }),
    attachments,
  };
}

function waitlistSpotOpenTemplate(data: {
  memberName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  claimUrl: string;
  expiresHours: number;
  origin?: string;
}): { subject: string; html: string } {
  const memberName = data.memberName || "there";
  const eventTitle = data.eventTitle || "an event";
  const expiresHours = data.expiresHours || 24;
  const claimUrl = data.claimUrl || (data.origin || "https://704collective.com");

  return {
    subject: `A spot opened up for ${eventTitle}`,
    html: baseLayout({
      title: `A Spot Opened Up - ${eventTitle}`,
      previewText: `Good news - a seat just opened up for ${escapeHtml(eventTitle)}. Claim it within ${expiresHours} hours.`,
      content: `
<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.accent};text-align:center;">A Spot Opened Up!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};text-align:center;">
  Hi <strong style="color:${BRAND.text};">${escapeHtml(memberName)}</strong>, good news - a seat just opened up for
  <strong style="color:${BRAND.text};">${escapeHtml(eventTitle)}</strong> and you're next on the waitlist.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:17px;font-weight:600;color:${BRAND.text};">${escapeHtml(eventTitle)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${data.eventDate ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${escapeHtml(data.eventDate)}</td></tr>` : ""}
${data.eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${escapeHtml(data.eventTime)}</td></tr>` : ""}
</table>
</td></tr>
</table>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};text-align:center;">
  Claim your spot within <strong style="color:${BRAND.text};">${expiresHours} hours</strong> before it's offered to the next member on the list.
</p>
${ctaButton("Claim My Spot", claimUrl)}
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};text-align:center;">
  If the button doesn't work, paste this link into your browser:<br />
  <span style="color:${BRAND.textSecondary};word-break:break-all;">${escapeHtml(claimUrl)}</span>
</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};text-align:center;">
  Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a>
</p>`,
    }),
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
    html: baseLayout({
      title: `Thanks for Joining Us at ${data.eventName}`,
      previewText: `Thanks for coming to ${data.eventName}! We hope you had a great time.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong> with us! We hope you had a great time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You were invited by <strong>${data.memberName}</strong> - shout out to them for bringing you along.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Loved it? Join 704 Collective and get free access to all our events, plus a community of young professionals in Charlotte.</p>
${ctaButton("Become a Member", "https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04")}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>`,
    }),
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
    html: baseLayout({
      title: `Thanks for Joining Us at ${data.eventName}`,
      previewText: `Thanks for coming to ${data.eventName}! We hope you had an amazing time.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong>! We hope you had an amazing time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Want to skip the ticket line next time? Members get <strong>free access to all events</strong>, plus you'll be part of Charlotte's best community for young professionals.</p>
${ctaButton("Become a Member", "https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04")}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>`,
    }),
  };
}

function welcomeSetupTemplate(data: { name: string; setupLink: string; calendarUrl?: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin || "#";
  return {
    subject: "You're in. Let's get you set up.",
    html: baseLayout({
      title: "Welcome to 704 Collective - Set Up Your Account",
      previewText: "Welcome to 704 Collective. Set up your account to RSVP to events and connect with members.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective. You just joined a room full of people who are actually worth knowing in Charlotte.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">First thing - set up your account so you can RSVP to events, get your member QR code, and see who else is in here.</p>
${ctaButton("Set Up Your Account", data.setupLink)}
<p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour, so handle it now.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Once you're in:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Browse upcoming events and grab your spot</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Subscribe to the member calendar</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">-> Fill out your profile so people know who you are</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you need anything, reply to this email. A real person reads it.</p>`,
    }),
  };
}

function adminInviteTemplate(data: { name: string; setupLink?: string | null; loginUrl?: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const hasSetupLink = !!data.setupLink;
  const base = data.origin || data.loginUrl;

  if (hasSetupLink) {
    return {
      subject: "You've been invited as an admin on 704 Collective",
      html: baseLayout({
        title: "Admin Invitation - 704 Collective",
        previewText: "You've been invited as an admin for 704 Collective. Set up your account to get started.",
        content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been invited as an admin for 704 Collective. Set up your account to access the admin dashboard where you can manage events, members, and more.</p>
${ctaButton("Set Up Your Account", data.setupLink!)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Once you've set your password, you can access the admin dashboard at any time.</p>`,
      }),
    };
  }

  if (!data.loginUrl) throw new Error("[admin-invite] loginUrl is required but was not provided. Check that the frontend passes origin in the request body.");
  const dashboardUrl = data.loginUrl;
  return {
    subject: "You've been made an admin on 704 Collective",
    html: baseLayout({
      title: "Admin Access - 704 Collective",
      previewText: "You've been given admin access to 704 Collective.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been given admin access to 704 Collective. You can now manage events, members, and more from the admin dashboard.</p>
${ctaButton("Go to Admin Dashboard", dashboardUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Just log in with your existing account and you'll see the admin panel.</p>`,
    }),
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
    subject: `&#128197; Schedule Change: ${data.eventName}`,
    html: baseLayout({
      title: `Schedule Change: ${data.eventName}`,
      previewText: `Heads up: ${data.eventName} has been rescheduled. See the new date inside.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Heads up - <strong>${data.eventName}</strong> has been rescheduled.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.textMuted};">Updated Schedule</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textMuted};text-decoration:line-through;">&#128197;&nbsp;&nbsp;${data.oldDate} at ${data.oldTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.accent};font-weight:600;">&#128197;&nbsp;&nbsp;${data.newDate} at ${data.newTime}</td></tr>
${data.newLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${data.newLocation}</td></tr>` : ""}
</table>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your RSVP is still confirmed - no action needed unless the new time doesn't work for you.</p>
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Can't make it anymore? You can cancel your RSVP on the event page.</p>`,
    }),
  };
}

function hubAddedTemplate(data: { name: string; hubTitle: string; addedByName: string; hubUrl: string }): { subject: string; html: string } {
  return {
    subject: `You've been added to a hub: ${data.hubTitle}`,
    html: baseLayout({
      title: `Added to Hub: ${data.hubTitle}`,
      previewText: `${data.addedByName} added you to the hub: ${data.hubTitle}.`,
      content: `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">Welcome to the hub!</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.addedByName}</strong> has added you to the hub 
  <strong style="color:${BRAND.text};">${data.hubTitle}</strong> on the 704 Collective member portal.
  You can now view the hub feed, connect with members, and access shared resources.
</p>
${ctaButton("View Hub", data.hubUrl)}`,
    }),
  };
}

function newMessageTemplate(data: { name: string; senderName: string; messagesUrl: string }): { subject: string; html: string } {
  return {
    subject: `New message from ${data.senderName}`,
    html: baseLayout({
      title: `New Message from ${data.senderName}`,
      previewText: `${data.senderName} sent you a new message on the 704 Collective member portal.`,
      content: `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">You have a new message</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.senderName}</strong> sent you a message on the 704 Collective member portal.
</p>
${ctaButton("View Message", data.messagesUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You'll only receive this notification once per new conversation.</p>`,
    }),
  };
}

function feedMentionTemplate(data: { name: string; mentionerName: string; dashboardUrl: string }): { subject: string; html: string } {
  return {
    subject: `${data.mentionerName} mentioned you on 704 Collective`,
    html: baseLayout({
      title: `${data.mentionerName} Mentioned You`,
      previewText: `${data.mentionerName} mentioned you in a post on the member portal.`,
      content: `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.text};">You were mentioned</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.accent};">${data.mentionerName}</strong> mentioned you in a post on the member portal.
</p>
${ctaButton("Open your dashboard", data.dashboardUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This is a one-time email for this mention.</p>`,
    }),
  };
}

function partnerApplicationSubmittedTemplate(data: { name: string; companyName: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "We received your 704 Collective partner application",
    html: baseLayout({
      title: "Application Received - 704 Collective",
      previewText: `Thanks for applying to partner with 704 Collective as ${data.companyName}.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Thank you for applying to partner with 704 Collective as <strong style="color:${BRAND.text};">${data.companyName}</strong>.
  Our team is reviewing your application and will follow up soon.
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  If you have questions in the meantime, reply to this email or write to hello@704collective.com.
</p>
${ctaButton("Visit 704 Collective", base)}`,
    }),
  };
}

function partnerNewApplicationAdminTemplate(data: { companyName: string; applicantEmail: string }): { subject: string; html: string } {
  return {
    subject: `New partner application: ${data.companyName}`,
    html: baseLayout({
      title: `New Partner Application: ${data.companyName}`,
      previewText: `New partner application from ${data.companyName} (${data.applicantEmail}).`,
      content: `
<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.text};">New partner application</h2>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">Applicant email:</strong> ${data.applicantEmail}
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Review applications in the admin dashboard when partner tooling is enabled.</p>`,
    }),
  };
}

function partnerApplicationDeniedTemplate(data: { name: string; reason: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "Update on your 704 Collective partner application",
    html: baseLayout({
      title: "Update on Your Application - 704 Collective",
      previewText: "An update on your 704 Collective partner application.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Thank you for your interest in partnering with 704 Collective. After review, we&apos;re not able to move forward with this application at this time.
</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.reason}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">If you have questions, you can reach us at hello@704collective.com.</p>
${ctaButton("Visit 704 Collective", base)}`,
    }),
  };
}

function partnerWelcomeInviteTemplate(data: { name: string; dashboardUrl: string; origin?: string }): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "You're approved - welcome to 704 Collective partners",
    html: baseLayout({
      title: "Welcome to 704 Collective Partners",
      previewText: `Your partner invitation has been accepted. Welcome, ${data.name}!`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Your partner invitation has been accepted. You're approved to collaborate with 704 Collective - we're excited to build with you in Charlotte.
</p>
${ctaButton("Go to your dashboard", data.dashboardUrl)}
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Log in with the email and password you used to apply.</p>`,
    }),
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
    html: baseLayout({
      title: `Partner Inquiry: ${data.companyName}`,
      previewText: `New partner event inquiry from ${data.companyName} (${data.inquiryType}).`,
      content: `
<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${BRAND.text};">New partner event inquiry</h2>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Contact:</strong> ${data.partnerName} &lt;${data.partnerEmail}&gt;</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Type:</strong> ${data.inquiryType}</p>
<p style="margin:0 0 20px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Event:</strong> ${data.eventLabel}</p>
<div style="font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">${data.bodyHtml}</div>`,
    }),
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
    html: baseLayout({
      title: "Reply to Your Inquiry - 704 Collective",
      previewText: "The team sent a new message on your event inquiry thread.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">The team sent a new message on your event inquiry thread.</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("View thread", data.inquiriesUrl)}`,
    }),
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
    html: baseLayout({
      title: `Partner Message: ${data.partnerCompany}`,
      previewText: `${data.partnerCompany} started a conversation with the 704 Collective team.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.superAdminName},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">${data.partnerCompany}</strong> (${data.partnerName}, ${data.partnerEmail}) started a conversation with the 704 Collective team.
</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("Open admin portal", data.adminUrl)}
<p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">This is a one-time email for the first message in this thread. Further replies appear only in the portal.</p>`,
    }),
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
    html: baseLayout({
      title: "704 Collective Replied to Your Message",
      previewText: "704 Collective replied to your message.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hi ${data.name},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">The team sent a new message.</p>
<p style="margin:0 0 24px;padding:16px;border-radius:8px;background:${BRAND.color};border:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textSecondary};white-space:pre-wrap;">${data.preview}</p>
${ctaButton("Open messages", data.messagesUrl)}`,
    }),
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
    html: baseLayout({
      title: `Account Deletion Request: ${data.companyName}`,
      previewText: `Account deletion request received from ${data.companyName}.`,
      content: `
<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${BRAND.text};">Account deletion requested</h2>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};">A partner requested account deletion from the partner portal (confirmation matched company name).</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">User ID:</strong> ${data.userId}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Email:</strong> ${data.email}</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Name:</strong> ${data.fullName}</p>
<p style="margin:0 0 0;font-size:14px;color:${BRAND.textSecondary};"><strong style="color:${BRAND.text};">Company:</strong> ${data.companyName}</p>`,
    }),
  };
}

function socialSignupConfirmationTemplate(data: { name: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  const base = data.origin ?? "https://704collective.com";
  return {
    subject: "You're signed up - confirm your email | 704 Collective",
    html: baseLayout({
      title: "Confirm Your Email - 704 Collective",
      previewText: "Thanks for signing up - check your inbox to confirm your email address.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for creating your 704 Collective account. Use the confirmation link in your inbox to verify your email and continue.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textMuted};">Questions? hello@704collective.com</p>`,
    }),
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
    html: baseLayout({
      title: "Business Application Received - 704 Collective",
      previewText: `Thanks for applying to 704 Business for ${data.company}. Our team will be in touch.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for applying to <strong style="color:${BRAND.text};">704 Business</strong> for <strong>${data.company}</strong>. Our team will review your application and follow up by email.</p>
${ctaButton("Visit 704 Collective", base)}`,
    }),
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
    html: baseLayout({
      title: `New Business Application: ${data.company}`,
      previewText: `New 704 Business application from ${data.company} (${data.applicantEmail}).`,
      content: `
<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:${BRAND.text};">New business application</p>
<p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};"><strong>Company:</strong> ${data.company}</p>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.textSecondary};"><strong>Email:</strong> ${data.applicantEmail}</p>
${ctaButton("Review in admin", data.adminPanelUrl)}`,
    }),
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
    subject: "You're in - welcome to 704 Business",
    html: baseLayout({
      title: "Welcome to 704 Business",
      previewText: `Welcome, ${data.firstName}. Your 704 Business application has been approved.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Welcome to 704 Business, ${data.firstName}.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your application has been approved. Log in to your member portal for meetings, workshops, introductions, and full community access.</p>
${credit}
${ctaButton("Go to my portal", `${base}/dashboard`)}`,
    }),
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
    : "You've been added to our waitlist - 704 Business";
  const reasonBlock = data.reason
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};"><strong>Note from our team:</strong> ${escapeHtml(data.reason)}</p>`
    : "";
  const body = isDenied
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thank you for applying to 704 Business. After reviewing your application, we've decided not to move forward at this time.</p>
${reasonBlock}
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You're welcome to join as a Social member while you stay connected to the community.</p>
${ctaButton("Join Social - $49/mo", `${base}/join/checkout?email=${encodeURIComponent(data.checkoutEmail)}`)}`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thank you for applying to 704 Business. We've added you to our waitlist and will reach out when a spot opens.</p>
${reasonBlock}
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">In the meantime, you're welcome to join as a Social member.</p>
${ctaButton("Join Social - $49/mo", `${base}/join/checkout?email=${encodeURIComponent(data.checkoutEmail)}`)}`;
  return {
    subject,
    html: baseLayout({
      title: isDenied ? "Your 704 Business Application" : "You've Been Added to Our Waitlist",
      previewText: isDenied
        ? "Your 704 Business application decision."
        : "You've been added to the 704 Business waitlist.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.firstName},</p>
${body}`,
    }),
  };
}

function welcomeOnboardingCompleteTemplate(data: {
  name: string;
  calendarUrl: string;
  dashboardUrl: string;
  email?: string;
  origin?: string;
}): { subject: string; html: string } {
  const base = data.origin ?? "https://704collective.com";
  // Link to a pre-filled login page so users who click this email in a new
  // browser context (common when the original session has expired) land on
  // sign-in rather than a generic logged-out page.
  const ctaUrl = data.email
    ? `${base}/login?email=${encodeURIComponent(data.email)}&next=%2Fdashboard`
    : data.dashboardUrl;
  return {
    subject: "You're all set - welcome to 704 Collective",
    html: baseLayout({
      title: "You're All Set - 704 Collective",
      previewText: `Hey ${data.name}! You've finished onboarding. Welcome to 704 Collective.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${data.name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've finished onboarding. Head to your dashboard for events, messages, and your member calendar.</p>
${ctaButton("Open your dashboard", ctaUrl)}
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Add events to your calendar: <a href="${data.calendarUrl}" style="color:${BRAND.accent};word-break:break-all;">Subscribe</a></p>`,
    }),
  };
}

// ── template router ──────────────────────────────────────────────────────


// ─── Ambassador Program Templates ────────────────────────────────────────────

function ambassadorReferralReceivedTemplate(data: {
  ambassadorName: string;
  referredName: string;
  tier: string;
  code: string;
  rewardDollars: string;
  status: string;
  leaderboardUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const name = escapeHtml(data.ambassadorName || "Ambassador");
  const referred = escapeHtml(data.referredName || "Someone");
  const tier = escapeHtml(data.tier || "social");
  const code = escapeHtml(data.code || "");
  const reward = escapeHtml(data.rewardDollars || "0.00");
  const isAutoApproved = data.status === "auto_approved";
  const leaderboardUrl = data.leaderboardUrl || "https://704collective.com/ambassadors/leaderboard";

  return {
    subject: `New referral! ${data.referredName} just joined 704 Collective`,
    html: baseLayout({
      title: `New Referral: ${data.referredName}`,
      previewText: `${data.referredName} just signed up using your referral code. You earned $${data.rewardDollars}!`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Great news! <strong style="color:${BRAND.text};">${referred}</strong> just signed up for 
  <strong>${tier}</strong> membership using your referral code 
  <strong style="color:${BRAND.accent};font-family:ui-monospace,SFMono-Regular,monospace;">${code}</strong>.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.08em;">Reward Earned</p>
  <p style="margin:0;font-size:30px;font-weight:700;color:${BRAND.accent};">$${reward}</p>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  ${isAutoApproved
    ? "&#10003; This referral has been automatically approved and your payout is being processed."
    : "&#8987; This referral is being reviewed by our team. We&#39;ll notify you when it&#39;s approved - typically within 24 hours."}
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Track all your referrals at any time on the leaderboard:
</p>
${ctaButton("View Leaderboard", leaderboardUrl)}
<p style="margin:24px 0 0;font-size:14px;color:${BRAND.textMuted};">Thanks for being a 704 Collective ambassador!</p>`,
    }),
  };
}

function ambassadorPayoutSentTemplate(data: {
  ambassadorName: string;
  amountDollars: string;
  transferId: string;
  totalPaidDollars: string;
}): { subject: string; html: string } {
  const name = escapeHtml(data.ambassadorName || "Ambassador");
  const amount = escapeHtml(data.amountDollars || "0.00");
  const transferId = escapeHtml(data.transferId || "");
  const totalPaid = escapeHtml(data.totalPaidDollars || "0.00");

  return {
    subject: `Payout sent: $${data.amountDollars} from 704 Collective`,
    html: baseLayout({
      title: `Payout Sent: $${data.amountDollars}`,
      previewText: `Your $${data.amountDollars} referral reward has been sent to your bank account.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Your referral reward has been sent to your bank account.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.08em;">Amount Sent</p>
  <p style="margin:0 0 18px;font-size:30px;font-weight:700;color:${BRAND.accent};">$${amount}</p>
  <p style="margin:0 0 6px;font-size:13px;color:${BRAND.textMuted};">Transfer ID: <span style="font-family:ui-monospace,SFMono-Regular,monospace;">${transferId}</span></p>
  <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">Total paid out to date: <strong style="color:${BRAND.textSecondary};">$${totalPaid}</strong></p>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Stripe ACH transfers typically process in 2 business days.
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Thanks for spreading the word!</p>`,
    }),
  };
}

function ambassadorAdminNotificationTemplate(data: {
  ambassadorName: string;
  code: string;
  referredName: string;
  referredEmail: string;
  tier: string;
  rewardDollars: string;
  status: string;
  adminQueueUrl: string;
}): { subject: string; html: string } {
  const ambName = escapeHtml(data.ambassadorName || "");
  const code = escapeHtml(data.code || "");
  const refName = escapeHtml(data.referredName || "");
  const refEmail = escapeHtml(data.referredEmail || "");
  const tier = escapeHtml(data.tier || "social");
  const reward = escapeHtml(data.rewardDollars || "0.00");
  const status = escapeHtml(data.status || "pending");
  const needsAction = data.status === "pending" || data.status.startsWith("flagged_");
  const adminUrl = data.adminQueueUrl || "https://704collective.com/admin/ambassadors";

  return {
    subject: `Ambassador referral: ${data.ambassadorName} \u2192 ${data.referredName}`,
    html: baseLayout({
      title: `Ambassador Referral: ${data.ambassadorName} → ${data.referredName}`,
      previewText: `${data.ambassadorName} referred ${data.referredName} for ${data.tier} membership.`,
      content: `
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">${ambName}</strong>
  (<span style="font-family:ui-monospace,SFMono-Regular,monospace;color:${BRAND.accent};">${code}</span>)
  just referred <strong style="color:${BRAND.text};">${refName}</strong>
  (${refEmail}) for <strong>${tier}</strong> membership.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:16px 24px;">
  <p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};">Reward: <strong style="color:${BRAND.accent};">$${reward}</strong></p>
  <p style="margin:0;font-size:14px;color:${BRAND.textSecondary};">Status: <strong>${status}</strong></p>
</td></tr>
</table>
${needsAction
  ? `<p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f87171;">ACTION REQUIRED - This referral needs review before payout.</p>${ctaButton("Review in Admin", adminUrl)}`
  : `<p style="margin:0 0 16px;font-size:15px;color:${BRAND.textSecondary};">&#10003; No action required - auto-approved.</p>`}
<p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">Sent automatically by the ambassador system.</p>`,
    }),
  };
}

function ambassadorOnboardingInviteTemplate(data: {
  name: string;
  onboardingUrl: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || 'Ambassador').split(' ')[0]);
  const url = data.onboardingUrl || '';
  return {
    subject: 'Set up your 704 Collective ambassador payout account',
    html: baseLayout({
      title: "Set Up Your Ambassador Payout Account",
      previewText: "Complete your Stripe Connect setup to receive weekly referral payouts from 704 Collective.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${firstName},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  You're set up as a 704 Collective ambassador. To receive payouts when your referrals convert,
  please complete your Stripe Connect setup using the button below.
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  This link expires after a few days, so set it up soon - you can always reach out to us if
  you need a fresh one.
</p>
${ctaButton('Complete Stripe Setup', url)}
<p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">
  If the button above doesn't work, copy and paste this link into your browser:<br/>
  <span style="font-family:ui-monospace,SFMono-Regular,monospace;word-break:break-all;">${escapeHtml(url)}</span>
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Thanks for being part of 704 Collective! - The 704 Team</p>`,
    }),
  };
}

function ambassadorWeeklyPayoutTemplate(data: {
  name: string;
  totalCents: number;
  conversionCount: number;
  conversions: Array<{
    refereeName: string;
    refereeEmail: string;
    date: string;
    amountCents: number;
  }>;
  transferArrivalEstimate: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || 'Ambassador').split(' ')[0]);
  const totalDollars = (Number(data.totalCents || 0) / 100).toFixed(2);
  const count = Number(data.conversionCount || 0);
  const arrival = escapeHtml(data.transferArrivalEstimate || 'within 2 business days');
  const conversions = Array.isArray(data.conversions) ? data.conversions as Array<{
    refereeName: string; refereeEmail: string; date: string; amountCents: number;
  }> : [];

  const rows = conversions.map((c) => `
    <tr>
      <td style="padding:10px 12px;font-size:13px;color:${BRAND.textSecondary};border-bottom:1px solid ${BRAND.border};">${escapeHtml(c.date || '')}</td>
      <td style="padding:10px 12px;font-size:13px;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};">${escapeHtml(c.refereeName || '')}</td>
      <td style="padding:10px 12px;font-size:13px;color:${BRAND.textMuted};border-bottom:1px solid ${BRAND.border};">${escapeHtml(c.refereeEmail || '')}</td>
      <td style="padding:10px 12px;font-size:13px;color:${BRAND.accent};text-align:right;border-bottom:1px solid ${BRAND.border};font-weight:600;">$${(Number(c.amountCents || 0) / 100).toFixed(2)}</td>
    </tr>`).join('');

  return {
    subject: `You earned $${totalDollars} this week from 704 Collective referrals`,
    html: baseLayout({
      title: `You Earned $${totalDollars} This Week`,
      previewText: `You earned $${totalDollars} from ${count} referral conversion${count !== 1 ? 's' : ''} this week.`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${firstName},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Great news! You earned <strong style="color:${BRAND.text};">$${totalDollars}</strong> this week from
  <strong style="color:${BRAND.text};">${count} referral conversion${count !== 1 ? 's' : ''}</strong>.
  Your funds will arrive in your bank account <strong style="color:${BRAND.text};">${arrival}</strong>.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 28px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid ${BRAND.border};overflow:hidden;">
  <thead>
    <tr style="background:rgba(255,255,255,0.05);">
      <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.06em;text-align:left;border-bottom:1px solid ${BRAND.border};">Date</th>
      <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.06em;text-align:left;border-bottom:1px solid ${BRAND.border};">Member</th>
      <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.06em;text-align:left;border-bottom:1px solid ${BRAND.border};">Email</th>
      <th style="padding:10px 12px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.06em;text-align:right;border-bottom:1px solid ${BRAND.border};">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Thanks for being part of the 704 Collective ambassador program! Keep referring great people and
  we'll keep paying you out every week.
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">- The 704 Team</p>`,
    }),
  };
}

function ambassadorWelcomeNewTemplate(data: {
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || 'Ambassador').split(' ')[0]);
  const email = escapeHtml(data.email || '');
  const pwd = escapeHtml(data.tempPassword || '');
  const url = data.loginUrl || '';
  return {
    subject: 'Welcome to the 704 Collective Ambassador Program',
    html: baseLayout({
      title: "Welcome to the 704 Collective Ambassador Program",
      previewText: "You've been invited to the 704 Collective Ambassador Program. Here's your login info.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${firstName},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  You've been invited to join the <strong style="color:${BRAND.text};">704 Collective Ambassador Program</strong>!
  Here's how to access your dashboard:
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.04);border:1px solid ${BRAND.border};border-radius:10px;">
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid ${BRAND.border};">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${BRAND.textMuted};">Email</span><br/>
      <span style="font-size:14px;color:${BRAND.text};font-family:ui-monospace,SFMono-Regular,monospace;">${email}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${BRAND.textMuted};">Temporary Password</span><br/>
      <span style="font-size:14px;color:${BRAND.accent};font-family:ui-monospace,SFMono-Regular,monospace;font-weight:700;">${pwd}</span>
    </td>
  </tr>
</table>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">
  Please change your password after your first login for security.
</p>
${ctaButton('Log In to Your Dashboard', url)}
<p style="margin:24px 0 0;font-size:14px;line-height:1.65;color:${BRAND.textSecondary};">
  Once logged in, you'll set up your Stripe Connect account so we can send you weekly payouts when your referrals convert.
</p>
<p style="margin:24px 0 0;font-size:14px;color:${BRAND.textMuted};">- The 704 Team</p>`,
    }),
  };
}

function ambassadorWelcomeExistingTemplate(data: {
  name: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || 'Ambassador').split(' ')[0]);
  const url = data.loginUrl || '';
  return {
    subject: "You're now a 704 Collective Ambassador",
    html: baseLayout({
      title: "You're Now a 704 Collective Ambassador",
      previewText: "You're now a 704 Collective Ambassador. Log in to your dashboard to get started.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${firstName},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Welcome to the <strong style="color:${BRAND.text};">704 Collective Ambassador Program</strong>!
  Since you already have a 704 account, you can log in to your ambassador dashboard with your existing credentials.
</p>
${ctaButton('Go to Ambassador Dashboard', url)}
<p style="margin:24px 0 0;font-size:14px;line-height:1.65;color:${BRAND.textSecondary};">
  You'll set up your Stripe Connect account on your first visit so we can send you weekly payouts when your referrals convert.
</p>
<p style="margin:24px 0 0;font-size:14px;color:${BRAND.textMuted};">- The 704 Team</p>`,
    }),
  };
}

function ambassadorInviteTemplate(data: { name: string; email: string; referralCode: string; inviteUrl: string }): { subject: string; html: string } {
  const name = data.name || 'there';
  return {
    subject: "You've been invited to the 704 Collective Ambassador Program",
    html: baseLayout({
      title: "You've Been Invited to the Ambassador Program",
      previewText: "You've been invited to the 704 Collective Ambassador Program. Earn weekly payouts for referrals.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been invited to join the <strong>704 Collective Ambassador Program</strong> - Charlotte's most curated social &amp; business network.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">As an ambassador, you'll earn:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:6px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<strong style="color:${BRAND.accent};">$20</strong> for every social member you refer</td></tr>
<tr><td style="padding:6px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;<strong style="color:${BRAND.accent};">$125</strong> for every business member you refer</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Payouts are deposited weekly to your bank account via Stripe.</p>
<div style="background:rgba(198,166,100,0.1);border:1px solid rgba(198,166,100,0.3);border-radius:8px;padding:16px 20px;margin:0 0 28px;">
<p style="margin:0;font-size:13px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.06em;">Your Referral Code</p>
<p style="margin:6px 0 0;font-size:24px;font-weight:700;color:${BRAND.accent};font-family:ui-monospace,SFMono-Regular,monospace;letter-spacing:0.06em;">${data.referralCode}</p>
</div>
<p style="margin:0 0 8px;font-size:15px;font-weight:600;color:${BRAND.text};">Click below to complete your account setup:</p>
${ctaButton('Set Up My Ambassador Account', data.inviteUrl)}
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};font-style:italic;">This invite expires in 7 days.</p>
<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Once you're set up, you'll get:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:5px 0;font-size:14px;color:${BRAND.textSecondary};">&rarr;&nbsp;A dashboard to track conversions and earnings</td></tr>
<tr><td style="padding:5px 0;font-size:14px;color:${BRAND.textSecondary};">&rarr;&nbsp;Marketing materials (QR code, share links)</td></tr>
<tr><td style="padding:5px 0;font-size:14px;color:${BRAND.textSecondary};">&rarr;&nbsp;Stripe Connect setup so we can pay you</td></tr>
</table>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">Questions? Reply to this email or reach out at <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a>.</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">- The 704 Team</p>`,
    }),
  };
}

function adminCustomTemplate(data: {
  recipientName: string;
  subject: string;
  bodyText: string;
  origin?: string;
}): { subject: string; html: string } {
  const name = escapeHtml(data.recipientName || "there");
  const safeBody = escapeHtml(data.bodyText || "");
  return {
    subject: data.subject,
    html: baseLayout({
      title: escapeHtml(data.subject),
      previewText: escapeHtml(data.subject),
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};white-space:pre-wrap;">${safeBody}</div>
<p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">- 704 Collective</p>`,
    }),
  };
}

// ── Helpers shared by the new batch-send templates ───────────────────────

function fmtDateTimeET(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateET(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtTimeET(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── New templates for the 10 batch-send functions ────────────────────────

function eventReminderRegisteredTemplate(data: {
  name: string; eventTitle: string; eventStartTime: string;
  locationName?: string | null; eventUrl: string; phrase: string; dayLabel: string;
}): { subject: string; html: string } {
  const name       = escapeHtml(data.name || "there");
  const eventTitle = escapeHtml(data.eventTitle || "the event");
  const phrase     = escapeHtml(data.phrase || "today");
  const dayLabel   = escapeHtml(data.dayLabel || "today");
  const formatted  = fmtDateTimeET(data.eventStartTime);
  return {
    subject: `You're registered for ${data.eventTitle} ${data.dayLabel}!`,
    html: baseLayout({
      title: `You're going ${data.dayLabel}!`,
      previewText: `Your reminder for ${data.eventTitle}`,
      content: `
<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.accent};">You're going ${dayLabel}!</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hey ${name}, just a reminder - you're registered for <strong style="color:${BRAND.text};">${eventTitle}</strong> ${phrase}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&#160;&#160;${formatted}</td></tr>
${data.locationName ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&#160;&#160;${escapeHtml(String(data.locationName))}</td></tr>` : ""}
</table>
</td></tr>
</table>
${ctaButton("View Event", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">See you there! - 704 Collective</p>`,
    }),
  };
}

function eventReminderJoinUsTemplate(data: {
  name: string; eventTitle: string; eventStartTime: string;
  locationName?: string | null; eventUrl: string; phrase: string; dayLabel: string;
}): { subject: string; html: string } {
  const name       = escapeHtml(data.name || "there");
  const eventTitle = escapeHtml(data.eventTitle || "the event");
  const phrase     = escapeHtml(data.phrase || "today");
  const dayLabel   = escapeHtml(data.dayLabel || "today");
  const formatted  = fmtDateTimeET(data.eventStartTime);
  return {
    subject: `Join us ${data.dayLabel} - ${data.eventTitle}`,
    html: baseLayout({
      title: `Join us ${data.dayLabel}!`,
      previewText: `${data.eventTitle} is coming up`,
      content: `
<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.accent};">Join us ${dayLabel}!</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hey ${name}, <strong style="color:${BRAND.text};">${eventTitle}</strong> is happening ${phrase}. RSVP now to secure your spot!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&#160;&#160;${formatted}</td></tr>
${data.locationName ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&#160;&#160;${escapeHtml(String(data.locationName))}</td></tr>` : ""}
</table>
</td></tr>
</table>
${ctaButton("RSVP Now", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Hope to see you there! - 704 Collective</p>`,
    }),
  };
}

function adminMessageToAttendeesTemplate(data: {
  adminMessage: string; eventTitle: string; eventUrl: string; senderName?: string;
}): { subject: string; html: string } {
  const safeMsg    = escapeHtml(data.adminMessage || "");
  const eventTitle = escapeHtml(data.eventTitle || "the event");
  const sender     = escapeHtml(data.senderName || "704 Collective");
  return {
    subject: `Message about ${data.eventTitle}`,
    html: baseLayout({
      title: `Message about ${data.eventTitle}`,
      previewText: `An update about ${data.eventTitle}`,
      content: `
<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.text};">A message from 704 Collective</h2>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Regarding <strong style="color:${BRAND.text};">${eventTitle}</strong>:</p>
<div style="margin:0 0 24px;padding:20px 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};font-size:15px;line-height:1.7;color:${BRAND.textSecondary};white-space:pre-wrap;">${safeMsg}</div>
${ctaButton("View Event", data.eventUrl)}
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};">- ${sender}</p>`,
    }),
  };
}

function attendeeListSummaryTemplate(data: {
  eventTitle: string; eventStartTime: string;
  attendees: Array<{ name: string; email: string; isGuest: boolean }>;
}): { subject: string; html: string } {
  const eventTitle = escapeHtml(data.eventTitle || "Event");
  const formatted  = fmtDateTimeET(data.eventStartTime);
  const list       = data.attendees || [];
  const count      = list.length;
  const rows = list.map(a =>
    `<tr>
<td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};">${escapeHtml(a.name || "")}</td>
<td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.textMuted};">${escapeHtml(a.email || "")}</td>
<td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:12px;color:${BRAND.textMuted};">${a.isGuest ? "Guest" : "Member"}</td>
</tr>`
  ).join("");
  return {
    subject: `Attendee list for ${data.eventTitle}`,
    html: baseLayout({
      title: `Attendee List: ${data.eventTitle}`,
      previewText: `${count} attendee${count !== 1 ? "s" : ""} for ${data.eventTitle}`,
      content: `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${BRAND.accent};">Attendee List</h2>
<h3 style="margin:0 0 16px;font-size:17px;font-weight:600;color:${BRAND.text};">${eventTitle}</h3>
<p style="margin:0 0 4px;font-size:15px;color:${BRAND.textSecondary};">&#128197;&#160;&#160;${formatted}</p>
<p style="margin:0 0 20px;font-size:15px;font-weight:600;color:${BRAND.accent};">${count} total RSVP${count !== 1 ? "s" : ""}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${BRAND.surface};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};">
<thead><tr style="background:rgba(255,255,255,0.05);">
<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${BRAND.accent};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${BRAND.border};">Name</th>
<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${BRAND.accent};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${BRAND.border};">Email</th>
<th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${BRAND.accent};text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${BRAND.border};">Type</th>
</tr></thead>
<tbody>${rows || `<tr><td colspan="3" style="padding:16px;color:${BRAND.textMuted};text-align:center;font-size:14px;">No attendees yet</td></tr>`}</tbody>
</table>
<p style="margin:20px 0 0;font-size:13px;color:${BRAND.textMuted};">Sent automatically 60 minutes before the event.</p>`,
    }),
  };
}

function bulkSetupReminderTemplate(data: { name: string; setupLink: string }): { subject: string; html: string } {
  const name = escapeHtml(data.name || "there");
  return {
    subject: "Complete your 704 Collective profile",
    html: baseLayout({
      title: "Set Up Your 704 Collective Account",
      previewText: "Action needed: set up your account to access your membership.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Collective membership is ready. Click below to create your password and get full access to events, the member directory, and your community portal.</p>
${ctaButton("Set Up Your Account", data.setupLink)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If it's expired, you can request a new one from the setup page.</p>`,
    }),
  };
}

function businessProfileReminderTemplate(data: { name: string; companyName?: string; portalUrl: string }): { subject: string; html: string } {
  const name    = escapeHtml(data.name || "there");
  const company = data.companyName ? ` for ${escapeHtml(data.companyName)}` : "";
  return {
    subject: "Complete your business profile",
    html: baseLayout({
      title: "Complete Your Business Profile",
      previewText: "Your business profile is incomplete - other members can't find you yet.",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Business profile${company} is missing a few required fields. Until it's complete, other members won't be able to find or connect with you in the directory.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Head to the business portal to add your headshot, company details, title, and bio.</p>
${ctaButton("Go to Business Portal", data.portalUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Reach out at <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>`,
    }),
  };
}

function guestEventMatchTemplate(data: {
  guestName: string; eventTitle: string; eventStartTime: string; eventUrl: string;
}): { subject: string; html: string } {
  const firstName  = escapeHtml(data.guestName || "");
  const eventTitle = escapeHtml(data.eventTitle || "an event");
  const formatted  = fmtDateTimeET(data.eventStartTime);
  return {
    subject: `${data.eventTitle} might be a fit for you`,
    html: baseLayout({
      title: "A New Event for You",
      previewText: `${data.eventTitle} happening soon`,
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey${firstName ? ` ${firstName}` : ""}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">A new event is coming up at 704 Collective and we thought you'd want to know about it.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 10px;font-size:17px;font-weight:600;color:${BRAND.text};">${eventTitle}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&#160;&#160;${formatted}</td></tr>
</table>
</td></tr>
</table>
${ctaButton("View All Events", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You're receiving this because you attended a past 704 Collective event as a guest. Questions? <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>`,
    }),
  };
}

function eventChangeNotificationTemplate(data: {
  name: string; eventTitle: string; eventUrl: string; changeMessage: string;
  newStartTime?: string; newLocation?: string;
}): { subject: string; html: string } {
  const name        = escapeHtml(data.name || "there");
  const eventTitle  = escapeHtml(data.eventTitle || "the event");
  const safeMsg     = escapeHtml(data.changeMessage || "");
  const newDetails  = [
    data.newStartTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.accent};font-weight:600;">&#128197;&#160;&#160;${fmtDateTimeET(data.newStartTime)}</td></tr>` : "",
    data.newLocation  ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&#160;&#160;${escapeHtml(data.newLocation)}</td></tr>` : "",
  ].filter(Boolean).join("");
  return {
    subject: `Update: ${data.eventTitle}`,
    html: baseLayout({
      title: `Event Update: ${data.eventTitle}`,
      previewText: `Important update about ${data.eventTitle}`,
      content: `
<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};">Event update</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hey ${name}, there's an update for <strong style="color:${BRAND.text};">${eventTitle}</strong>:</p>
<div style="margin:0 0 24px;padding:20px 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};font-size:15px;line-height:1.7;color:${BRAND.textSecondary};white-space:pre-wrap;">${safeMsg}</div>
${newDetails ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};"><tr><td style="padding:20px 24px;"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.textMuted};">Updated details</p><table role="presentation" cellpadding="0" cellspacing="0">${newDetails}</table></td></tr></table>` : ""}
${ctaButton("View Event", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Your RSVP is still confirmed unless you cancel on the event page.</p>`,
    }),
  };
}

function adminInviteLinkTemplate(data: { name: string; inviteUrl: string; senderName?: string }): { subject: string; html: string } {
  const name = escapeHtml(data.name || "there");
  return {
    subject: "You're invited to 704 Collective",
    html: baseLayout({
      title: "You're Invited to 704 Collective",
      previewText: "Welcome to 704 Collective",
      content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You've been invited to join <strong style="color:${BRAND.text};">704 Collective</strong> as an admin. Use the button below to set up your account and access the admin dashboard.</p>
${ctaButton("Accept Invite", data.inviteUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you did not expect this invitation, you can safely ignore this email.</p>`,
    }),
  };
}

function campaignBroadcastTemplate(data: { subject: string; bodyHtml: string; previewText?: string }): { subject: string; html: string } {
  // Campaigns render their own complete HTML (including logo, footer, layout).
  // This template is a pass-through so campaign HTML is routed via the
  // centralized render endpoint without double-wrapping in baseLayout.
  return {
    subject: data.subject,
    html: data.bodyHtml,
  };
}


function reEngagementTemplate(data: {
  name: string;
  isBusiness?: boolean;
  events?: Array<{ title: string; dateLabel: string; locationName?: string | null }>;
  origin?: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || "there").split(" ")[0]);
  const base = data.origin || "https://704collective.com";
  const events = Array.isArray(data.events) ? data.events : [];

  const eventRows = events.map((ev) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 12px;"><tr><td style="padding:0 0 12px;border-bottom:1px solid rgba(0,0,0,0.06);"><strong style="font-size:15px;color:#1A1A1A;">${escapeHtml(ev.title || "")}</strong><br/><span style="font-size:14px;color:#6b7280;">${escapeHtml(ev.dateLabel || "")}${ev.locationName ? " - " + escapeHtml(String(ev.locationName)) : ""}</span></td></tr></table>`
  ).join("");

  const teaser = events.length > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0;background-color:rgba(0,0,0,0.03);border-radius:8px;border:1px solid rgba(0,0,0,0.08);"><tr><td style="padding:20px 24px;"><p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#1A1A1A;">Upcoming Events</p>${eventRows}<a href="${base}/events" style="display:inline-block;margin-top:4px;font-size:15px;font-weight:600;color:#C6A664;text-decoration:none;">View all events</a></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="background-color:#C6A664;border-radius:8px;"><a href="${base}/events" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;">See What's Coming Up</a></td></tr></table>`;

  const businessLine = data.isBusiness
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2E2E2E;">As a Business member, you also have access to exclusive networking events and the business portal. <a href="${base}/business" style="color:#C6A664;font-weight:600;">Check it out</a></p>`
    : "";

  return {
    subject: `We miss you, ${firstName}`,
    html: baseLayout({
      theme: "light",
      title: "We miss you at 704 Collective",
      previewText: "It has been a while - here is what is coming up at 704 Collective.",
      content: `
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1A1A1A;">Hey ${firstName}, it's been a while!</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#2E2E2E;">We noticed you haven't been to an event in a bit - and we miss seeing you around. 704 Collective is all about real connections in Charlotte, and there's always something worth showing up for.</p>
${teaser}
${businessLine}
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#2E2E2E;">Questions or feedback? Email us directly at <a href="mailto:hello@704collective.com" style="color:#C6A664;">hello@704collective.com</a> - we read everything.</p>
<p style="margin:16px 0 0;font-size:14px;color:#6b7280;">- The 704 Collective Team</p>`,
    }),
  };
}

function dripStepTemplate(data: {
  subject?: string;
  bodyHtml?: string;
}): { subject: string; html: string } {
  const subject = data.subject || "A note from 704 Collective";
  const body = data.bodyHtml || "";
  return {
    subject,
    html: baseLayout({
      theme: "light",
      title: subject,
      previewText: subject,
      content: body,
    }),
  };
}

function renewalReminder7Template(data: { name?: string; isBusiness?: boolean; renewDate?: string; origin?: string }): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || "there").split(" ")[0]);
  const base = data.origin || "https://704collective.com";
  const tier = data.isBusiness ? "Business" : "Social";
  const when = escapeHtml(data.renewDate || "soon");
  return {
    subject: "Your 704 Collective membership renews in 7 days",
    html: baseLayout({
      theme: "light",
      title: "Your membership renews in 7 days",
      previewText: "A quick heads-up about your upcoming renewal.",
      content: `
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1A1A1A;">Hey ${firstName},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2E2E2E;">Just a heads-up - your 704 Collective ${tier} membership renews on <strong>${when}</strong>.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#2E2E2E;">No action needed if everything looks good. Want to update your payment method or review your plan? You can manage everything from your settings.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="background-color:#C6A664;border-radius:8px;"><a href="${base}/dashboard/settings" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;">Manage My Membership</a></td></tr></table>
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#2E2E2E;">Questions? Email us at <a href="mailto:hello@704collective.com" style="color:#C6A664;">hello@704collective.com</a> - we read everything.</p>
<p style="margin:16px 0 0;font-size:14px;color:#6b7280;">- The 704 Collective Team</p>`,
    }),
  };
}

function renewalReminder1Template(data: { name?: string; isBusiness?: boolean; renewDate?: string; origin?: string }): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || "there").split(" ")[0]);
  const base = data.origin || "https://704collective.com";
  const tier = data.isBusiness ? "Business" : "Social";
  return {
    subject: "Your 704 Collective membership renews tomorrow",
    html: baseLayout({
      theme: "light",
      title: "Your membership renews tomorrow",
      previewText: "Your renewal is tomorrow - here if you need anything.",
      content: `
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1A1A1A;">Hey ${firstName},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2E2E2E;">Your 704 Collective ${tier} membership renews <strong>tomorrow</strong>.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#2E2E2E;">If you need to make any changes, now's the time - you can manage your plan and payment method from your settings.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="background-color:#C6A664;border-radius:8px;"><a href="${base}/dashboard/settings" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;">Manage My Membership</a></td></tr></table>
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#2E2E2E;">Questions? Email us at <a href="mailto:hello@704collective.com" style="color:#C6A664;">hello@704collective.com</a> - we read everything.</p>
<p style="margin:16px 0 0;font-size:14px;color:#6b7280;">- The 704 Collective Team</p>`,
    }),
  };
}

function renewalLapseTemplate(data: { name?: string; isBusiness?: boolean; origin?: string }): { subject: string; html: string } {
  const firstName = escapeHtml((data.name || "there").split(" ")[0]);
  const base = data.origin || "https://704collective.com";
  const tier = data.isBusiness ? "Business" : "Social";
  return {
    subject: "Your 704 Collective membership has expired",
    html: baseLayout({
      theme: "light",
      title: "Your membership has expired",
      previewText: "Your membership lapsed - it's easy to come back.",
      content: `
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1A1A1A;">Hey ${firstName},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2E2E2E;">Your 704 Collective ${tier} membership has expired. We'd love to have you back - Charlotte's better with your people around.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#2E2E2E;">You can renew anytime from your settings, and you'll be right back to events, the member directory, and the community.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="background-color:#C6A664;border-radius:8px;"><a href="${base}/dashboard/settings" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;">Renew My Membership</a></td></tr></table>
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#2E2E2E;">Questions or want to talk through options? Email us at <a href="mailto:hello@704collective.com" style="color:#C6A664;">hello@704collective.com</a> - we read everything.</p>
<p style="margin:16px 0 0;font-size:14px;color:#6b7280;">- The 704 Collective Team</p>`,
    }),
  };
}

function discussionOpenTemplate(data: {
  name: string; eventTitle: string; eventStartTime: string;
  locationName?: string | null; discussionUrl: string;
}): { subject: string; html: string } {
  const name       = escapeHtml(data.name || "there");
  const eventTitle = escapeHtml(data.eventTitle || "your event");
  const formatted  = fmtDateTimeET(data.eventStartTime);
  return {
    subject: `The discussion for ${data.eventTitle} is open!`,
    html: baseLayout({
      title: "Event discussion is open",
      previewText: `Everyone going to ${data.eventTitle} is talking — hop in!`,
      content: `
<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.accent};">The conversation has started</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Hey ${name}, the discussion for <strong style="color:${BRAND.text};">${eventTitle}</strong> just opened. Say hi, coordinate plans, and get hyped with everyone going.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:rgba(255,255,255,0.04);border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&#160;&#160;${formatted}</td></tr>
${data.locationName ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&#160;&#160;${escapeHtml(String(data.locationName))}</td></tr>` : ""}
</table>
</td></tr>
</table>
${ctaButton("Hop into the discussion", data.discussionUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You're getting this because you RSVP'd. See you there! — 704 Collective</p>`,
    }),
  };
}

function getTemplate(template: string, data: Record<string, unknown>): { subject: string; html: string; attachments?: EmailAttachment[] } {
  switch (template) {
    case "welcome-back":
      return welcomeBackTemplate(data as { name: string; calendarUrl: string; origin?: string });
    case "welcome-new":
      return welcomeNewTemplate(data as { name: string; calendarUrl: string; origin?: string });
    case "public-rsvp-confirmation":
      return publicRsvpConfirmationTemplate(data as {
        name: string;
        eventName: string;
        eventDate: string;
        eventTime: string;
        eventLocation: string;
        eventAddress?: string;
        origin?: string;
        startTimeIso?: string;
        endTimeIso?: string;
        eventId?: string;
        recipientEmail?: string;
      });
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
        eventId?: string;
        recipientEmail?: string;
      });
    case "rsvp-cancelled":
      return rsvpCancelledTemplate(data as {
        name?: string;
        eventName: string;
        eventDate?: string;
        eventTime?: string;
        eventLocation?: string;
        startTimeIso?: string;
        endTimeIso?: string;
        eventId?: string;
        origin?: string;
        icsSequence?: number;
      });
    case "host-message":
      return hostMessageTemplate(data as {
        hostName?: string;
        memberName?: string;
        memberEmail?: string;
        memberPhone?: string;
        eventName?: string;
        eventDate?: string;
        message?: string;
        origin?: string;
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
    case "waitlist-spot-open":
      return waitlistSpotOpenTemplate(data as {
        memberName: string;
        eventTitle: string;
        eventDate: string;
        eventTime: string;
        claimUrl: string;
        expiresHours: number;
        origin?: string;
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
        startTimeIso?: string;
        endTimeIso?: string;
        eventId?: string;
        recipientEmail?: string;
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
        email?: string;
        origin?: string;
      });
    case "ambassador-referral-received":
      return ambassadorReferralReceivedTemplate(data as {
        ambassadorName: string;
        referredName: string;
        tier: string;
        code: string;
        rewardDollars: string;
        status: string;
        leaderboardUrl: string;
        origin?: string;
      });
    case "ambassador-payout-sent":
      return ambassadorPayoutSentTemplate(data as {
        ambassadorName: string;
        amountDollars: string;
        transferId: string;
        totalPaidDollars: string;
      });
    case "ambassador-admin-notification":
      return ambassadorAdminNotificationTemplate(data as {
        ambassadorName: string;
        code: string;
        referredName: string;
        referredEmail: string;
        tier: string;
        rewardDollars: string;
        status: string;
        adminQueueUrl: string;
      });
    case "ambassador-onboarding-invite":
      return ambassadorOnboardingInviteTemplate(data as { name: string; onboardingUrl: string });
    case "ambassador-weekly-payout":
      return ambassadorWeeklyPayoutTemplate(data as {
        name: string; totalCents: number; conversionCount: number;
        conversions: Array<{ refereeName: string; refereeEmail: string; date: string; amountCents: number }>;
        transferArrivalEstimate: string;
      });
    case "ambassador-welcome-new":
      return ambassadorWelcomeNewTemplate(data as { name: string; email: string; tempPassword: string; loginUrl: string });
    case "ambassador-welcome-existing":
      return ambassadorWelcomeExistingTemplate(data as { name: string; loginUrl: string });
    case "ambassador-invite":
      return ambassadorInviteTemplate(data as { name: string; email: string; referralCode: string; inviteUrl: string });
    case "admin-custom":
      return adminCustomTemplate(data as { recipientName: string; subject: string; bodyText: string; origin?: string });

    // ── Centralised render targets for the 10 batch-send functions ──────────
    case "event-reminder-registered":
      return eventReminderRegisteredTemplate(data as {
        name: string; eventTitle: string; eventStartTime: string;
        locationName?: string | null; eventUrl: string; phrase: string; dayLabel: string;
      });
    case "event-reminder-join-us":
      return eventReminderJoinUsTemplate(data as {
        name: string; eventTitle: string; eventStartTime: string;
        locationName?: string | null; eventUrl: string; phrase: string; dayLabel: string;
      });
    case "admin-message-to-attendees":
      return adminMessageToAttendeesTemplate(data as {
        adminMessage: string; eventTitle: string; eventUrl: string; senderName?: string;
      });
    case "attendee-list-summary":
      return attendeeListSummaryTemplate(data as {
        eventTitle: string; eventStartTime: string;
        attendees: Array<{ name: string; email: string; isGuest: boolean }>;
      });
    case "bulk-setup-reminder":
      return bulkSetupReminderTemplate(data as { name: string; setupLink: string });
    case "business-profile-reminder":
      return businessProfileReminderTemplate(data as { name: string; companyName?: string; portalUrl: string });
    case "guest-event-match":
      return guestEventMatchTemplate(data as {
        guestName: string; eventTitle: string; eventStartTime: string; eventUrl: string;
      });
    case "event-change-notification":
      return eventChangeNotificationTemplate(data as {
        name: string; eventTitle: string; eventUrl: string; changeMessage: string;
        newStartTime?: string; newLocation?: string;
      });
    case "admin-invite-link":
      return adminInviteLinkTemplate(data as { name: string; inviteUrl: string; senderName?: string });
    case "campaign-broadcast":
      return campaignBroadcastTemplate(data as { subject: string; bodyHtml: string; previewText?: string });
    case "re-engagement":
      return reEngagementTemplate(data as { name: string; isBusiness?: boolean; events?: Array<{ title: string; dateLabel: string; locationName?: string | null }>; origin?: string });
    case "drip-step":
      return dripStepTemplate(data as { subject?: string; bodyHtml?: string });
    case "renewal-7day":
      return renewalReminder7Template(data as { name?: string; isBusiness?: boolean; renewDate?: string; origin?: string });
    case "renewal-1day":
      return renewalReminder1Template(data as { name?: string; isBusiness?: boolean; renewDate?: string; origin?: string });
    case "renewal-lapse":
      return renewalLapseTemplate(data as { name?: string; isBusiness?: boolean; origin?: string });

    case "discussion-open":
      return discussionOpenTemplate(data as {
        name: string; eventTitle: string; eventStartTime: string;
        locationName?: string | null; discussionUrl: string;
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
    // Exact match only. A prefix check (e.g. startsWith("sb_secret_")) would
    // accept any forged token beginning with that string, and decoding a JWT
    // payload without verifying its signature proves nothing - the payload is
    // plain base64 that anyone can author.
    const altSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    let isServiceRole =
      (serviceRoleKey.length > 0 && token === serviceRoleKey) ||
      (altSecretKey.length > 0 && token === altSecretKey);

    // Templates that require service role (internal/admin only)
    const restrictedTemplates = [
      "admin-invite", "welcome-setup", "welcome-back", "welcome-new", "public-rsvp-confirmation", "password-setup", "event-change", "guest-followup", "waitlist-spot-open",
      "ticket-followup", "guest-pass", "rsvp-cancelled", "host-message", "feed-mention", "partner-application-submitted",
      "partner-new-application-admin", "partner-welcome-invite", "partner-application-denied",
      "partner-event-inquiry-admin", "partner-inquiry-admin-reply-partner", "partner-team-first-superadmin",
      "partner-team-reply-partner", "partner-account-deletion-request", "social-signup-confirmation",
      "business-application-member-confirm", "business-application-admin-notify", "business-membership-approved",
      "business-application-decision", "welcome-onboarding-complete",
      "admin-custom",
    ];

    // ── Parse body first so we can branch on mode ──
    const body = await req.json();

    // ── Render-only mode: return rendered HTML without sending ──────────────
    if (body.mode === "render") {
      if (!body.template || typeof body.template !== "string") {
        return new Response(JSON.stringify({ error: "Missing template" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const { subject, html, attachments } = getTemplate(body.template, body.data ?? {});
        return new Response(JSON.stringify({
          success: true,
          subject,
          html,
          ...(attachments && attachments.length ? { attachments } : {}),
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { to, template, data, skipCc } = body;

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

    // Inject the recipient address so templates that emit a METHOD:REQUEST
    // organizer invite (rsvp-confirmation, public-rsvp-confirmation, guest-pass)
    // can stamp the ATTENDEE line. Harmless for every other template.
    const templateResult = getTemplate(template, { ...(data || {}), recipientEmail: to });
    let { subject, html } = templateResult;
    const attachments = templateResult.attachments;
    // --- Unsubscribe link policy ---
    // Marketing templates show a working unsubscribe link ONLY to non-active-members.
    // Active members + all transactional/internal mail get the link removed entirely.
    const MARKETING_TEMPLATES = new Set([
      "re-engagement", "drip-step",
      "renewal-7day", "renewal-1day", "renewal-lapse",
      "event-reminder-join-us",
    ]);
    const UNSUB_HREF = 'href="https://704collective.com/unsubscribe"';
    const UNSUB_BLOCK_RE = /<p style="margin:8px 0 0;font-size:12px;text-align:center;"><a href="https:\/\/704collective\.com\/unsubscribe" style="[^"]*">Unsubscribe<\/a><\/p>/;

    if (MARKETING_TEMPLATES.has(template)) {
      let isActiveMember = false;
      try {
        const lookupClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data: prof } = await lookupClient
          .from("profiles")
          .select("subscription_status")
          .eq("email", String(to).toLowerCase())
          .maybeSingle();
        isActiveMember = prof?.subscription_status === "active" || prof?.subscription_status === "trialing";
      } catch (_e) {
        isActiveMember = false; // safe default: treat as non-member -> show link
      }

      if (isActiveMember) {
        html = html.replace(UNSUB_BLOCK_RE, "");
      } else {
        const unsubUrl = `https://704collective.com/unsubscribe?token=${btoa(`${to}:lifecycle`)}`;
        html = html.replace(UNSUB_HREF, `href="${unsubUrl}"`);
      }
    } else {
      html = html.replace(UNSUB_BLOCK_RE, "");
    }
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
        ...(!skipCc && TEAM_CC_TEMPLATES.has(template)
          ? { cc: [TEAM_CC_ADDRESS] }
          : {}),
        subject,
        html,
        text,
        ...(attachments && attachments.length ? { attachments } : {}),
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
      const nowIso = new Date().toISOString();
      await serviceRoleClient.from("email_log").insert({
        to_email: to,
        to_name: (data as Record<string, unknown>)?.name as string ?? null,
        subject,
        template,
        status: "sent",
        resend_id: resendData.id ?? null,
        sent_at: nowIso,
        created_at: nowIso,
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
