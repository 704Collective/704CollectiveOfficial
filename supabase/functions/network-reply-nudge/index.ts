// network-reply-nudge — Wave H6.
//
// Daily job: every intro that is still status='new', has no first_replied_at,
// is older than 2 business days (Charlotte time, weekends excluded) and has
// never been nudged gets ONE nudge email to the listing owner. Leads are
// grouped per owner (one email listing all their waiting intros), each lead is
// stamped nudge_sent_at, and a one-line summary goes to NETWORK_ADMIN_EMAIL
// when anything fired. Idempotent per lead via nudge_sent_at.
//
// Auth: service role / SB_SECRET_KEY bearer (pg_cron + pg_net, or an admin
// invoking by hand). Body: { dry_run?: boolean, now?: ISO string (rehearsal) }.
//
// Prod schedule (NOT created by this wave): see cursor_report_admin_h6.md.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isPastPledge, pledgeDeadline, PLEDGE_BUSINESS_DAYS } from "../_shared/businessDays.ts";

const log = (s: string, d?: unknown) => console.log(`[NETWORK-REPLY-NUDGE] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const HUB_NAMES: Record<string, string> = { reset: "The Reset", nest: "The Nest", foundry: "The Foundry", experience: "The Experience", enterprise: "The Enterprise", hall: "The Hall", lab: "The Lab" };

type Lead = { id: string; listing_id: string; lead_name: string; need: string | null; created_at: string; first_replied_at: string | null; nudge_sent_at: string | null; status: string };
type Listing = { id: string; company_name: string; hub: string; slug: string; owner_profile_id: string | null };

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const altSecret = Deno.env.get("SB_SECRET_KEY") ?? "";
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token || (token !== serviceKey && !(altSecret && token === altSecret))) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean; now?: string };
    const dryRun = body.dry_run === true;
    const now = body.now ? new Date(body.now) : new Date();
    if (Number.isNaN(now.getTime())) return json({ error: "Bad 'now'" }, 400);
    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://704collective.com").replace(/\/$/, "");
    const adminTo = Deno.env.get("NETWORK_ADMIN_EMAIL") ?? "hello@704collective.com";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Prefilter in SQL (anything newer than 2 calendar days cannot be past 2 business days), decide in code.
    const prefilter = new Date(now.getTime() - PLEDGE_BUSINESS_DAYS * 86_400_000).toISOString();
    const { data: candidates, error } = await supabase
      .from("network_leads")
      .select("id, listing_id, lead_name, need, created_at, first_replied_at, nudge_sent_at, status")
      .eq("status", "new").is("first_replied_at", null).is("nudge_sent_at", null).lte("created_at", prefilter)
      .order("created_at");
    if (error) throw error;
    const due = ((candidates ?? []) as Lead[]).filter((l) => isPastPledge(l.created_at, l.first_replied_at, now));
    log("Candidates", { prefiltered: candidates?.length ?? 0, pastPledge: due.length, dryRun, now: now.toISOString() });
    if (due.length === 0) return json({ ok: true, nudged: 0, owners: 0, dry_run: dryRun, leads: [] });

    const listingIds = [...new Set(due.map((l) => l.listing_id))];
    const { data: listings } = await supabase.from("network_listings").select("id, company_name, hub, slug, owner_profile_id").in("id", listingIds).neq("status", "removed");
    const byListing = Object.fromEntries(((listings ?? []) as Listing[]).map((l) => [l.id, l]));
    const ownerIds = [...new Set(((listings ?? []) as Listing[]).map((l) => l.owner_profile_id).filter((x): x is string => !!x))];
    const { data: owners } = ownerIds.length ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds).is("deleted_at", null) : { data: [] };
    const ownerById = Object.fromEntries(((owners ?? []) as { id: string; email: string | null; full_name: string | null }[]).map((o) => [o.id, o]));

    // Group due leads by owner.
    const groups = new Map<string, { owner: { email: string; first: string }; items: { lead: Lead; listing: Listing }[] }>();
    const skipped: { lead_id: string; reason: string }[] = [];
    for (const lead of due) {
      const listing = byListing[lead.listing_id];
      if (!listing) { skipped.push({ lead_id: lead.id, reason: "listing removed/missing" }); continue; }
      const owner = listing.owner_profile_id ? ownerById[listing.owner_profile_id] : null;
      if (!owner?.email) { skipped.push({ lead_id: lead.id, reason: "no owner email" }); continue; }
      const key = owner.id;
      if (!groups.has(key)) groups.set(key, { owner: { email: owner.email, first: (owner.full_name ?? "").trim().split(/\s+/)[0] || "there" }, items: [] });
      groups.get(key)!.items.push({ lead, listing });
    }

    const send = async (to: string, subject: string, bodyText: string, recipientName: string) => {
      if (dryRun) return 0;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ to, template: "admin-custom", skipCc: true, data: { recipientName, subject, bodyText } }) });
        return res.status;
      } catch (e) { log("send-email threw", { error: String(e) }); return 0; }
    };
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

    const nudged: { lead_id: string; listing: string; owner: string; email_status: number; deadline: string }[] = [];
    for (const [, g] of groups) {
      const lines = g.items.map(({ lead, listing }) => `• ${lead.lead_name}${lead.need ? ` — ${lead.need}` : ""} (asked ${fmtDate(lead.created_at)}, ${listing.company_name} on ${HUB_NAMES[listing.hub] ?? listing.hub})`);
      const n = g.items.length;
      const subject = n === 1 ? "You have an intro waiting - the 704 pledge is a reply within 2 business days" : `You have ${n} intros waiting - the 704 pledge is a reply within 2 business days`;
      const bodyText = [
        `${n === 1 ? "A 704 member asked for an intro and hasn't heard back yet." : `${n} 704 members asked for intros and haven't heard back yet.`} Every listing on The Network pledges a reply within 2 business days, and ${n === 1 ? "this one is" : "these are"} now past that.`,
        "", ...lines, "",
        `Reply to them directly, then mark the intro contacted in My Leads: ${siteUrl}/listing-account/leads (or ${siteUrl}/dashboard/leads if you sign in as a member).`,
        "", "Reply times are part of the quarterly re-review. If something is wrong with the intro itself, just reply to this email and tell us.",
      ].join("\n");
      const status = await send(g.owner.email, subject, bodyText, g.owner.first);
      if (!dryRun) {
        const ids = g.items.map((i) => i.lead.id);
        const { error: stampErr } = await supabase.from("network_leads").update({ nudge_sent_at: now.toISOString() }).in("id", ids).is("nudge_sent_at", null);
        if (stampErr) log("stamp failed", { error: stampErr.message, ids });
      }
      for (const { lead, listing } of g.items) nudged.push({ lead_id: lead.id, listing: listing.slug, owner: g.owner.email, email_status: status, deadline: pledgeDeadline(lead.created_at).toISOString() });
    }

    let adminStatus: number | null = null;
    if (nudged.length > 0) {
      const perBiz = new Map<string, number>();
      for (const n of nudged) perBiz.set(n.listing, (perBiz.get(n.listing) ?? 0) + 1);
      const summary = `Reply-pledge nudges sent today: ${nudged.length} intro${nudged.length === 1 ? "" : "s"} across ${groups.size} business${groups.size === 1 ? "" : "es"} — ${[...perBiz].map(([slug, c]) => `${slug} (${c})`).join(", ")}.`;
      adminStatus = await send(adminTo, `Network nudges: ${nudged.length} sent`, [summary, "", `Flags panel: ${siteUrl}/admin/network`].join("\n"), "team");
    }
    log("Done", { nudged: nudged.length, owners: groups.size, skipped: skipped.length, adminStatus, dryRun });
    return json({ ok: true, nudged: nudged.length, owners: groups.size, dry_run: dryRun, leads: nudged, skipped, admin_email_status: adminStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return json({ error: msg }, 500);
  }
});
