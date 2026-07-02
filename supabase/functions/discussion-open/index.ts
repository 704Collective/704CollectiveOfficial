// discussion-open — hourly cron. Opens event discussions 120h (5 days) before start.
// Stamps events.discussion_opened_at (idempotent — can never fire twice per event),
// bells RSVP'd enterable members (deep-link to discussion), bells other active
// members (RSVP nudge to event page), posts a feed preview with the event image.
// EMAIL IS DISABLED unless secret DISCUSSION_OPEN_EMAIL_ENABLED === "true" (unset = off).
// Supports { dry_run: true } — reports counts, changes NOTHING.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_ENABLED = Deno.env.get("DISCUSSION_OPEN_EMAIL_ENABLED") === "true";
const SITE_URL = "https://704collective.com";
const FEED_AUTHOR_EMAIL = "hello@704collective.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const log = (step: string, d?: unknown) =>
  console.log(`[DISCUSSION-OPEN] ${step}${d ? " - " + JSON.stringify(d) : ""}`);

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let dryRun = false;
  try { const body = await req.json(); dryRun = body?.dry_run === true; } catch { /* ignore */ }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const horizon = new Date(now.getTime() + 120 * 3600 * 1000);

  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("id, title, image_url, start_time")
    .eq("is_published", true)
    .is("discussion_opened_at", null)
    .gt("start_time", now.toISOString())
    .lte("start_time", horizon.toISOString());
  if (evErr) {
    log("events query failed", { error: evErr.message });
    return new Response(JSON.stringify({ error: evErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: unknown[] = [];
  for (const ev of (events ?? []) as { id: string; title: string; image_url: string | null; start_time: string }[]) {
    // Enterable RSVP'd set (active + RSVP'd — the same rule as discussion entry)
    const { data: enterable } = await supabase.rpc("get_event_discussion_mentionable_ids", { p_event_id: ev.id });
    const rsvpIds = ((enterable ?? []) as { id: string }[]).map(r => r.id);
    const rsvpSet = new Set(rsvpIds);

    // Other active members (nudge audience): active/paused or comped, not RSVP'd
    const { data: actives } = await supabase
      .from("profiles")
      .select("id")
      .is("deleted_at", null)
      .in("member_type", ["social", "business"])
      .or("subscription_status.in.(active,paused),membership_override.eq.true");
    const nudgeIds = ((actives ?? []) as { id: string }[]).map(r => r.id).filter(id => !rsvpSet.has(id));

    if (dryRun) {
      results.push({ eventId: ev.id, title: ev.title, dryRun: true, wouldBellRsvpd: rsvpIds.length, wouldBellNudge: nudgeIds.length, wouldEmail: EMAIL_ENABLED ? rsvpIds.length : 0, emailEnabled: EMAIL_ENABLED });
      continue;
    }

    // Idempotency stamp FIRST — only proceed if WE claimed it (row still had null)
    const { data: claimed } = await supabase
      .from("events")
      .update({ discussion_opened_at: new Date().toISOString() })
      .eq("id", ev.id)
      .is("discussion_opened_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) { log("already opened, skipping", { eventId: ev.id }); continue; }

    // Bells — RSVP'd: hop in (deep-link to discussion)
    const rsvpBells = rsvpIds.map(uid => ({
      user_id: uid, type: "discussion_open", title: "Event discussion open",
      notification_type: "discussion_open", event_id: ev.id,
      action_url: `/events/${ev.id}/discussion`,
      message: `Discussion for ${ev.title} has started — hop in!`,
    }));
    // Bells — not RSVP'd: nudge (link to event page, never the discussion)
    const nudgeBells = nudgeIds.map(uid => ({
      user_id: uid, type: "discussion_open", title: "Event discussion open",
      notification_type: "discussion_open", event_id: ev.id,
      action_url: `/events/${ev.id}`,
      message: `Discussion for ${ev.title} has started — RSVP to join the conversation!`,
    }));
    for (const batch of chunks([...rsvpBells, ...nudgeBells], 100)) {
      const { error } = await supabase.from("notifications").insert(batch);
      if (error) log("bell insert failed", { eventId: ev.id, error: error.message });
    }

    // Feed preview post (social feed, event image as thumbnail)
    const { data: authorProf } = await supabase.from("profiles").select("id").eq("email", FEED_AUTHOR_EMAIL).is("deleted_at", null).maybeSingle();
    if (authorProf?.id) {
      const { error: postErr } = await supabase.from("posts").insert({
        author_id: authorProf.id, feed_type: "social",
        content: `The discussion for ${ev.title} is now open — everyone going, hop in and say hi! ${SITE_URL}/events/${ev.id}/discussion`,
        image_urls: ev.image_url ? [ev.image_url] : null,
      });
      if (postErr) log("feed preview insert failed", { eventId: ev.id, error: postErr.message });
    } else {
      log("feed author not found, preview skipped", { email: FEED_AUTHOR_EMAIL });
    }

    // EMAIL — STAGE 2 ONLY. Dead unless DISCUSSION_OPEN_EMAIL_ENABLED === "true".
    let emailed = 0;
    if (EMAIL_ENABLED) {
      log("EMAIL ENABLED — sending discussion-open emails", { eventId: ev.id, count: rsvpIds.length });
      // Stage 2 wires: render 'discussion-open' template via send-email + Resend batch to enterable members.
      // Intentionally not implemented in Stage 1 — flag is off; this branch cannot run.
    } else {
      log("email disabled (stage 1) — skipped", { eventId: ev.id, wouldHaveEmailed: rsvpIds.length });
    }

    results.push({ eventId: ev.id, title: ev.title, belledRsvpd: rsvpBells.length, belledNudge: nudgeBells.length, emailed, emailEnabled: EMAIL_ENABLED });
  }

  return new Response(JSON.stringify({ success: true, eventsFound: (events ?? []).length, dryRun, emailEnabled: EMAIL_ENABLED, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
