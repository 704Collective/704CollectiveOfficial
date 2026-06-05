import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * renewal-reminders - Daily cron job
 * Finds members whose subscription renews in 7 days or 1 day, and members who
 * lapsed in the last 24 hours. Rendering + sending is delegated to send-email
 * using the renewal-7day / renewal-1day / renewal-lapse templates (correct logo +
 * footer, no hardcoded price - members pay different rates, so emails link to
 * settings rather than stating an amount).
 *
 * TEST MODE: POST { "test_email": "you@example.com" } sends all three templates to
 * that address only, touches no members, writes no dedup rows.
 *
 * Cron: daily 14:00 UTC.
 */

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();

  // Parse optional test_email.
  let testEmail: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.test_email === "string" && body.test_email.trim()) {
      testEmail = body.test_email.trim();
    }
  } catch { /* no body - normal cron invocation */ }

  // Helper: render + send one renewal email via send-email.
  const sendViaTemplate = async (
    toEmail: string,
    template: string,
    data: Record<string, unknown>
  ) => {
    return await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "apikey": SERVICE_ROLE,
      },
      body: JSON.stringify({ to: toEmail, template, data }),
    });
  };

  // ---- TEST MODE: send all three to the given address, no DB writes ----
  if (testEmail) {
    const results: Record<string, boolean> = {};
    const r7 = await sendViaTemplate(testEmail, "renewal-7day", { name: "Adam", isBusiness: false, renewDate: "Monday, June 16, 2026", origin: SITE_URL });
    results["renewal-7day"] = r7.ok;
    const r1 = await sendViaTemplate(testEmail, "renewal-1day", { name: "Adam", isBusiness: false, renewDate: "Tuesday, June 10, 2026", origin: SITE_URL });
    results["renewal-1day"] = r1.ok;
    const rl = await sendViaTemplate(testEmail, "renewal-lapse", { name: "Adam", isBusiness: false, origin: SITE_URL });
    results["renewal-lapse"] = rl.ok;
    return new Response(JSON.stringify({ mode: "test", to: testEmail, results }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in1Day  = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const formatDateRange = (d: Date, offsetHours = 12) => ({
    start: new Date(d.getTime() - offsetHours * 60 * 60 * 1000).toISOString(),
    end:   new Date(d.getTime() + offsetHours * 60 * 60 * 1000).toISOString(),
  });

  let sent = 0;
  let skipped = 0;

  // Dedup: already sent this reminder type in the last 24h? (maybeSingle - no crash on 0 rows)
  async function alreadySent(profileId: string, reminderType: string): Promise<boolean> {
    const { data } = await supabase
      .from("crm_renewal_reminders")
      .select("id")
      .eq("profile_id", profileId)
      .eq("reminder_type", reminderType)
      .gte("sent_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  async function sendReminder(
    member: { id: string; email: string | null; full_name: string | null; member_type: string | null },
    template: string,
    reminderType: string,
    extraData: Record<string, unknown>
  ) {
    const email = (member.email ?? "").trim();
    if (!email) { skipped++; return; }
    if (await alreadySent(member.id, reminderType)) { skipped++; return; }

    const res = await sendViaTemplate(email, template, {
      name: member.full_name ?? "Member",
      isBusiness: member.member_type === "business",
      origin: SITE_URL,
      ...extraData,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(`send-email failed for ${email} (${reminderType}):`, JSON.stringify(errBody));
      skipped++;
      return;
    }

    // Record dedup row (send-email logs to email_log centrally).
    await supabase.from("crm_renewal_reminders").insert({
      profile_id: member.id,
      reminder_type: reminderType,
      status: "sent",
      sent_at: now.toISOString(),
    });
    sent++;
  }

  // --- 7-day reminder ---
  const range7 = formatDateRange(in7Days);
  const { data: members7 } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, subscription_ends_at")
    .in("subscription_status", ["active", "trialing"])
    .gte("subscription_ends_at", range7.start)
    .lte("subscription_ends_at", range7.end)
    .is("deleted_at", null);

  for (const m of members7 ?? []) {
    const renewDate = new Date(m.subscription_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await sendReminder(m, "renewal-7day", "7_day", { renewDate });
  }

  // --- 1-day reminder ---
  const range1 = formatDateRange(in1Day);
  const { data: members1 } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, subscription_ends_at")
    .in("subscription_status", ["active", "trialing"])
    .gte("subscription_ends_at", range1.start)
    .lte("subscription_ends_at", range1.end)
    .is("deleted_at", null);

  for (const m of members1 ?? []) {
    const renewDate = new Date(m.subscription_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await sendReminder(m, "renewal-1day", "1_day", { renewDate });
  }

  // --- Lapse notification (subscription expired in last 24h) ---
  const lapsedStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: lapsed } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type, subscription_ends_at")
    .eq("subscription_status", "inactive")
    .gte("subscription_ends_at", lapsedStart)
    .lte("subscription_ends_at", now.toISOString())
    .is("deleted_at", null);

  for (const m of lapsed ?? []) {
    await sendReminder(m, "renewal-lapse", "lapsed", {});
  }

  console.log(`renewal-reminders: sent=${sent}, skipped=${skipped}`);
  return new Response(JSON.stringify({ sent, skipped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});