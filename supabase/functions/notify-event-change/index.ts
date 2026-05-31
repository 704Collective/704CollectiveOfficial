import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[NOTIFY-EVENT-CHANGE] ${step}${d}`);
};

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

async function sendResendBatch(
  resendKey: string,
  emails: { from: string; to: string[]; subject: string; html: string }[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify(chunk),
      });

      if (res.ok) {
        const data = await res.json();
        sent += Array.isArray(data.data) ? data.data.length : chunk.length;
        log(`Batch ${Math.floor(i / 100) + 1} sent successfully`, { count: chunk.length });
      } else {
        const errBody = await res.text();
        log(`Batch ${Math.floor(i / 100) + 1} failed`, { status: res.status, body: errBody });
        failed += chunk.length;
      }
    } catch (err) {
      log(`Batch ${Math.floor(i / 100) + 1} error`, { error: String(err) });
      failed += chunk.length;
    }

    if (i + 100 < emails.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { sent, failed };
}

const NAME_PLACEHOLDER = "[[RECIPIENT_NAME]]";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse body first to check for dry_run
    const body = await req.json();
    const { eventId, eventName, oldStartTime, oldEndTime, newStartTime, newEndTime, newLocation, origin, dry_run } = body;
    const dryRun = dry_run === true;

    // Auth check: skip entirely for dry_run, required for real sends
    if (!dryRun) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const isServiceRole = token === serviceRoleKey;

      if (!isServiceRole) {
        const userClient = createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userId = (claims as { sub?: string })?.sub;
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: roleCheck } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!eventId || !eventName || !oldStartTime || !newStartTime) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Processing event change notification", { eventId, eventName, dryRun });

    const { data: credentials, error: credErr } = await adminClient
      .from("attendance_credentials")
      .select(`
        credential_type,
        status,
        person:people!person_id (
          id,
          email,
          email_lower,
          full_name,
          metadata
        )
      `)
      .eq("event_id", eventId)
      .in("credential_type", ["member_rsvp", "public_rsvp", "guest_pass"])
      .in("status", ["active", "used"]);

    if (credErr) {
      log("attendance_credentials query failed", { eventId, error: credErr.message });
      throw credErr;
    }

    const recipients: { email: string; name: string }[] = [];
    const seenEmails = new Set<string>();
    const memberProfileIds: string[] = [];

    for (const cred of (credentials || []) as any[]) {
      const person = cred.person;
      if (!person || !person.email) continue;

      const profileIdFromMeta: string | null = person.metadata?.profile_id ?? null;
      if (profileIdFromMeta) memberProfileIds.push(profileIdFromMeta);
    }

    let profileMap: Record<string, { full_name: string | null; email: string }> = {};
    if (memberProfileIds.length > 0) {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds)
        .is("deleted_at", null);

      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email };
        }
      }
    }

    for (const cred of (credentials || []) as any[]) {
      const person = cred.person;
      if (!person || !person.email) continue;

      const profileIdFromMeta: string | null = person.metadata?.profile_id ?? null;
      let email: string;
      let name: string;

      if (profileIdFromMeta && profileMap[profileIdFromMeta]) {
        email = profileMap[profileIdFromMeta].email;
        name = profileMap[profileIdFromMeta].full_name || person.full_name || "there";
      } else {
        email = person.email;
        name = person.full_name || "there";
      }

      const emailLower = email.toLowerCase();
      if (seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);
      recipients.push({ email, name });
    }

    if (recipients.length === 0) {
      log("No recipients to notify");
      return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0, dryRun }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      timeZone: "America/New_York",
    });
    const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
    });

    const oldDate = formatDate(oldStartTime);
    const oldTime = formatTime(oldStartTime);
    const newDate = formatDate(newStartTime);
    const newTime = formatTime(newStartTime);

    const baseUrl = origin || "https://704collective.com";
    const eventUrl = `${baseUrl}/events/${eventId}`;

    const changeMessage = `This event has been rescheduled from ${oldDate} at ${oldTime} to ${newDate} at ${newTime}.${newLocation ? ` New location: ${newLocation}.` :""}`;

    log(`Building batch for ${recipients.length} recipients`, { dryRun });

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        recipientCount: recipients.length,
        recipients: recipients.map(r => ({ email: r.email, name: r.name })),
        changeMessage,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const { subject, html: htmlTemplate } = await renderTemplate(
      supabaseUrl, serviceRoleKey, "event-change-notification",
      {
        name: NAME_PLACEHOLDER,
        eventTitle: eventName,
        eventUrl,
        changeMessage,
        newStartTime,
        newLocation: newLocation || undefined,
      },
    );

    const emailMessages = recipients.map(recipient => {
      const safeName = recipient.name
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return {
        from: "704 Collective <hello@704collective.com>",
        to: [recipient.email],
        subject,
        html: htmlTemplate.replace(NAME_PLACEHOLDER, safeName),
      };
    });

    const { sent, failed } = await sendResendBatch(resendKey, emailMessages);

    log("Notification complete", { sent, failed, total: recipients.length });

    return new Response(JSON.stringify({ sent, failed, total: recipients.length, dryRun: false }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFY-EVENT-CHANGE] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});