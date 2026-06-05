import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * process-drips - Hourly cron job
 * Finds active drip_enrollments where next_send_at <= now, sends the NEXT step,
 * advances the enrollment.
 *
 * Rendering + sending is delegated to the send-email function using the shared
 * "drip-step" template (baseLayout, light theme) so every drip email carries the
 * correct logo + footer and is logged centrally in email_log.
 *
 * Schema: drip_enrollments stores contact_email + contact_name directly.
 * current_step = steps already sent; next step to send = current_step + 1.
 * drip_steps content lives in body_html; placeholders use single braces {first_name}.
 *
 * SAFETY GUARD: skip + stop any enrollment whose email is currently an active
 * member (win-back/cancellation content must never reach a paying member).
 *
 * Cron: hourly.
 */

serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
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
        .select("step_number, subject, body_html, delay_days, delay_hours")
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

      // Personalize: content uses single-brace {first_name} / {name}.
      const firstName = (enrollment.contact_name ?? "").trim().split(" ")[0] || "there";
      const fullName = (enrollment.contact_name ?? "").trim() || "there";
      const rawBody = (step.body_html ?? "");
      const bodyHtml = rawBody
        .replace(/\{first_name\}/gi, firstName)
        .replace(/\{name\}/gi, fullName);
      const subject = (step.subject ?? "A note from 704 Collective")
        .replace(/\{first_name\}/gi, firstName)
        .replace(/\{name\}/gi, fullName);

      // Send via the send-email "drip-step" template (correct logo/footer + central logging).
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE}`,
          "apikey": SERVICE_ROLE,
        },
        body: JSON.stringify({
          to: email,
          template: "drip-step",
          data: { subject, bodyHtml, origin: SITE_URL },
        }),
      });

      if (!sendRes.ok) {
        const errBody = await sendRes.json().catch(() => ({}));
        console.error(`send-email failed for enrollment ${enrollment.id}:`, JSON.stringify(errBody));
        failed++;
        continue;
      }

      // Look ahead for the next step to schedule it.
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
      console.error(`Error processing enrollment ${enrollment.id}:`, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  console.log(`process-drips complete: ${processed} sent, ${failed} failed, ${skippedActiveMembers} active members skipped`);
  return new Response(JSON.stringify({ processed, failed, skippedActiveMembers }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});