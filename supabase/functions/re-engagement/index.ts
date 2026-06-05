import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * re-engagement - Daily cron job
 * Emails ACTIVE members who have gone quiet (no ticket/RSVP and no login) in the
 * last 30 days, at most once per 30 days each. Skips unsubscribed contacts and
 * anyone contacted in the last 30 days.
 *
 * Rendering + sending is delegated to the send-email function using the shared
 * "re-engagement" template (baseLayout, light theme) so the logo + footer stay
 * consistent with every other 704 email and never drift.
 *
 * HARD START GATE: sends nothing before CAMPAIGN_START. The cron may run daily
 * before then but exits immediately and sends zero.
 *
 * TEST MODE: POST { "test_email": "you@example.com" } sends ONE preview to that
 * address only, ignores the start gate, touches no members, writes no dedup row.
 *
 * Cron: daily 15:00 UTC (recreated in pg_cron after verification).
 */

const CAMPAIGN_START = "2026-07-06T00:00:00Z"; // no real sends before this date

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parse optional test_email.
  let testEmail: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.test_email === "string" && body.test_email.trim()) {
      testEmail = body.test_email.trim();
    }
  } catch { /* no body - normal cron invocation */ }

  // Helper: send one re-engagement email via the send-email function.
  const sendOne = async (toEmail: string, name: string, isBusiness: boolean, events: Array<{ title: string; dateLabel: string; locationName: string | null }>) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "apikey": SERVICE_ROLE,
      },
      body: JSON.stringify({
        to: toEmail,
        template: "re-engagement",
        data: { name, isBusiness, origin: SITE_URL, events },
      }),
    });
    return res;
  };

  // Build the upcoming-events list once (shared by real + test sends).
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcoming } = await supabase
    .from("events")
    .select("title, start_time, location_name")
    .gte("start_time", now.toISOString())
    .lte("start_time", thirtyDaysFromNow)
    .eq("is_published", true)
    .order("start_time", { ascending: true })
    .limit(3);

  const events = (upcoming ?? []).map((ev) => {
    const d = new Date(ev.start_time);
    const dateLabel = d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    return { title: ev.title as string, dateLabel, locationName: (ev.location_name as string) ?? null };
  });

  // ---- TEST MODE: one preview, ignore gate, no DB writes ----
  if (testEmail) {
    const res = await sendOne(testEmail, "Adam", false, events);
    const out = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ mode: "test", to: testEmail, ok: res.ok, response: out }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // ---- HARD START GATE ----
  if (now < new Date(CAMPAIGN_START)) {
    return new Response(JSON.stringify({ gated: true, campaign_start: CAMPAIGN_START, message: "Before campaign start date - no emails sent." }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // ---- REAL RUN ----
  const { data: activeMembers } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, last_seen_at")
    .in("subscription_status", ["active", "trialing"])
    .is("deleted_at", null);

  if (!activeMembers || activeMembers.length === 0) {
    return new Response(JSON.stringify({ sent: 0, skipped: 0 }), { status: 200 });
  }

  let sent = 0;
  let skipped = 0;

  for (const member of activeMembers) {
    try {
      const email = (member.email ?? "").trim();
      if (!email) { skipped++; continue; }

      // Quiet check: any ticket in last 30 days?
      const { count: recentTickets } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.id)
        .gte("created_at", thirtyDaysAgo);

      const lastSeen = member.last_seen_at ? new Date(member.last_seen_at) : null;
      const recentlyActive = lastSeen && lastSeen.toISOString() > thirtyDaysAgo;

      if ((recentTickets ?? 0) > 0 || recentlyActive) { skipped++; continue; }

      // Dedup: re-engaged in last 30 days? (activity_type - correct column)
      const { count: recentContact } = await supabase
        .from("contact_activity")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", member.id)
        .eq("activity_type", "re_engagement_sent")
        .gte("created_at", thirtyDaysAgo);

      if ((recentContact ?? 0) > 0) { skipped++; continue; }

      // Unsubscribe check (maybeSingle - no crash on 0/dup rows)
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, unsubscribed")
        .eq("email", email)
        .limit(1)
        .maybeSingle();

      if (contact?.unsubscribed) { skipped++; continue; }

      const name = member.full_name ?? "Member";
      const isBusiness = member.member_type === "business";

      const res = await sendOne(email, name, isBusiness, events);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error(`send-email failed for ${email}:`, JSON.stringify(errBody));
        skipped++;
        continue;
      }

      // Record dedup activity (send-email already logs to email_log centrally)
      const activityRow: Record<string, unknown> = {
        activity_type: "re_engagement_sent",
        title: "Re-engagement email sent",
        description: "We miss you re-engagement email",
        profile_id: member.id,
        created_at: now.toISOString(),
      };
      if (contact?.id) activityRow.contact_id = contact.id;
      await supabase.from("contact_activity").insert(activityRow);

      sent++;
    } catch (err) {
      console.error(`Error processing re-engagement for ${member.email}:`, err instanceof Error ? err.message : String(err));
      skipped++;
    }
  }

  console.log(`re-engagement: sent=${sent}, skipped=${skipped}`);
  return new Response(JSON.stringify({ sent, skipped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});