import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * guest-event-match — Daily cron job
 * Finds guests who attended past events but aren't active members,
 * and notifies them about newly created/updated upcoming events.
 *
 * Cron schedule: daily at 8am ET = 13:00 UTC
 * supabase/config.toml: [functions.guest-event-match] schedule = "0 13 * * *"
 */

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GUEST-EVENT-MATCH] ${step}${d}`);
};

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

function formatEventDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatEventTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "";
  }
}

function buildEmailHtml(
  firstName: string,
  event: { title: string; start_time: string; location_name: string | null },
  eventsUrl: string,
  siteUrl: string
): string {
  const eventDate = formatEventDate(event.start_time);
  const eventTime = formatEventTime(event.start_time);
  const location = event.location_name ?? "704 Collective";

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
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey${firstName ? ` ${firstName}` : ""}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">A new event is coming up at 704 Collective and we thought you'd want to know about it.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 10px;font-size:17px;font-weight:600;color:${BRAND.text};">${event.title}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128197;&nbsp;&nbsp;${eventDate}</td></tr>
${eventTime ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#9200;&nbsp;&nbsp;${eventTime}</td></tr>` : ""}
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">&#128205;&nbsp;&nbsp;${location}</td></tr>
</table>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${eventsUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">View All Events</a>
</td></tr>
</table>
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">You're receiving this because you attended a past 704 Collective event as a guest. Questions? <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
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

interface Event {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
}

interface GuestPass {
  guest_email: string;
  guest_name: string | null;
}

interface Profile {
  email: string;
}

interface NotificationRow {
  guest_email: string;
}

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const resendKey = Deno.env.get("RESEND_API_KEY")!;
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const eventsUrl = `${siteUrl}/events`;
  const BATCH_SIZE = 100;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Query upcoming events created/updated in the last 7 days
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, start_time, location_name")
    .gte("start_time", now.toISOString())
    .eq("is_published", true)
    .or(`created_at.gte.${sevenDaysAgo},updated_at.gte.${sevenDaysAgo}`)
    .order("start_time", { ascending: true });

  if (eventsError) {
    log("Failed to fetch events", { error: eventsError.message });
    return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
  }

  if (!events || events.length === 0) {
    log("No new/updated upcoming events found");
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  log("Found upcoming events", { count: events.length });

  // 2. Find all redeemed guest passes
  const { data: guestPasses } = await supabase
    .from("guest_passes")
    .select("guest_email, guest_name")
    .eq("status", "redeemed");

  if (!guestPasses || guestPasses.length === 0) {
    log("No redeemed guest passes found");
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  // Build unique guest map
  const guestMap = new Map<string, string | null>();
  for (const gp of guestPasses as GuestPass[]) {
    if (gp.guest_email && !guestMap.has(gp.guest_email.toLowerCase())) {
      guestMap.set(gp.guest_email.toLowerCase(), gp.guest_name);
    }
  }

  const allGuestEmails = Array.from(guestMap.keys());
  if (allGuestEmails.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  // 3. Find active members to exclude
  const { data: activeProfiles } = await supabase
    .from("profiles")
    .select("email")
    .in("email", allGuestEmails)
    .eq("subscription_status", "active")
    .is("deleted_at", null);

  const activeMemberEmails = new Set(
    (activeProfiles ?? []).map((p: Profile) => p.email.toLowerCase())
  );

  const eligibleGuests = allGuestEmails.filter(
    (email) => !activeMemberEmails.has(email)
  );

  if (eligibleGuests.length === 0) {
    log("All guests are active members — nothing to send");
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let totalSent = 0;

  for (const event of events as Event[]) {
    // 4. Exclude guests already notified about this event
    const { data: alreadyNotified } = await supabase
      .from("guest_event_notifications")
      .select("guest_email")
      .eq("event_id", event.id)
      .in("guest_email", eligibleGuests);

    const notifiedEmails = new Set(
      (alreadyNotified ?? []).map((n: NotificationRow) => n.guest_email.toLowerCase())
    );

    const toNotify = eligibleGuests.filter((email) => !notifiedEmails.has(email));

    if (toNotify.length === 0) {
      log("All eligible guests already notified", { eventId: event.id });
      continue;
    }

    log("Sending notifications", { eventId: event.id, recipients: toNotify.length });

    const subject = "A new 704 Collective event is coming up";

    // 5. Batch send via Resend batch API in chunks of 100
    for (let i = 0; i < toNotify.length; i += BATCH_SIZE) {
      const batch = toNotify.slice(i, i + BATCH_SIZE);

      const batchPayload = batch.map((email) => {
        const guestName = guestMap.get(email) ?? null;
        const firstName = guestName ? guestName.split(" ")[0] : "";
        return {
          from: "704 Collective <no-reply@704collective.com>",
          to: [email],
          subject,
          html: buildEmailHtml(firstName, event, eventsUrl, siteUrl),
        };
      });

      try {
        const resendRes = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify(batchPayload),
        });

        if (!resendRes.ok) {
          const errBody = await resendRes.json().catch(() => ({}));
          log("Resend batch error", { status: resendRes.status, error: errBody });
          continue;
        }

        totalSent += batch.length;

        // 6. Insert notification records
        const notificationRows = batch.map((email) => ({
          guest_email: email,
          event_id: event.id,
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from("guest_event_notifications")
          .insert(notificationRows);

        if (insertError) {
          log("Failed to insert notification records", { error: insertError.message });
        }
      } catch (err) {
        log("Batch send failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  log("Done", { totalSent });
  return new Response(JSON.stringify({ totalSent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
