// stripe-drift-check — Wave 10 detector.
//
// READ-ONLY against Stripe (subscriptions.list, paginated, all statuses) and
// against profiles (ALL rows, soft-deleted included — the class the webhook can
// no longer see). Computes the shape table from cursor_report_drifttrio.md,
// writes ONE drift_checks receipt row, and when an alerting shape is present
// (C ghost member, E/F/G still billed) inserts a 'stripe_drift' bell for every
// super-admin and sends one summary email. It never writes Stripe or profiles.
//
// Auth: the nightly pg_cron job sends the service-role key; an admin may also
// trigger it by hand with their JWT.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-DRIFT-CHECK] ${step}${d}`);
};

type Shape = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "OK_ACTIVE" | "OK_CANCELED" | "OK_OVERRIDE" | "OK_NONE";
const ALERT_SHAPES: Shape[] = ["C", "E", "F", "G"];
const SHAPE_LABEL: Record<Shape, string> = {
  A: "DB active, no sub id, nothing active in Stripe",
  B: "DB active, sub id unknown to Stripe",
  C: "DB active, Stripe canceled (ghost member)",
  D: "DB active, Stripe pause_collection (deliberate pause)",
  E: "DB canceled, Stripe still ACTIVE (still billed)",
  F: "DB inactive/other, Stripe ACTIVE",
  G: "soft-deleted profile, Stripe ACTIVE",
  H: "DB says paused",
  OK_ACTIVE: "active both sides",
  OK_CANCELED: "canceled both sides",
  OK_OVERRIDE: "comped (membership_override)",
  OK_NONE: "non-member / no Stripe",
};

interface SubRow {
  id: string;
  customer: string | null;
  email: string | null;
  status: string;
  paused: boolean;
  cancel_at_period_end: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── auth: service role (cron) or admin JWT ──────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let isServiceRole = token.length > 0 && token === serviceKey;
    if (!isServiceRole) {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
      const { data: claims } = await anon.auth.getClaims(token);
      const role = (claims?.claims as { role?: string } | undefined)?.role;
      if (role === "service_role") {
        isServiceRole = true;
      } else {
        const uid = (claims?.claims as { sub?: string } | undefined)?.sub;
        if (!uid) return json({ error: "Unauthorized" }, 401);
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
        if (!prof || !["admin", "super_admin"].includes(prof.role)) return json({ error: "Forbidden" }, 403);
      }
    }

    const body = (await req.json().catch(() => ({}))) as { source?: string };
    const source = ["cron", "manual", "rehearsal"].includes(body.source ?? "") ? body.source! : (isServiceRole ? "cron" : "manual");

    // ── Stripe: list every subscription (read-only) ─────────────────────────
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const subs: SubRow[] = [];
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.subscriptions.list({
        status: "all",
        limit: 100,
        expand: ["data.customer"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const s of page.data) {
        const cust = s.customer as string | Stripe.Customer | Stripe.DeletedCustomer;
        const custId = typeof cust === "string" ? cust : cust?.id ?? null;
        const email = typeof cust === "object" && cust && !("deleted" in cust && cust.deleted) ? ((cust as Stripe.Customer).email ?? null) : null;
        subs.push({
          id: s.id,
          customer: custId,
          email: email ? email.trim().toLowerCase() : null,
          status: s.status,
          paused: !!(s as unknown as { pause_collection?: unknown }).pause_collection,
          cancel_at_period_end: s.cancel_at_period_end === true,
        });
      }
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
    const bySubId = new Map(subs.map((s) => [s.id, s]));
    const activeByCustomer = new Map<string, number>();
    const activeByEmail = new Map<string, number>();
    for (const s of subs) {
      if (s.status !== "active" && s.status !== "trialing") continue;
      if (s.customer) activeByCustomer.set(s.customer, (activeByCustomer.get(s.customer) ?? 0) + 1);
      if (s.email) activeByEmail.set(s.email, (activeByEmail.get(s.email) ?? 0) + 1);
    }
    log("Stripe listed", { total: subs.length, active: [...activeByCustomer.values()].reduce((a, b) => a + b, 0) });

    // ── profiles: ALL rows, soft-deleted included ───────────────────────────
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, subscription_status, subscription_id, stripe_customer_id, member_type, membership_override, deleted_at, is_internal")
      .limit(100000);
    if (pErr) throw new Error(`profiles read failed: ${pErr.message}`);

    const counts: Record<string, number> = {};
    const flagged: Array<Record<string, unknown>> = [];
    const watch: Array<Record<string, unknown>> = [];

    for (const p of profiles ?? []) {
      const email = (p.email ?? "").trim().toLowerCase();
      const status = p.subscription_status as string | null;
      const isActive = status === "active" || status === "trialing";
      const override = p.membership_override === true;
      const bySub = p.subscription_id ? bySubId.get(p.subscription_id) : undefined;
      const activeOnCustomer = p.stripe_customer_id ? (activeByCustomer.get(p.stripe_customer_id) ?? 0) : 0;
      const activeOnEmail = email ? (activeByEmail.get(email) ?? 0) : 0;
      const stripeActiveAnywhere = activeOnCustomer > 0 || activeOnEmail > 0;

      let shape: Shape;
      if (p.deleted_at && stripeActiveAnywhere) shape = "G";
      else if (override) shape = "OK_OVERRIDE";
      else if (isActive && !p.subscription_id && !stripeActiveAnywhere) shape = "A";
      else if (isActive && p.subscription_id && !bySub && !stripeActiveAnywhere) shape = "B";
      else if (isActive && bySub && bySub.status === "canceled" && !stripeActiveAnywhere) shape = "C";
      else if (isActive && bySub?.paused) shape = "D";
      else if (status === "canceled" && stripeActiveAnywhere) shape = "E";
      else if (!isActive && status !== "canceled" && stripeActiveAnywhere) shape = "F";
      else if (status === "paused") shape = "H";
      else if (isActive && stripeActiveAnywhere) shape = "OK_ACTIVE";
      else if (status === "canceled") shape = "OK_CANCELED";
      else shape = "OK_NONE";

      counts[shape] = (counts[shape] ?? 0) + 1;
      const row = {
        shape,
        profile_id: p.id,
        email,
        db_status: status,
        member_type: p.member_type,
        soft_deleted: !!p.deleted_at,
        is_internal: p.is_internal === true,
        subscription_id: p.subscription_id,
        stripe_customer_id: p.stripe_customer_id,
        stripe_status_by_sub: bySub?.status ?? null,
        stripe_active_on_customer: activeOnCustomer,
        stripe_active_on_email: activeOnEmail,
      };
      if (ALERT_SHAPES.includes(shape)) flagged.push(row);
      else if (shape === "A" || shape === "B" || shape === "H") watch.push(row);
    }

    const alertCount = flagged.length;
    log("Shapes computed", { counts, alertCount, watch: watch.length });

    // ── receipt row ─────────────────────────────────────────────────────────
    const { data: receipt, error: rErr } = await supabase
      .from("drift_checks")
      .insert({
        source,
        stripe_subscriptions_total: subs.length,
        stripe_active: subs.filter((s) => s.status === "active" || s.status === "trialing").length,
        profiles_total: profiles?.length ?? 0,
        shape_counts: counts,
        flagged: [...flagged, ...watch.map((w) => ({ ...w, watch_only: true }))],
        alert_count: alertCount,
        alert_sent: false,
        duration_ms: Date.now() - started,
      })
      .select("id")
      .single();
    if (rErr) throw new Error(`drift_checks insert failed: ${rErr.message}`);

    // ── alerts ──────────────────────────────────────────────────────────────
    let alertSent = false;
    if (alertCount > 0) {
      const summary = flagged
        .map((f) => `${f.shape}: ${f.email} (db=${f.db_status}${f.soft_deleted ? "/deleted" : ""}, stripe=${f.stripe_status_by_sub ?? (f.stripe_active_on_customer || f.stripe_active_on_email ? "active" : "-")})`)
        .join("\n");
      const title = `Stripe/DB drift: ${alertCount} row${alertCount === 1 ? "" : "s"} need attention`;

      const { data: admins } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("role", "super_admin")
        .is("deleted_at", null);

      if (admins?.length) {
        const { error: bellErr } = await supabase.from("notifications").insert(
          admins.map((a) => ({
            user_id: a.id,
            type: "stripe_drift",
            notification_type: "stripe_drift",
            title,
            message: flagged.slice(0, 3).map((f) => `${f.shape} ${f.email}`).join(" · ") + (alertCount > 3 ? ` · +${alertCount - 3} more` : ""),
            action_url: "/admin/reconcile-stripe",
          })),
        );
        if (bellErr) log("Bell insert failed (non-blocking)", { error: bellErr.message });
      }

      const alertTo = Deno.env.get("DRIFT_ALERT_EMAIL") ?? "hello@704collective.com";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          to: alertTo,
          template: "admin-custom",
          skipCc: true,
          data: {
            recipientName: "team",
            subject: title,
            bodyText:
              `The nightly Stripe/DB drift check found ${alertCount} row(s) where the database and Stripe disagree about a subscription:\n\n` +
              summary +
              `\n\nShape key: C = DB active but Stripe canceled (ghost member). E = DB canceled but Stripe still billing. F = DB inactive but Stripe billing. G = soft-deleted profile still billed.\n` +
              `Detect-only: nothing was changed. Review at /admin/reconcile-stripe. Receipt id ${receipt.id}.`,
          },
        }),
      });
      alertSent = res.ok;
      if (!res.ok) log("Alert email failed (non-blocking)", { status: res.status });
      await supabase.from("drift_checks").update({ alert_sent: alertSent }).eq("id", receipt.id);
    }

    return json({
      ok: true,
      receipt_id: receipt.id,
      source,
      stripe_subscriptions_total: subs.length,
      shape_counts: counts,
      alert_count: alertCount,
      alert_sent: alertSent,
      flagged: flagged.map((f) => ({ shape: f.shape, email: f.email, db_status: f.db_status, stripe: f.stripe_status_by_sub })),
      watch: watch.map((w) => ({ shape: w.shape, email: w.email })),
      labels: SHAPE_LABEL,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return json({ ok: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
