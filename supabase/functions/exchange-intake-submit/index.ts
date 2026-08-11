// AUTH PATTERN: public browser call with the anon key as bearer (same as
// capture-public-rsvp). All DB writes use a service-role client inside.
// No config.toml block: platform default verify_jwt = true is satisfied by
// the anon key the client sends.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EXCHANGE-INTAKE] ${step}${d}`);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pool caps. Intentionally constants for this event. Move to a config table
// when a second Exchange event exists.
const POOL_CAPS: Record<string, number> = {
  house: 60,
  commonwealth: 60,
};

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// rate_limits schema: (key text, count int, window_start timestamptz).
// Any DB error is logged and fails open (never throws, never blocks).
async function checkRateLimit(supabase: any, key: string, max: number): Promise<boolean> {
  const now = new Date();
  const { data: rows, error: selErr } = await supabase
    .from("rate_limits")
    .select("id, count, window_start")
    .eq("key", key)
    .order("window_start", { ascending: false })
    .limit(1);
  if (selErr) {
    console.error("RATE_LIMIT_DB_ERROR [exchange-intake-submit] select", selErr);
    return false;
  }
  const row = rows && rows.length > 0 ? rows[0] : null;
  if (row) {
    const withinWindow = now.getTime() - new Date(row.window_start).getTime() < RATE_LIMIT_WINDOW_MS;
    if (withinWindow) {
      if (row.count >= max) return true;
      const { error: updErr } = await supabase.from("rate_limits").update({ count: row.count + 1 }).eq("id", row.id);
      if (updErr) { console.error("RATE_LIMIT_DB_ERROR [exchange-intake-submit] update", updErr); return false; }
    } else {
      const { error: resetErr } = await supabase.from("rate_limits").update({ count: 1, window_start: now.toISOString() }).eq("id", row.id);
      if (resetErr) { console.error("RATE_LIMIT_DB_ERROR [exchange-intake-submit] reset", resetErr); return false; }
    }
  } else {
    const { error: insErr } = await supabase.from("rate_limits").insert({ key, count: 1, window_start: now.toISOString() });
    if (insErr) { console.error("RATE_LIMIT_DB_ERROR [exchange-intake-submit] insert", insErr); return false; }
  }
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeToken(prefix: string) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
}

/** Counts credentials already consuming a given pool for this event.
 *  Credentials with no pool tag (all pre-existing member RSVPs) count as house. */
async function countPool(admin: any, eventId: string, pool: string): Promise<number> {
  const { data, error } = await admin
    .from("attendance_credentials")
    .select("id, metadata")
    .eq("event_id", eventId)
    .in("status", ["active", "used"]);
  if (error) throw new Error(`pool count failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ metadata: Record<string, unknown> | null }>;
  return rows.filter((r) => {
    const p = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>)["pool"] : null;
    const tag = typeof p === "string" && p.length > 0 ? p : "house";
    return tag === pool;
  }).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ── GET: prefill by invite token, or remaining spots for one pool ──────────
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const inviteToken = url.searchParams.get("invite_token");
      const eventId = url.searchParams.get("event_id");
      const pool = url.searchParams.get("pool");

      if (inviteToken) {
        const { data: row } = await admin
          .from("exchange_intake")
          .select("id, event_id, first_name, last_name, email, phone, status, participation")
          .eq("invite_token", inviteToken)
          .maybeSingle();
        if (!row) return json({ error: "Invalid or expired link" }, 404);
        return json({
          success: true,
          already_submitted: row.status === "submitted",
          event_id: row.event_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
        });
      }

      if (eventId && pool) {
        if (!POOL_CAPS[pool]) return json({ error: "Unknown pool" }, 400);
        const used = await countPool(admin, eventId, pool);
        const cap = POOL_CAPS[pool];
        // Only ever discloses the pool that was asked for.
        return json({ success: true, pool, capacity: cap, remaining: Math.max(0, cap - used), full: used >= cap });
      }

      return json({ error: "Missing parameters" }, 400);
    } catch (err) {
      console.error("[EXCHANGE-INTAKE] GET error:", err instanceof Error ? err.message : String(err));
      return json({ error: "Internal error" }, 500);
    }
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ── Rate limit ────────────────────────────────────────────────────────────
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = await checkRateLimit(admin, `exchange-intake:${clientIp}`, RATE_LIMIT_MAX);
    if (limited) return json({ error: "Too many requests. Please try again later." }, 429);

    const body = await req.json() as {
      event_id?: string;
      form_variant?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      participation?: string;
      invite_token?: string;
      q_role_title?: string;
      q_company?: string;
      q_years_charlotte?: string;
      q_seeking?: string;
      origin?: string;
    };

    const formVariant = (body.form_variant ?? "").trim();
    if (!["commonwealth", "public", "invited"].includes(formVariant)) {
      return json({ error: "Invalid form" }, 400);
    }

    const answers = {
      q_role_title: (body.q_role_title ?? "").trim() || null,
      q_company: (body.q_company ?? "").trim() || null,
      q_years_charlotte: (body.q_years_charlotte ?? "").trim() || null,
      q_seeking: (body.q_seeking ?? "").trim() || null,
    };
    const hasAllAnswers = Boolean(
      answers.q_role_title && answers.q_company && answers.q_years_charlotte && answers.q_seeking
    );

    const nowIso = new Date().toISOString();
    const ipAddress = clientIp === "unknown" ? null : clientIp;
    const userAgent = req.headers.get("user-agent") || null;

    // ══ PATH 1: invited (the members who already RSVP'd) ══════════════════════
    // Answers only. Never creates a credential: they already have one, and
    // one_active_credential_per_person_per_event would reject it anyway.
    if (formVariant === "invited") {
      const inviteToken = (body.invite_token ?? "").trim();
      if (!inviteToken) return json({ error: "Missing invite token" }, 400);

      const { data: row } = await admin
        .from("exchange_intake")
        .select("id, status, event_id, first_name")
        .eq("invite_token", inviteToken)
        .maybeSingle();
      if (!row) return json({ error: "Invalid or expired link" }, 404);
      if (row.status === "submitted") {
        return json({ success: true, already_submitted: true });
      }
      if (!hasAllAnswers) return json({ error: "All questions are required" }, 400);

      const { error: updErr } = await admin
        .from("exchange_intake")
        .update({
          ...answers,
          participation: "business_and_social",
          status: "submitted",
          submitted_at: nowIso,
          ip_address: ipAddress,
          user_agent: userAgent,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (updErr) {
        log("invited update failed", { error: updErr.message, code: (updErr as { code?: string }).code });
        return json({ error: "Could not save your answers", debug: updErr.message }, 500);
      }

      // Self-healing: an invited row assumes the person already holds a credential.
      // If they do not (RSVP canceled, or the row was pre-created before RSVP),
      // issue one now against the house pool so they are genuinely registered.
      let healedToken: string | null = null;
      try {
        const { data: fullRow } = await admin
          .from("exchange_intake")
          .select("id, event_id, email, person_id, credential_id, first_name, last_name, phone")
          .eq("id", row.id)
          .maybeSingle();

        if (fullRow) {
          // Resolve the person: prefer the stored person_id, then profile link, then email.
          let healPersonId: string | null = fullRow.person_id ?? null;

          if (!healPersonId) {
            const { data: healProfile } = await admin
              .from("profiles")
              .select("id")
              .ilike("email", fullRow.email)
              .is("deleted_at", null)
              .maybeSingle();
            if (healProfile?.id) {
              const { data: linkedPerson } = await admin
                .from("people")
                .select("id")
                .filter("metadata->>profile_id", "eq", healProfile.id)
                .maybeSingle();
              if (linkedPerson) healPersonId = linkedPerson.id;
            }
          }

          if (!healPersonId) {
            const { data: byEmail } = await admin
              .from("people")
              .select("id")
              .eq("email_lower", String(fullRow.email).toLowerCase())
              .maybeSingle();
            if (byEmail) healPersonId = byEmail.id;
          }

          if (!healPersonId) {
            const { data: madePerson, error: makePersonErr } = await admin
              .from("people")
              .insert({
                // email_lower is GENERATED ALWAYS from email. Never write it.
                email: String(fullRow.email).toLowerCase(),
                full_name: `${fullRow.first_name} ${fullRow.last_name}`,
                phone: fullRow.phone,
                roles: ["guest"],
                metadata: { source: "exchange_intake_heal" },
              })
              .select("id")
              .single();
            if (makePersonErr) log("heal: people insert failed", { error: makePersonErr.message });
            else healPersonId = madePerson.id;
          }

          if (healPersonId) {
            const { data: haveCred } = await admin
              .from("attendance_credentials")
              .select("id, token")
              .eq("person_id", healPersonId)
              .eq("event_id", fullRow.event_id)
              .eq("status", "active")
              .maybeSingle();

            if (haveCred) {
              healedToken = haveCred.token;
              if (!fullRow.credential_id || !fullRow.person_id) {
                await admin.from("exchange_intake")
                  .update({ person_id: healPersonId, credential_id: haveCred.id, updated_at: new Date().toISOString() })
                  .eq("id", row.id);
              }
            } else {
              const poolUsed = await countPool(admin, fullRow.event_id, "house");
              if (poolUsed >= POOL_CAPS["house"]) {
                log("heal: house pool full, answers saved but no credential issued", { intakeId: row.id });
              } else {
                const { data: newCred, error: newCredErr } = await admin
                  .from("attendance_credentials")
                  .insert({
                    token: makeToken("C-"),
                    person_id: healPersonId,
                    event_id: fullRow.event_id,
                    credential_type: "member_rsvp",
                    status: "active",
                    metadata: { source: "exchange_intake_heal", pool: "house", form_variant: "invited" },
                  })
                  .select("id, token")
                  .single();
                if (newCredErr) {
                  log("heal: credential insert failed", { error: newCredErr.message, code: (newCredErr as { code?: string }).code });
                } else {
                  healedToken = newCred.token;
                  await admin.from("exchange_intake")
                    .update({ person_id: healPersonId, credential_id: newCred.id, updated_at: new Date().toISOString() })
                    .eq("id", row.id);
                  log("heal: credential issued", { intakeId: row.id, token: newCred.token });
                }
              }
            }
          }
        }
      } catch (healErr) {
        log("heal block threw (non-blocking)", { error: healErr instanceof Error ? healErr.message : String(healErr) });
      }

      log("invited answers saved", { intakeId: row.id });
      return json({
        success: true,
        already_submitted: false,
        participation: "business_and_social",
        credential_token: healedToken,
      });
    }

    // ══ PATH 2 and 3: commonwealth and public ════════════════════════════════
    const eventId = (body.event_id ?? "").trim();
    const firstName = (body.first_name ?? "").trim().slice(0, 100);
    const lastName = (body.last_name ?? "").trim().slice(0, 100);
    const email = (body.email ?? "").trim().toLowerCase();
    const phone = (body.phone ?? "").trim().slice(0, 30);

    if (!eventId) return json({ error: "Missing event" }, 400);
    if (!firstName || !lastName) return json({ error: "First and last name are required" }, 400);
    if (!email || !EMAIL_REGEX.test(email)) return json({ error: "A valid email is required" }, 400);
    if (!phone) return json({ error: "Phone number is required" }, 400);

    // ── Event must exist, be published, and be configured for intake ──────────
    const { data: event, error: eventErr } = await admin
      .from("events")
      .select("id, title, start_time, end_time, location_name, location_address, is_published, capacity, intake_form_slug")
      .eq("id", eventId)
      .maybeSingle();
    if (eventErr || !event) return json({ error: "Event not found" }, 404);
    if (!event.is_published) return json({ error: "Event is not currently available" }, 403);
    if (!event.intake_form_slug) return json({ error: "This event does not use an intake form" }, 403);

    // ── Who is this? Email match against profiles decides everything ──────────
    const { data: profile } = await admin
      .from("profiles")
      .select("id, member_type, subscription_status, membership_override, deleted_at")
      .ilike("email", email)
      .is("deleted_at", null)
      .maybeSingle();

    const isActiveMember = Boolean(
      profile &&
      (profile.subscription_status === "active" ||
        profile.subscription_status === "trialing" ||
        profile.membership_override === true)
    );
    const isBusinessMember = Boolean(isActiveMember && profile?.member_type === "business");
    const memberStatus = isBusinessMember
      ? "business_member"
      : isActiveMember
      ? "social_member"
      : "non_member";

    // ── Rule resolution ───────────────────────────────────────────────────────
    // Members always count against the house pool, even on the resident link.
    const pool = memberStatus === "non_member" && formVariant === "commonwealth" ? "commonwealth" : "house";

    // social_only is legal only for a NON-MEMBER on the commonwealth form.
    // Member status wins over the commonwealth fork (locked decision).
    const requestedSocialOnly = body.participation === "social_only";
    const socialOnlyAllowed = formVariant === "commonwealth" && memberStatus === "non_member";
    const participation = requestedSocialOnly && socialOnlyAllowed ? "social_only" : "business_and_social";

    // Business members skip the questions entirely. Everyone else doing the
    // business exchange must answer all four.
    const answersRequired = participation === "business_and_social" && memberStatus !== "business_member";
    if (answersRequired && !hasAllAnswers) {
      return json({ error: "All questions are required" }, 400);
    }

    // ── Already registered? ───────────────────────────────────────────────────
    const { data: existingIntake } = await admin
      .from("exchange_intake")
      .select("id, status")
      .eq("event_id", eventId)
      .ilike("email", email)
      .maybeSingle();
    if (existingIntake && existingIntake.status === "submitted") {
      return json({ error: "You are already registered for this event.", already_registered: true }, 409);
    }

    // ── Pool capacity ─────────────────────────────────────────────────────────
    const used = await countPool(admin, eventId, pool);
    if (used >= POOL_CAPS[pool]) {
      log("pool at capacity", { eventId, pool, used });
      return json({ error: "This event is full.", full: true }, 409);
    }

    // ── Person: members by profile_id, everyone else by email ─────────────────
    let personId: string | null = null;
    if (profile?.id) {
      const { data: memberPerson } = await admin
        .from("people")
        .select("id")
        .filter("metadata->>profile_id", "eq", profile.id)
        .maybeSingle();
      if (memberPerson) personId = memberPerson.id;
    }
    if (!personId) {
      const { data: existingPerson } = await admin
        .from("people")
        .select("id, roles")
        .eq("email_lower", email)
        .maybeSingle();
      if (existingPerson) {
        personId = existingPerson.id;
        const roles: string[] = existingPerson.roles ?? [];
        if (!roles.includes("guest") && !roles.includes("member")) {
          roles.push("guest");
          await admin.from("people").update({ roles, updated_at: nowIso }).eq("id", personId);
        }
      } else {
        const { data: newPerson, error: personErr } = await admin
          .from("people")
          .insert({
            // email_lower is GENERATED ALWAYS from email. Never write it.
            email,
            full_name: `${firstName} ${lastName}`,
            phone,
            roles: ["guest"],
            metadata: {
              source: "exchange_intake",
              ...(profile?.id ? { profile_id: profile.id } : {}),
            },
          })
          .select("id")
          .single();
        if (personErr) {
          log("people insert failed", { error: personErr.message, code: (personErr as { code?: string }).code, details: (personErr as { details?: string }).details });
          return json({ error: "Could not complete registration", debug: personErr.message }, 500);
        }
        personId = newPerson.id;
      }
    }

    // ── Contact + remarketing tags (non-members only) ─────────────────────────
    let contactId: string | null = null;
    const fullName = `${firstName} ${lastName}`;
    const { data: existingContact } = await admin
      .from("contacts").select("id").eq("email", email).maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
      await admin.from("contacts")
        .update({ full_name: fullName, phone, last_activity_at: nowIso })
        .eq("id", contactId);
    } else {
      const { data: newContact, error: contactErr } = await admin
        .from("contacts")
        .insert({
          email,
          full_name: fullName,
          phone,
          source: "exchange_intake",
          source_detail: event.title,
          status: "lead",
          contact_type: "prospect",
          first_seen_at: nowIso,
          last_activity_at: nowIso,
        })
        .select("id")
        .single();
      if (contactErr) log("contact insert failed (non-fatal)", { error: contactErr.message });
      else contactId = newContact?.id ?? null;
    }

    if (contactId && memberStatus === "non_member") {
      await admin.from("contact_tags").upsert(
        [
          { contact_id: contactId, tag: "exchange-2026-08-27-registered" },
          { contact_id: contactId, tag: "prospect" },
          ...(pool === "commonwealth" ? [{ contact_id: contactId, tag: "commonwealth-resident" }] : []),
        ],
        { onConflict: "contact_id,tag" }
      );
    }

    // ── Credential: reuse an existing active one, else create ─────────────────
    let credentialId: string | null = null;
    let credentialToken: string | null = null;
    const { data: existingCred } = await admin
      .from("attendance_credentials")
      .select("id, token")
      .eq("person_id", personId)
      .eq("event_id", eventId)
      .eq("status", "active")
      .maybeSingle();
    if (existingCred) {
      credentialId = existingCred.id;
      credentialToken = existingCred.token;
    } else {
      const credType = memberStatus === "non_member" ? "public_rsvp" : "member_rsvp";
      const { data: cred, error: credErr } = await admin
        .from("attendance_credentials")
        .insert({
          token: makeToken("C-"),
          person_id: personId,
          event_id: eventId,
          credential_type: credType,
          status: "active",
          metadata: { source: "exchange_intake", pool, form_variant: formVariant },
        })
        .select("id, token")
        .single();
      if (credErr) {
        if ((credErr as { code?: string }).code === "23505") {
          const { data: raceCred } = await admin
            .from("attendance_credentials")
            .select("id, token")
            .eq("person_id", personId).eq("event_id", eventId).eq("status", "active")
            .maybeSingle();
          credentialId = raceCred?.id ?? null;
          credentialToken = raceCred?.token ?? null;
        } else if ((credErr.message || "").toUpperCase().includes("EVENT_AT_CAPACITY")) {
          return json({ error: "This event is full.", full: true }, 409);
        } else {
          log("credential insert failed", { error: credErr.message });
          return json({ error: "Could not complete registration" }, 500);
        }
      } else {
        credentialId = cred.id;
        credentialToken = cred.token;
      }
    }

    // ── The intake row ────────────────────────────────────────────────────────
    const intakePayload = {
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      profile_id: profile?.id ?? null,
      person_id: personId,
      contact_id: contactId,
      credential_id: credentialId,
      form_variant: formVariant,
      pool,
      participation,
      member_status_at_submit: memberStatus,
      status: "submitted",
      ...(participation === "business_and_social" ? answers : {
        q_role_title: null, q_company: null, q_years_charlotte: null, q_seeking: null,
      }),
      ip_address: ipAddress,
      user_agent: userAgent,
      submitted_at: nowIso,
      updated_at: nowIso,
    };

    if (existingIntake) {
      const { error: updErr } = await admin.from("exchange_intake").update(intakePayload).eq("id", existingIntake.id);
      if (updErr) {
        log("intake update failed", { error: updErr.message, code: (updErr as { code?: string }).code, details: (updErr as { details?: string }).details });
        return json({ error: "Could not save your registration", debug: updErr.message }, 500);
      }
    } else {
      const { error: insErr } = await admin.from("exchange_intake").insert(intakePayload);
      if (insErr) {
        log("intake insert failed", { error: insErr.message, code: (insErr as { code?: string }).code, details: (insErr as { details?: string }).details });
        return json({ error: "Could not save your registration", debug: insErr.message }, 500);
      }
    }

    // ── Confirmation email (non-fatal). Restricted template, service role. ────
    try {
      const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York",
      });
      const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
      });
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          to: email,
          template: "public-rsvp-confirmation",
          data: {
            name: firstName,
            eventName: event.title,
            eventDate: fmtDate(event.start_time),
            eventTime: `${fmtTime(event.start_time)}${event.end_time ? " - " + fmtTime(event.end_time) : ""}`,
            eventLocation: event.location_name || "TBA",
            eventAddress: event.location_address || undefined,
            origin: body.origin || "https://704collective.com",
            eventId: eventId,
            startTimeIso: event.start_time,
            endTimeIso: event.end_time || undefined,
          },
        }),
      });
    } catch (emailErr) {
      log("confirmation email failed (non-fatal)", { error: String(emailErr) });
    }

    log("intake complete", { eventId, pool, participation, memberStatus, formVariant });
    return json({
      success: true,
      credential_token: credentialToken,
      participation,
      member_status: memberStatus,
      pool,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[EXCHANGE-INTAKE] Internal error:", msg);
    return json({ error: "Internal error" }, 500);
  }
});
