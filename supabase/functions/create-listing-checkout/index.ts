// create-listing-checkout — Wave H4.
//
// Admin approves a Get Listed application: this creates a Stripe Checkout
// session (subscription, the listing price) for the applicant, stamps the
// application with the link + 24h validity, and emails the applicant the link.
// Re-callable: a second call issues a fresh link (re-send). The listing itself
// is created later by stripe-webhook on checkout.session.completed.
//
// Auth: admin or super_admin (profiles.role, the non-profiles convention) via
// the caller's JWT, or the service role.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { LISTING_PRODUCT_ID } from "../_shared/stripeProducts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const log = (s: string, d?: unknown) => console.log(`[CREATE-LISTING-CHECKOUT] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const HUB_NAMES: Record<string, string> = { reset: "The Reset", nest: "The Nest", foundry: "The Foundry", experience: "The Experience", enterprise: "The Enterprise", hall: "The Hall", lab: "The Lab" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_LISTING_PRICE_ID");
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://704collective.com";
    if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not set" }, 500);
    if (!priceId || !LISTING_PRODUCT_ID) return json({ error: "Listing product is not configured (STRIPE_LISTING_PRICE_ID / STRIPE_LISTING_PRODUCT_ID)" }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── auth ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const altSecret = Deno.env.get("SB_SECRET_KEY") ?? "";
    const isService = token.length > 0 && (token === serviceKey || (altSecret.length > 0 && token === altSecret));
    let actorId: string | null = null;
    if (!isService) {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
      const { data: claims } = await anon.auth.getClaims(token);
      actorId = (claims?.claims as { sub?: string } | undefined)?.sub ?? null;
      if (!actorId) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await admin.from("profiles").select("role").eq("id", actorId).is("deleted_at", null).maybeSingle();
      if (!prof || !["admin", "super_admin"].includes(prof.role)) return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { application_id?: string };
    if (!body.application_id) return json({ error: "application_id required" }, 400);

    const { data: app, error: appErr } = await admin
      .from("network_listing_applications")
      .select("id, business_name, hub, category_text, contact_name, contact_email, status, converted_listing_id")
      .eq("id", body.application_id)
      .maybeSingle();
    if (appErr || !app) return json({ error: "Application not found" }, 404);
    if (app.converted_listing_id) return json({ error: "Application already converted to a listing" }, 409);
    if (app.status === "declined") return json({ error: "Application is declined; reopen it before approving" }, 409);

    // ── Stripe Checkout (subscription) ──
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Stripe max = 24h
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: app.contact_email,
      success_url: `${siteUrl}/get-listed?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/get-listed?canceled=1`,
      expires_at: expiresAt,
      allow_promotion_codes: false,
      metadata: { product_kind: "network_listing", application_id: app.id, hub: app.hub, business_name: app.business_name },
      subscription_data: { metadata: { product_kind: "network_listing", application_id: app.id } },
    });
    log("Checkout session created", { applicationId: app.id, sessionId: session.id, livemode: session.livemode });

    const nowIso = new Date().toISOString();
    const { error: stampErr } = await admin
      .from("network_listing_applications")
      .update({
        status: app.status === "pending" || app.status === "waitlisted" ? "reviewing" : app.status,
        approved_payment_link_sent_at: nowIso,
        payment_link_url: session.url,
        payment_link_expires_at: new Date(expiresAt * 1000).toISOString(),
        stripe_checkout_session_id: session.id,
      })
      .eq("id", app.id);
    if (stampErr) log("Application stamp failed (link still issued)", { error: stampErr.message });

    // ── approval email with the link ──
    const first = (app.contact_name ?? "").trim().split(/\s+/)[0] || "there";
    const hubName = HUB_NAMES[app.hub] ?? app.hub;
    const bodyText = [
      `${app.business_name} passed the 704 Review for ${hubName}.`,
      "",
      `Your spotlight listing is $150/month, rate locked for 12 months. Pricing increases as hubs fill, so this link holds today's rate.`,
      "",
      `Pay here to go live: ${session.url}`,
      "",
      "The link is valid for 24 hours. Reply to this email if you need a new one.",
      "",
      "Once paid, your listing is created in draft and we'll finish it with you.",
    ].join("\n");
    let emailStatus = 0;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ to: app.contact_email, template: "admin-custom", skipCc: true, data: { recipientName: first, subject: `You're approved for ${hubName} — here's your payment link`, bodyText } }),
      });
      emailStatus = res.status;
      if (!res.ok) log("Approval email failed (non-blocking)", { status: res.status });
    } catch (e) { log("Approval email threw (non-blocking)", { error: String(e) }); }

    return json({ ok: true, url: session.url, session_id: session.id, expires_at: new Date(expiresAt * 1000).toISOString(), email_status: emailStatus, actor: actorId ?? "service_role" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return json({ error: msg }, 500);
  }
});
