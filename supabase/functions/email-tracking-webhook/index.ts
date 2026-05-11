import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend webhook event types
type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    click?: { link: string; userAgent?: string; ipAddress?: string };
    bounce?: { message?: string };
  };
}

serve(async (req) => {
  // Resend sends POST only
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // Signature verification (when RESEND_WEBHOOK_SECRET is set)
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (webhookSecret) {
    const signature = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
    const msgId = req.headers.get("svix-id") ?? req.headers.get("webhook-id");
    const timestamp = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp");

    if (!signature || !msgId || !timestamp) {
      console.warn("Missing webhook signature headers - rejecting");
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const signedContent = `${msgId}.${timestamp}.${rawBody}`;
      const secret = webhookSecret.startsWith("whsec_")
        ? webhookSecret.slice(6)
        : webhookSecret;
      const keyBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
      const computedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;

      // Resend sends comma-separated list of sigs; any match is valid
      const sigs = signature.split(" ");
      const valid = sigs.some((s) => s === computedSig);
      if (!valid) {
        console.warn("Webhook signature mismatch");
        return new Response("Unauthorized", { status: 401 });
      }
    } catch (sigErr) {
      console.error("Signature verification error:", sigErr);
      return new Response("Unauthorized", { status: 401 });
    }
  } else {
    console.warn("RESEND_WEBHOOK_SECRET not set - skipping signature verification");
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { type, data, created_at } = payload;
  const resendMessageId = data?.email_id;

  if (!resendMessageId) {
    return new Response("Missing email_id", { status: 400 });
  }

  // Map Resend event type → email_log status + timestamp columns
  const updateMap: Record<ResendEventType, Record<string, unknown>> = {
    "email.sent":      { status: "sent" },
    "email.delivered": { status: "delivered", delivered_at: created_at },
    "email.opened":    { status: "opened", opened_at: created_at, open_count: 1 }, // incremented below
    "email.clicked":   { status: "clicked", clicked_at: created_at, click_url: data?.click?.link ?? null },
    "email.bounced":   { status: "bounced", bounced_at: created_at },
    "email.complained": { status: "complained", bounced_at: created_at },
  };

  const updates = updateMap[type];
  if (!updates) {
    console.log(`Unhandled event type: ${type}`);
    return new Response("OK", { status: 200 });
  }

  // For opens, increment the open_count rather than set to 1
  if (type === "email.opened") {
    // Fetch current open_count first
    const { data: existing } = await supabase
      .from("email_log")
      .select("id, open_count")
      .eq("resend_id", resendMessageId)
      .single();

    if (existing) {
      await supabase
        .from("email_log")
        .update({
          status: "opened",
          opened_at: created_at,
          open_count: (existing.open_count ?? 0) + 1,
        })
        .eq("resend_id", resendMessageId);
    }
  } else {
    await supabase
      .from("email_log")
      .update(updates)
      .eq("resend_id", resendMessageId);
  }

  // If bounced or complained, mark the contact/profile as unsubscribed
  if (type === "email.bounced" || type === "email.complained") {
    const toEmail = data?.to?.[0];
    if (toEmail) {
      // Update contacts table
      await supabase
        .from("contacts")
        .update({ unsubscribed: true, unsubscribed_at: created_at })
        .eq("email", toEmail);

      // Log contact activity
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", toEmail)
        .single();

      if (contact) {
        await supabase.from("contact_activity").insert({
          contact_id: contact.id,
          type: type === "email.complained" ? "unsubscribed" : "email_bounced",
          description: type === "email.complained"
            ? "Marked email as spam / complained"
            : "Email bounced",
          created_at,
        });
      }
    }
  }

  // Update campaign aggregate stats (async — best effort)
  try {
    const { data: logRow } = await supabase
      .from("email_log")
      .select("campaign_id")
      .eq("resend_id", resendMessageId)
      .single();

    if (logRow?.campaign_id) {
      // Pull fresh counts from email_log
      const { data: stats } = await supabase
        .from("email_log")
        .select("status, open_count")
        .eq("campaign_id", logRow.campaign_id);

      if (stats) {
        const delivered = stats.filter((r) => ["delivered", "opened", "clicked"].includes(r.status ?? "")).length;
        const opened = stats.filter((r) => ["opened", "clicked"].includes(r.status ?? "")).length;
        const clicked = stats.filter((r) => r.status === "clicked").length;
        const bounced = stats.filter((r) => ["bounced", "complained"].includes(r.status ?? "")).length;

        await supabase
          .from("email_campaigns")
          .update({ delivered_count: delivered, open_count: opened, click_count: clicked, bounce_count: bounced })
          .eq("id", logRow.campaign_id);
      }
    }
  } catch (statsErr) {
    console.warn("Failed to update campaign stats:", statsErr);
  }

  return new Response("OK", { status: 200 });
});