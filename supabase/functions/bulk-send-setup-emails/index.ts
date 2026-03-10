import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BULK-SETUP] ${step}${d}`);
};

// ── Brand constants (mirrored from send-email) ──
const BRAND = {
  color: "#1A1A1A",
  surface: "#2E2E2E",
  accent: "#D4A853",
  accentText: "#1A1A1A",
  text: "#FAF6F0",
  textSecondary: "#D8D8D8",
  textMuted: "#A0A0A0",
  border: "rgba(255,255,255,0.10)",
  logoUrl: "https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png",
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function baseLayout(content: string, origin?: string): string {
  const homeUrl = origin || "#";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.color};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<a href="${homeUrl}" target="_blank" style="text-decoration:none;border:none;">
<img src="${BRAND.logoUrl}" alt="704 Collective" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
</a>
</td></tr>
<tr><td style="padding:32px 40px;">
${content}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">${text}</a>
</td></tr>
</table>`;
}

function buildPasswordSetupEmail(data: { name: string; setupLink: string; origin?: string }): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: "Set up your 704 Collective account",
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your 704 Collective membership has been set up. Click the button below to create your password and access your account.</p>
${ctaButton("Set Your Password", data.setupLink)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If it's expired, you can request a new one instantly from the setup page.</p>
`, data.origin),
  };
}

const BATCH_SIZE = 50;
const TIMEOUT_MS = 50_000; // Stop at 50s to leave margin before 60s limit

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth: require admin ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ──
    const body = await req.json();
    const { origin, dryRun, retryOnly, offset } = body as {
      origin?: string;
      dryRun?: boolean;
      retryOnly?: string[];
      offset?: number;
    };

    if (!origin) {
      return new Response(JSON.stringify({ error: "Missing 'origin'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startOffset = offset || 0;
    log("Starting bulk setup email", { origin, dryRun, retryOnly: retryOnly?.length, offset: startOffset });

    // ── Get ALL active profiles ──
    const { data: profiles, error: profilesErr } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .is("deleted_at", null)
      .or("subscription_status.eq.active,membership_override.eq.true");

    if (profilesErr) throw new Error(`Profiles query failed: ${profilesErr.message}`);

    // Filter to retryOnly list if provided
    let targetProfiles = profiles || [];
    if (retryOnly && retryOnly.length > 0) {
      const retrySet = new Set(retryOnly.map(e => e.toLowerCase()));
      targetProfiles = targetProfiles.filter(p => retrySet.has(p.email.toLowerCase()));
    }

    // ── Check each user's auth metadata for last_sign_in_at ──
    const eligible: { id: string; email: string; full_name: string | null }[] = [];
    const alreadySetUp: string[] = [];

    for (const profile of targetProfiles) {
      const { data: authData, error: authErr } = await adminClient.auth.admin.getUserById(profile.id);
      if (authErr || !authData?.user) continue;

      if (authData.user.last_sign_in_at) {
        alreadySetUp.push(profile.email);
      } else {
        eligible.push(profile);
      }
    }

    // ── Dry run: return preview without sending ──
    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        wouldSend: eligible.length,
        alreadySetUp: alreadySetUp.length,
        totalChecked: targetProfiles.length,
        recipients: eligible.map(p => ({ email: p.email, name: p.full_name })),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eligible.length === 0) {
      return new Response(JSON.stringify({
        sent: 0, skipped: alreadySetUp.length, errors: 0, remaining: 0,
        details: [], message: "All members have already set up their accounts",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply offset for continuation
    const remainingEligible = eligible.slice(startOffset);
    log(`Sending to ${remainingEligible.length} members (offset=${startOffset}, ${alreadySetUp.length} already set up)`);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    // ── Generate links and build batch emails ──
    const results: { email: string; status: string; error?: string }[] = [];
    let sent = 0;
    let errors = 0;
    let processed = 0;

    // Process in chunks of BATCH_SIZE
    for (let chunkStart = 0; chunkStart < remainingEligible.length; chunkStart += BATCH_SIZE) {
      // Check timeout before starting a new chunk
      if (Date.now() - startTime > TIMEOUT_MS) {
        const remaining = remainingEligible.length - chunkStart;
        const nextOffset = startOffset + chunkStart;
        log("Approaching timeout, stopping", { sent, errors, remaining, nextOffset });
        return new Response(JSON.stringify({
          sent, skipped: alreadySetUp.length, errors,
          remaining, next_offset: nextOffset,
          total: targetProfiles.length, details: results,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const chunk = remainingEligible.slice(chunkStart, chunkStart + BATCH_SIZE);
      const batchEmails: { from: string; to: string[]; subject: string; html: string }[] = [];

      // Generate setup links for this chunk (sequential — each needs a unique link)
      for (const profile of chunk) {
        try {
          const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
            type: "recovery",
            email: profile.email,
            options: { redirectTo: `${origin}/setup-password` },
          });

          if (linkErr || !linkData) {
            errors++;
            results.push({ email: profile.email, status: "error", error: linkErr?.message || "Link generation failed" });
            continue;
          }

          const setupLink = linkData.properties?.action_link;
          if (!setupLink) {
            errors++;
            results.push({ email: profile.email, status: "error", error: "No action_link returned" });
            continue;
          }

          const firstName = profile.full_name?.split(" ")[0] || "there";
          const { subject, html } = buildPasswordSetupEmail({ name: firstName, setupLink, origin });
          batchEmails.push({
            from: "704 Collective <hello@704collective.com>",
            to: [profile.email],
            subject,
            html,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log(`Error generating link for ${profile.email}`, msg);
          errors++;
          results.push({ email: profile.email, status: "error", error: msg });
        }
      }

      // Send this chunk via Resend batch API
      if (batchEmails.length > 0) {
        try {
          const res = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify(batchEmails),
          });

          if (res.ok) {
            const data = await res.json();
            const batchSent = Array.isArray(data.data) ? data.data.length : batchEmails.length;
            sent += batchSent;
            for (const email of batchEmails) {
              results.push({ email: email.to[0], status: "sent" });
            }
            log(`Chunk ${Math.floor(chunkStart / BATCH_SIZE) + 1} sent`, { count: batchSent });
          } else {
            const errBody = await res.text();
            log(`Chunk ${Math.floor(chunkStart / BATCH_SIZE) + 1} failed`, { status: res.status, body: errBody });
            errors += batchEmails.length;
            for (const email of batchEmails) {
              results.push({ email: email.to[0], status: "error", error: `Batch send failed: ${res.status}` });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Chunk error`, { error: msg });
          errors += batchEmails.length;
          for (const email of batchEmails) {
            results.push({ email: email.to[0], status: "error", error: msg });
          }
        }
      }

      processed += chunk.length;

      // 1-second delay between chunks
      if (chunkStart + BATCH_SIZE < remainingEligible.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const summary = {
      sent, skipped: alreadySetUp.length, errors, remaining: 0,
      total: targetProfiles.length, details: results,
    };
    log("Complete", { sent, skipped: alreadySetUp.length, errors });

    return new Response(JSON.stringify(summary), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[BULK-SETUP] Internal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
