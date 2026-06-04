import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * process-drips - Hourly cron job
 * Finds active drip_enrollments where next_send_at <= now, sends the NEXT step
 * via Resend, logs to email_log, advances the enrollment.
 *
 * Schema notes (canonical): drip_enrollments stores contact_email + contact_name
 * directly (no contacts/profiles join). current_step = number of steps already
 * sent; the next step to send is step_number = current_step + 1.
 *
 * SAFETY GUARD: before sending, skip+stop any enrollment whose email is currently
 * an active member. Drip campaigns here include win-back/cancellation content that
 * must never reach a paying member, even if enrollment data is contaminated.
 *
 * Cron: every hour. supabase/config.toml -> schedule = "0 * * * *"
 */

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const now = new Date().toISOString();

  const { data: enrollments, error: enrollErr } = await supabase
    .from("drip_enrollments")
    .select("id, contact_email, contact_name, drip_campaign_id, current_step, next_send_at")
    .eq("status", "active")
    .lte("next_send_at", now);

  if (enrollErr) {
    console.error("Failed to fetch enrollments:", enrollErr);
    return new Response(JSON.stringify({ error: enrollErr.message ?? JSON.stringify(enrollErr) }), { status: 500 });
  }

  if (!enrollments || enrollments.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let processed = 0;
  let failed = 0;
  let skippedActiveMembers = 0;

  for (const enrollment of enrollments) {
    try {
      const email = (enrollment.contact_email ?? "").trim();
      if (!email) {
        console.warn(`No email for enrollment ${enrollment.id}`);
        await supabase.from("drip_enrollments")
          .update({ status: "failed", stopped_reason: "No contact_email", completed_at: now })
          .eq("id", enrollment.id);
        failed++;
        continue;
      }

      // SAFETY GUARD: never send a win-back/drip to a current active member.
      const emailLower = email.toLowerCase();
      const [{ data: prof }, { data: per }] = await Promise.all([
        supabase.from("profiles")
          .select("subscription_status, membership_override, deleted_at")
          .ilike("email", emailLower).is("deleted_at", null).limit(1).maybeSingle(),
        supabase.from("people")
          .select("member_status, override_paying")
          .eq("email_lower", emailLower).limit(1).maybeSingle(),
      ]);
      const isActiveMember =
        (!!prof && (prof.subscription_status === "active" || prof.subscription_status === "trialing" || prof.membership_override === true)) ||
        (!!per && (per.member_status === "active" || per.override_paying === true));
      if (isActiveMember) {
        await supabase.from("drip_enrollments")
          .update({ status: "stopped", stopped_reason: "Active member - drip suppressed by safety guard", completed_at: now })
          .eq("id", enrollment.id);
        skippedActiveMembers++;
        continue;
      }

      // The next step to send (current_step = steps already sent).
      const nextStepNumber = (enrollment.current_step ?? 0) + 1;
      const { data: step, error: stepErr } = await supabase
        .from("drip_steps")
        .select("*")
        .eq("drip_campaign_id", enrollment.drip_campaign_id)
        .eq("step_number", nextStepNumber)
        .single();

      if (stepErr || !step) {
        // No such step -> sequence finished.
        await supabase.from("drip_enrollments")
          .update({ status: "completed", completed_at: now })
          .eq("id", enrollment.id);
        continue;
      }

      const firstName = (enrollment.contact_name ?? "").trim().split(" ")[0] || "Member";
      const fullName = (enrollment.contact_name ?? "").trim() || "Member";

      const unsubToken = btoa(`${email}:drip:${enrollment.drip_campaign_id}`);
      const unsubUrl = `${SITE_URL}/unsubscribe?token=${unsubToken}`;
      const htmlContent = (step.content_html ?? step.content ?? "")
        .replace(/{{first_name}}/gi, firstName)
        .replace(/{{name}}/gi, fullName)
        .replace(/{{unsubscribe_url}}/gi, unsubUrl);

      const trackingPixel = `<img src="${SITE_URL}/api/track/open?drip=${enrollment.drip_campaign_id}&step=${step.step_number}&e=${encodeURIComponent(email)}" width="1" height="1" style="display:none" />`;
      const finalHtml = `${htmlContent}${trackingPixel}<p style="font-size:11px;color:#999;margin-top:32px;"><a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p>`;

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `704 Collective <no-reply@704collective.com>`,
          to: `${fullName} <${email}>`,
          subject: step.subject,
          html: finalHtml,
        }),
      });

      const sendData = await sendRes.json();
      const resendId = sendData?.id ?? null;
      const success = sendRes.ok && !!resendId;

      await supabase.from("email_log").insert({
        to_email: email,
        to_name: fullName,
        from_email: "no-reply@704collective.com",
        subject: step.subject,
        drip_campaign_id: enrollment.drip_campaign_id,
        drip_enrollment_id: enrollment.id,
        resend_message_id: resendId,
        status: success ? "sent" : "failed",
        sent_at: now,
      });

      if (!success) {
        console.error(`Failed to send drip step for enrollment ${enrollment.id}:`, sendData);
        failed++;
        continue;
      }

      const { data: nextStep } = await supabase
        .from("drip_steps")
        .select("step_number, delay_days, delay_hours")
        .eq("drip_campaign_id", enrollment.drip_campaign_id)
        .eq("step_number", nextStepNumber + 1)
        .single();

      if (!nextStep) {
        await supabase.from("drip_enrollments")
          .update({ status: "completed", current_step: nextStepNumber, last_sent_at: now, completed_at: now })
          .eq("id", enrollment.id);
      } else {
        const delayMs = (((nextStep.delay_days ?? 0) * 24 * 60 * 60) + ((nextStep.delay_hours ?? 0) * 60 * 60)) * 1000;
        const nextSendAt = new Date(Date.now() + delayMs).toISOString();
        await supabase.from("drip_enrollments")
          .update({ current_step: nextStepNumber, next_send_at: nextSendAt, last_sent_at: now })
          .eq("id", enrollment.id);
      }

      processed++;
    } catch (err) {
      console.error(`Error processing enrollment ${enrollment.id}:`, err);
      failed++;
    }
  }

  console.log(`process-drips complete: ${processed} sent, ${failed} failed, ${skippedActiveMembers} active members skipped`);
  return new Response(JSON.stringify({ processed, failed, skippedActiveMembers }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});