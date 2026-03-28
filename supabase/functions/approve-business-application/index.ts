import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomPublicId12(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * approve-business-application
 *
 * Called from AdminApplicationsTab when admin clicks "Approve & Charge"
 *
 * Flow:
 * 1. Load application
 * 2. Check if applicant was a social member → calculate proration
 * 3. Charge applicant via Stripe ($300 - proration if applicable)
 * 4. Update profile: member_type=business, subscription_status=active
 * 5. Update application: status=approved
 * 6. Send welcome email with login link
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load application
    const { data: app, error: appErr } = await supabase
      .from("business_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load profile (may have been a social member)
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", app.email)
      .single();

    let chargeAmount = 30000; // $300.00 in cents (default)
    let proratedCredit = 0;

    // If they were an active social member, calculate proration
    if (profile && profile.member_type === "social" && profile.subscription_status === "active") {
      // Get their current period start from Stripe
      if (profile.subscription_id) {
        const stripeRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.subscription_id}`,
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
        );
        const stripeSub = await stripeRes.json();

        if (stripeSub.current_period_start && stripeSub.current_period_end) {
          const now = Math.floor(Date.now() / 1000);
          const periodStart = stripeSub.current_period_start;
          const periodEnd = stripeSub.current_period_end;
          const totalDays = (periodEnd - periodStart) / 86400;
          const daysRemaining = (periodEnd - now) / 86400;
          const dailyRate = 3000 / totalDays; // $30 / days in period
          proratedCredit = Math.round(dailyRate * daysRemaining); // cents

          chargeAmount = Math.max(30000 - proratedCredit, 0); // $300 - credit, min $0

          // Cancel social subscription in Stripe
          await fetch(
            `https://api.stripe.com/v1/subscriptions/${profile.subscription_id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: "prorate=true",
            }
          );
        }
      }
    }

    // Ensure Stripe customer exists
    let stripeCustomerId = profile?.stripe_customer_id ?? app.stripe_customer_id;
    if (!stripeCustomerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: app.email,
          name: `${app.first_name} ${app.last_name}`,
        }).toString(),
      });
      const customer = await customerRes.json();
      stripeCustomerId = customer.id;
    }

    // Create business subscription via Stripe
    // This creates a subscription starting now, first invoice = chargeAmount
    const billingPlan = app.billing_plan ?? "monthly";
    const businessPriceId = billingPlan === "annual"
      ? (Deno.env.get("STRIPE_BUSINESS_ANNUAL_PRICE_ID") ?? "")
      : (Deno.env.get("STRIPE_BUSINESS_PRICE_ID") ?? "");
    let newSubscriptionId: string | null = null;

    if (businessPriceId) {
      const subBody = new URLSearchParams({
        customer: stripeCustomerId,
        "items[0][price]": businessPriceId,
      });

      // If there's a proration credit, add it as a one-time discount
      if (proratedCredit > 0) {
        // Create a coupon for the prorated amount
        const couponRes = await fetch("https://api.stripe.com/v1/coupons", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount_off: proratedCredit.toString(),
            currency: "usd",
            duration: "once",
            name: `Social membership proration credit`,
          }).toString(),
        });
        const coupon = await couponRes.json();
        if (coupon.id) subBody.set("coupon", coupon.id);
      }

      const subRes = await fetch("https://api.stripe.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: subBody.toString(),
      });
      const sub = await subRes.json();
      newSubscriptionId = sub.id ?? null;
    }

    // Update profile to business member
    const profileUpdates: Record<string, unknown> = {
      member_type: "business",
      subscription_status: "active",
      stripe_customer_id: stripeCustomerId,
      application_status: "approved",
    };
    if (newSubscriptionId) profileUpdates.subscription_id = newSubscriptionId;

    if (profile) {
      await supabase.from("profiles").update(profileUpdates).eq("id", profile.id);
    } else {
      // Create profile if doesn't exist (they applied without being a member)
      await supabase.from("profiles").insert({
        ...profileUpdates,
        email: app.email,
        full_name: `${app.first_name} ${app.last_name}`,
        phone: app.phone,
      });
    }

    // Ensure digital business card exists (first-time business membership)
    const { data: cardProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url")
      .eq("email", app.email)
      .single();

    if (cardProfile) {
      const { data: existingCard } = await supabase
        .from("business_cards")
        .select("id")
        .eq("user_id", cardProfile.id)
        .maybeSingle();

      if (!existingCard) {
        await supabase.from("business_cards").insert({
          user_id: cardProfile.id,
          public_id: randomPublicId12(),
          full_name: cardProfile.full_name ?? `${app.first_name} ${app.last_name}`,
          email: cardProfile.email ?? app.email,
          phone: cardProfile.phone ?? app.phone,
          avatar_url: cardProfile.avatar_url,
          title: null,
          company: null,
          linkedin_url: null,
          website_url: null,
        });
      }
    }

    // Welcome posts on social + business feeds (service role bypasses RLS)
    const { data: feedProfile } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("email", app.email)
      .maybeSingle();

    if (feedProfile) {
      const firstName = (app.first_name || "").trim() || "there";
      const content =
        `🎉 ${firstName} just joined 704 Business! Welcome them to our community — say hello below!`;
      const image_urls = feedProfile.avatar_url ? [feedProfile.avatar_url] : [];
      const now = new Date().toISOString();
      const { error: postsErr } = await supabase.from("posts").insert([
        { author_id: feedProfile.id, feed_type: "social", content, image_urls, created_at: now },
        { author_id: feedProfile.id, feed_type: "business", content, image_urls, created_at: now },
      ]);
      if (postsErr) {
        console.error("Business welcome feed posts failed (non-blocking):", postsErr.message);
      }
    }

    // Update application status
    await supabase
      .from("business_applications")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        stripe_customer_id: stripeCustomerId,
        decision_email_sent_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    // Send welcome email
    const creditNote = proratedCredit > 0
      ? `<p>Your social membership credit of $${(proratedCredit / 100).toFixed(2)} has been applied to your first month.</p>`
      : "";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "704 Collective <no-reply@704collective.com>",
        to: `${app.first_name} ${app.last_name} <${app.email}>`,
        subject: "You're in — welcome to 704 Business",
        html: `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#FAF6F0;">
            <img src="${SITE_URL}/logo.png" alt="704 Collective" style="height:40px;margin-bottom:32px;" />
            <h2 style="color:#1A1A1A;margin-bottom:8px;">Welcome to 704 Business, ${app.first_name}.</h2>
            <p style="color:#2E2E2E;line-height:1.7;">
              Your application has been approved. You now have full Business membership access — 
              monthly meetings, exclusive workshops, private dinners, strategic introductions, and everything in between.
            </p>
            ${creditNote}
            <p style="color:#2E2E2E;line-height:1.7;">
              Log in to your portal to get started. If you have any questions, just reply to this email.
            </p>
            <a href="${SITE_URL}/dashboard"
               style="display:inline-block;margin-top:24px;padding:14px 32px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:6px;font-weight:700;">
              Go to My Portal
            </a>
            <p style="color:#999;font-size:12px;margin-top:48px;">
              704 Collective · Charlotte, NC
            </p>
          </div>
        `,
      }),
    });

    return new Response(
      JSON.stringify({ success: true, prorated_credit_cents: proratedCredit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("approve-business-application error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});