import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * re-engagement — Daily cron job
 * Finds active members with no activity (tickets, payments, login) in 60+ days.
 * Sends a re-engagement email with upcoming events teaser.
 *
 * Cron schedule: daily at 10am ET = 15:00 UTC
 * supabase/config.toml → [functions.re-engagement] schedule = "0 15 * * *"
 */

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get all active members
  const { data: activeMembers } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, last_seen_at")
    .in("subscription_status", ["active", "trialing"])
    .is("deleted_at", null);

  if (!activeMembers || activeMembers.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Fetch upcoming events (next 30 days) for the teaser
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, title, start_time, location")
    .gte("start_time", now.toISOString())
    .lte("start_time", thirtyDaysFromNow)
    .eq("is_published", true)
    .order("start_time", { ascending: true })
    .limit(3);

  const eventTeaser = upcomingEvents && upcomingEvents.length > 0
    ? `
      <div style="margin:24px 0;padding:20px;background:#fff;border-radius:8px;border:1px solid #e5e5e5;">
        <h3 style="color:#1A1A1A;margin:0 0 16px;">Upcoming Events</h3>
        ${upcomingEvents.map((ev) => {
          const date = new Date(ev.start_time).toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
          });
          const time = new Date(ev.start_time).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit",
          });
          return `
          <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#1A1A1A;">${ev.title}</strong><br/>
            <span style="color:#666;font-size:14px;">${date} at ${time}${ev.location ? ` · ${ev.location}` : ""}</span>
          </div>`;
        }).join("")}
        <a href="${SITE_URL}/events"
           style="display:inline-block;margin-top:8px;color:#C6A664;font-weight:600;text-decoration:none;">
          View all events →
        </a>
      </div>`
    : `
      <div style="margin:24px 0;">
        <a href="${SITE_URL}/events"
           style="display:inline-block;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:600;">
          See What's Coming Up
        </a>
      </div>`;

  let sent = 0;
  let skipped = 0;

  for (const member of activeMembers) {
    try {
      // Check last activity: tickets created in last 60 days
      const { count: recentTickets } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.id)
        .gte("created_at", sixtyDaysAgo);

      // Also check last_seen_at from profiles
      const lastSeen = member.last_seen_at ? new Date(member.last_seen_at) : null;
      const recentlyActive = lastSeen && lastSeen.toISOString() > sixtyDaysAgo;

      if ((recentTickets ?? 0) > 0 || recentlyActive) {
        skipped++;
        continue; // Active enough — skip
      }

      // Check if we already sent a re-engagement email in the last 30 days
      const { count: recentContact } = await supabase
        .from("contact_activity")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", member.id)
        .eq("type", "re_engagement_sent")
        .gte("created_at", thirtyDaysAgo);

      if ((recentContact ?? 0) > 0) {
        skipped++;
        continue; // Already contacted recently
      }

      // Also check contacts table in case they have a contact record
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, unsubscribed")
        .eq("email", member.email)
        .single();

      if (contact?.unsubscribed) {
        skipped++;
        continue;
      }

      const firstName = member.full_name?.split(" ")[0] ?? "Member";
      const isBusiness = member.member_type === "business";

      const subject = `We miss you, ${firstName} 👋`;
      const html = `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#FAF6F0;">
        <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
        <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${firstName}, it's been a while!</h2>
        <p style="color:#2E2E2E;line-height:1.6;">
          We noticed you haven't been to an event in a bit — and we miss seeing you around. 
          704 Collective is all about real connections in Charlotte, and there's always something worth showing up for.
        </p>
        ${eventTeaser}
        ${isBusiness
          ? `<p style="color:#2E2E2E;line-height:1.6;margin-top:16px;">
               As a Business member, you also have access to exclusive networking events and the business portal.
               <a href="${SITE_URL}/business" style="color:#C6A664;font-weight:600;">Check it out →</a>
             </p>`
          : ""
        }
        <p style="color:#2E2E2E;line-height:1.6;margin-top:24px;">
          Questions or feedback? Just reply to this email — we read everything.
        </p>
        <p style="color:#2E2E2E;margin-top:8px;">— The 704 Collective Team</p>
        <p style="color:#999;font-size:12px;margin-top:48px;">
          704 Collective · Charlotte, NC<br/>
          You're receiving this because you're an active member.<br/>
          <a href="${SITE_URL}/unsubscribe?email=${encodeURIComponent(member.email)}" style="color:#999;">Unsubscribe from re-engagement emails</a>
        </p>
      </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "704 Collective <no-reply@704collective.com>",
          to: member.full_name ? `${member.full_name} <${member.email}>` : member.email,
          subject,
          html,
          text: `${subject}\n\nHey ${firstName}, we miss you at 704 Collective. See upcoming events: ${SITE_URL}/events`,
        }),
      });

      const resData = await res.json();
      const resendId = resData?.id ?? null;

      // Log to email_log
      await supabase.from("email_log").insert({
        profile_id: member.id,
        email: member.email,
        subject,
        resend_message_id: resendId,
        status: res.ok ? "sent" : "failed",
        sent_at: now.toISOString(),
      });

      // Log contact activity so we don't re-send for 30 days
      const activityRow: Record<string, unknown> = {
        type: "re_engagement_sent",
        description: "Re-engagement email sent",
        profile_id: member.id,
        created_at: now.toISOString(),
      };
      if (contact?.id) activityRow.contact_id = contact.id;

      await supabase.from("contact_activity").insert(activityRow);

      if (res.ok) sent++; else skipped++;
    } catch (err) {
      console.error(`Error processing re-engagement for ${member.email}:`, err);
      skipped++;
    }
  }

  console.log(`re-engagement: sent=${sent}, skipped=${skipped}`);
  return new Response(JSON.stringify({ sent, skipped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});