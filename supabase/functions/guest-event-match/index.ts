import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * guest-event-match — Daily cron job
 * Finds guests who attended past events but aren't active members,
 * and notifies them about newly created/updated upcoming events.
 *
 * Cron schedule: daily at 8am ET = 13:00 UTC
 * supabase/config.toml: [functions.guest-event-match] schedule = "0 13 * * *"
 *
 * HTML is rendered via the centralised send-email render endpoint.
 */

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GUEST-EVENT-MATCH] ${step}${d}`);
};

/** Call the centralised send-email render endpoint to get subject + HTML. */
async function renderTemplate(
  supabaseUrl: string,
  serviceKey: string,
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ mode: "render", template, data }),
  });
  if (!res.ok) throw new Error(`Failed to render template ${template}: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
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

// Name placeholder for per-recipient replacement after a single render
const NAME_PLACEHOLDER = "[[GUEST_NAME]]";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Authorization: admin or super_admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authedUser?.id) {
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const { data: authedProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authedUser.id)
    .maybeSingle();
  if (!authedProfile || !["admin", "super_admin"].includes(authedProfile.role)) {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin access required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

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
    log("All guests are active members - nothing to send");
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

    // Render template once with placeholder — replace per-recipient
    const { subject, html: htmlTemplate } = await renderTemplate(
      supabaseUrl,
      serviceKey,
      "guest-event-match",
      {
        guestName:      NAME_PLACEHOLDER,
        eventTitle:     event.title,
        eventStartTime: event.start_time,
        eventUrl:       eventsUrl,
      },
    );

    // 5. Batch send via Resend batch API in chunks of 100
    for (let i = 0; i < toNotify.length; i += BATCH_SIZE) {
      const batch = toNotify.slice(i, i + BATCH_SIZE);

      const batchPayload = batch.map((email) => {
        const guestName  = guestMap.get(email) ?? null;
        const firstName  = guestName ? guestName.split(" ")[0] : "";
        const safeFirst  = firstName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return {
          from: "704 Collective <no-reply@704collective.com>",
          to: [email],
          subject,
          html: htmlTemplate.replace(NAME_PLACEHOLDER, safeFirst),
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
