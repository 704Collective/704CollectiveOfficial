import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * process-drips — Hourly cron job
 * Finds all active drip_enrollments where next_send_at <= now,
 * sends the next step via Resend, logs to email_log, advances the enrollment.
 *
 * Cron schedule: every hour
 * supabase/config.toml → [functions.process-drips] schedule = "0 * * * *"
 */

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const now = new Date().toISOString();

  // Find enrollments due to send
  const { data: enrollments, error: enrollErr } = await supabase
    .from("drip_enrollments")
    .select(`
      id,
      contact_id,
      profile_id,
      drip_campaign_id,
      current_step,
      next_send_at,
      contacts ( email, first_name, last_name ),
      profiles ( email, full_name )
    `)
    .eq("status", "active")
    .lte("next_send_at", now);

  if (enrollErr) {
    console.error("Failed to fetch enrollments:", enrollErr);
    return new Response(JSON.stringify({ error: String(enrollErr) }), { status: 500 });
  }

  if (!enrollments || enrollments.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let processed = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    try {
      // Get the current step content
      const { data: step, error: stepErr } = await supabase
        .from("drip_steps")
        .select("*")
        .eq("drip_campaign_id", enrollment.drip_campaign_id)
        .eq("step_number", enrollment.current_step)
        .single();

      if (stepErr || !step) {
        // No more steps — complete the enrollment
        await supabase
          .from("drip_enrollments")
          .update({ status: "completed", completed_at: now })
          .eq("id", enrollment.id);
        continue;
      }

      // Resolve recipient email + name
      const contact = enrollment.contacts as { email: string; first_name: string; last_name: string } | null;
      const profile = enrollment.profiles as { email: string; full_name: string } | null;

      const email = contact?.email ?? profile?.email;
      const firstName = contact?.first_name ?? profile?.full_name?.split(" ")[0] ?? "Member";
      const fullName = contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        : profile?.full_name ?? "Member";

      if (!email) {
        console.warn(`No email for enrollment ${enrollment.id}`);
        await supabase
          .from("drip_enrollments")
          .update({ status: "failed" })
          .eq("id", enrollment.id);
        failed++;
        continue;
      }

      // Personalize content
      const unsubToken = btoa(`${email}:drip:${enrollment.drip_campaign_id}`);
      const unsubUrl = `${SITE_URL}/unsubscribe?token=${unsubToken}`;
      const htmlContent = (step.content_html ?? step.content ?? "")
        .replace(/{{first_name}}/gi, firstName)
        .replace(/{{name}}/gi, fullName)
        .replace(/{{unsubscribe_url}}/gi, unsubUrl);

      const trackingPixel = `<img src="${SITE_URL}/api/track/open?drip=${enrollment.drip_campaign_id}&step=${step.step_number}&e=${encodeURIComponent(email)}" width="1" height="1" style="display:none" />`;
      const finalHtml = `${htmlContent}${trackingPixel}
<p style="font-size:11px;color:#999;margin-top:32px;">
  <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
</p>`;

      // Send via Resend
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `704 Collective <no-reply@704collective.com>`,
          to: fullName ? `${fullName} <${email}>` : email,
          subject: step.subject,
          html: finalHtml,
        }),
      });

      const sendData = await sendRes.json();
      const resendId = sendData?.id ?? null;
      const success = sendRes.ok && resendId;

      // Log to email_log
      await supabase.from("email_log").insert({
        drip_campaign_id: enrollment.drip_campaign_id,
        drip_enrollment_id: enrollment.id,
        contact_id: enrollment.contact_id ?? null,
        profile_id: enrollment.profile_id ?? null,
        email,
        subject: step.subject,
        resend_message_id: resendId,
        status: success ? "sent" : "failed",
        sent_at: now,
      });

      if (!success) {
        console.error(`Failed to send drip step for enrollment ${enrollment.id}:`, sendData);
        failed++;
        continue;
      }

      // Look ahead for next step
      const { data: nextStep } = await supabase
        .from("drip_steps")
        .select("step_number, delay_days, delay_hours")
        .eq("drip_campaign_id", enrollment.drip_campaign_id)
        .eq("step_number", enrollment.current_step + 1)
        .single();

      if (!nextStep) {
        // No more steps — complete
        await supabase
          .from("drip_enrollments")
          .update({
            status: "completed",
            current_step: enrollment.current_step + 1,
            completed_at: now,
          })
          .eq("id", enrollment.id);
      } else {
        // Schedule next step
        const delayMs =
          ((nextStep.delay_days ?? 0) * 24 * 60 * 60 +
            (nextStep.delay_hours ?? 0) * 60 * 60) *
          1000;
        const nextSendAt = new Date(Date.now() + delayMs).toISOString();

        await supabase
          .from("drip_enrollments")
          .update({
            current_step: enrollment.current_step + 1,
            next_send_at: nextSendAt,
            last_sent_at: now,
          })
          .eq("id", enrollment.id);
      }

      // Log contact activity
      if (enrollment.contact_id) {
        await supabase.from("contact_activity").insert({
          contact_id: enrollment.contact_id,
          type: "email_sent",
          description: `Drip email sent: "${step.subject}" (step ${step.step_number})`,
          created_at: now,
        });
      }

      processed++;
    } catch (err) {
      console.error(`Error processing enrollment ${enrollment.id}:`, err);
      failed++;
    }
  }

  console.log(`process-drips complete: ${processed} sent, ${failed} failed`);
  return new Response(JSON.stringify({ processed, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});