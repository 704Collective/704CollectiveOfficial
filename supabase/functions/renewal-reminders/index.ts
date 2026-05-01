import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * renewal-reminders — Daily cron job
 * Finds members whose subscription renews in 7 days or 1 day,
 * and members who lapsed in the last 24 hours.
 * Sends reminder/lapse emails via Resend.
 *
 * Cron schedule: daily at 9am ET = 14:00 UTC
 * supabase/config.toml → [functions.renewal-reminders] schedule = "0 14 * * *"
 */

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const now = new Date();

  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in1Day  = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const formatDateRange = (d: Date, offsetHours = 12) => ({
    start: new Date(d.getTime() - offsetHours * 60 * 60 * 1000).toISOString(),
    end:   new Date(d.getTime() + offsetHours * 60 * 60 * 1000).toISOString(),
  });

  let sent = 0;
  let skipped = 0;

  // Helper: check if we already sent a reminder of this type today
  async function alreadySent(profileId: string, reminderType: string): Promise<boolean> {
    const { data } = await supabase
      .from("crm_renewal_reminders")
      .select("id")
      .eq("profile_id", profileId)
      .eq("reminder_type", reminderType)
      .gte("sent_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .single();
    return !!data;
  }

  async function sendReminderEmail(
    to: { email: string; name: string | null },
    subject: string,
    html: string,
    profileId: string,
    reminderType: string
  ) {
    if (await alreadySent(profileId, reminderType)) {
      skipped++;
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "704 Collective <no-reply@704collective.com>",
        to: to.name ? `${to.name} <${to.email}>` : to.email,
        subject,
        html,
        text: `${subject}\n\n704 Collective membership — manage your account: ${SITE_URL}/dashboard/settings`,
      }),
    });

    const data = await res.json();
    const resendId = data?.id ?? null;

    await supabase.from("crm_renewal_reminders").insert({
      profile_id: profileId,
      reminder_type: reminderType,
      sent_at: now.toISOString(),
      resend_message_id: resendId,
    });

    await supabase.from("email_log").insert({
      profile_id: profileId,
      email: to.email,
      subject,
      resend_message_id: resendId,
      status: res.ok ? "sent" : "failed",
      sent_at: now.toISOString(),
    });

    if (res.ok) sent++; else skipped++;
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
    const firstName = m.full_name?.split(" ")[0] ?? "Member";
    const renewDate = new Date(m.subscription_ends_at).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
    const isBusiness = m.member_type === "business";

    await sendReminderEmail(
      { email: m.email, name: m.full_name },
      "Your 704 Collective membership renews in 7 days",
      `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#FAF6F0;">
        <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
        <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${firstName},</h2>
        <p style="color:#2E2E2E;line-height:1.6;">
          Just a heads-up — your 704 Collective ${isBusiness ? "Business" : "Social"} membership renews on 
          <strong>${renewDate}</strong>.
        </p>
        <p style="color:#2E2E2E;line-height:1.6;">
          Your card on file will be automatically charged ${isBusiness ? "$300.00" : "$30.00"}.
          No action needed if everything looks good.
        </p>
        <p style="color:#2E2E2E;line-height:1.6;">
          Need to update your payment method or have questions? Reply to this email and we'll sort it out.
        </p>
        <a href="${SITE_URL}/dashboard" 
           style="display:inline-block;margin-top:24px;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:600;">
          View My Dashboard
        </a>
        <p style="color:#999;font-size:12px;margin-top:48px;">
          704 Collective · Charlotte, NC<br/>
          <a href="${SITE_URL}/unsubscribe?email=${encodeURIComponent(m.email)}" style="color:#999;">Unsubscribe</a>
        </p>
      </div>
      `,
      m.id,
      "7_day"
    );
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
    const firstName = m.full_name?.split(" ")[0] ?? "Member";
    const isBusiness = m.member_type === "business";

    await sendReminderEmail(
      { email: m.email, name: m.full_name },
      "Your 704 Collective membership renews tomorrow",
      `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;background:#FAF6F0;margin:0 auto;padding:32px;">
        <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
        <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${firstName},</h2>
        <p style="color:#2E2E2E;line-height:1.6;">
          Your 704 Collective ${isBusiness ? "Business" : "Social"} membership renews <strong>tomorrow</strong>.
          Your card on file will be charged ${isBusiness ? "$300.00" : "$30.00"}.
        </p>
        <p style="color:#2E2E2E;line-height:1.6;">
          If you need to make any changes, now's the time — reply to this email and we'll help.
        </p>
        <a href="${SITE_URL}/dashboard"
           style="display:inline-block;margin-top:24px;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:600;">
          View My Dashboard
        </a>
        <p style="color:#999;font-size:12px;margin-top:48px;">
          704 Collective · Charlotte, NC<br/>
          <a href="${SITE_URL}/unsubscribe?email=${encodeURIComponent(m.email)}" style="color:#999;">Unsubscribe</a>
        </p>
      </div>
      `,
      m.id,
      "1_day"
    );
  }

  // --- Lapse notification (subscription expired yesterday) ---
  const lapsedStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: lapsed } = await supabase
    .from("profiles")
    .select("id, email, full_name, member_type")
    .eq("subscription_status", "inactive")
    .gte("subscription_ends_at", lapsedStart)
    .lte("subscription_ends_at", now.toISOString())
    .is("deleted_at", null);

  for (const m of lapsed ?? []) {
    const firstName = m.full_name?.split(" ")[0] ?? "Member";
    const isBusiness = m.member_type === "business";

    await sendReminderEmail(
      { email: m.email, name: m.full_name },
      "Your 704 Collective membership has expired",
      `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;background:#FAF6F0;margin:0 auto;padding:32px;">
        <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
        <h2 style="color:#1A1A1A;margin-bottom:8px;">Hey ${firstName},</h2>
        <p style="color:#2E2E2E;line-height:1.6;">
          We noticed your 704 Collective membership has lapsed. We'd love to have you back!
        </p>
        ${isBusiness
          ? `<p style="color:#2E2E2E;line-height:1.6;">
               To renew your Business membership, reply to this email and we'll get it sorted quickly.
             </p>`
          : `<a href="${SITE_URL}/join/checkout"
                style="display:inline-block;margin-top:24px;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:600;">
               Renew My Membership — $49/mo
             </a>`
        }
        <p style="color:#999;font-size:12px;margin-top:48px;">
          704 Collective · Charlotte, NC<br/>
          <a href="${SITE_URL}/unsubscribe?email=${encodeURIComponent(m.email)}" style="color:#999;">Unsubscribe</a>
        </p>
      </div>
      `,
      m.id,
      "lapsed"
    );
  }

  console.log(`renewal-reminders: sent=${sent}, skipped=${skipped}`);
  return new Response(JSON.stringify({ sent, skipped }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});