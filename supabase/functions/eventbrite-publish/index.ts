import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * eventbrite-publish — Called from AdminEventsTab when admin flips the Eventbrite toggle.
 *
 * Payload: { event_id: string, action: "publish" | "unpublish" }
 *
 * On publish:
 *   1. Load event from Supabase
 *   2. If no eventbrite_event_id, create the event on Eventbrite, then publish it
 *   3. If eventbrite_event_id exists, just publish it
 *   4. Save eventbrite_event_id + eventbrite_url back to events table
 *
 * On unpublish:
 *   1. Load eventbrite_event_id from events table
 *   2. Call Eventbrite unpublish endpoint
 *   3. Clear eventbrite_url (keep eventbrite_event_id for re-publish later)
 *
 * Eventbrite Organization ID: 2989352320198
 */

const EB_API_BASE = "https://www.eventbriteapi.com/v3";
const EB_ORG_ID = "2989352320198";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const EVENTBRITE_API_KEY = Deno.env.get("EVENTBRITE_API_KEY")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { event_id, action } = await req.json() as { event_id: string; action: "publish" | "unpublish" };

    if (!event_id || !action) {
      return new Response(JSON.stringify({ error: "event_id and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["publish", "unpublish"].includes(action)) {
      return new Response(JSON.stringify({ error: "action must be publish or unpublish" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load event from Supabase
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", event_id)
      .single();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ebHeaders = {
      Authorization: `Bearer ${EVENTBRITE_API_KEY}`,
      "Content-Type": "application/json",
    };

    // --- UNPUBLISH ---
    if (action === "unpublish") {
      if (!event.eventbrite_event_id) {
        return new Response(JSON.stringify({ error: "Event is not published to Eventbrite" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(
        `${EB_API_BASE}/events/${event.eventbrite_event_id}/unpublish/`,
        { method: "POST", headers: ebHeaders }
      );

      if (!res.ok) {
        const errData = await res.json();
        console.error("Eventbrite unpublish failed:", errData);
        return new Response(JSON.stringify({ error: "Eventbrite unpublish failed", detail: errData }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("events")
        .update({ eventbrite_published: false, eventbrite_url: null })
        .eq("id", event_id);

      return new Response(JSON.stringify({ success: true, action: "unpublished" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- PUBLISH ---

    let ebEventId: string = event.eventbrite_event_id ?? null;

    // Step 1: Create the event on Eventbrite if it doesn't exist yet
    if (!ebEventId) {
      const startUtc = new Date(event.start_time).toISOString().replace(".000", "");
      const endTime = event.end_time
        ? new Date(event.end_time).toISOString().replace(".000", "")
        : new Date(new Date(event.start_time).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(".000", "");

      const createPayload = {
        event: {
          name: { html: event.title },
          description: { html: event.description ?? "" },
          start: { timezone: "America/New_York", utc: startUtc },
          end: { timezone: "America/New_York", utc: endTime },
          currency: "USD",
          online_event: !event.location,
          listed: true,
          shareable: true,
          invite_only: false,
          capacity: event.max_attendees ?? null,
        },
      };

      const createRes = await fetch(
        `${EB_API_BASE}/organizations/${EB_ORG_ID}/events/`,
        { method: "POST", headers: ebHeaders, body: JSON.stringify(createPayload) }
      );

      const createData = await createRes.json();

      if (!createRes.ok) {
        console.error("Eventbrite create failed:", createData);
        return new Response(JSON.stringify({ error: "Failed to create Eventbrite event", detail: createData }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      ebEventId = createData.id;

      // Step 2: Create a venue if location is provided
      if (event.location) {
        const venueRes = await fetch(
          `${EB_API_BASE}/organizations/${EB_ORG_ID}/venues/`,
          {
            method: "POST",
            headers: ebHeaders,
            body: JSON.stringify({
              venue: {
                name: event.location,
                address: {
                  city: "Charlotte",
                  region: "NC",
                  country: "US",
                  address_1: event.location,
                },
              },
            }),
          }
        );

        if (venueRes.ok) {
          const venueData = await venueRes.json();
          await fetch(`${EB_API_BASE}/events/${ebEventId}/`, {
            method: "POST",
            headers: ebHeaders,
            body: JSON.stringify({ event: { venue_id: venueData.id } }),
          });
        }
      }

      // Step 3: Create a ticket class (required before publishing)
      const isFreeEvent = !event.price || Number(event.price) === 0;
      const ticketPayload = isFreeEvent
        ? {
            ticket_class: {
              name: "General Admission",
              free: true,
              quantity_total: event.max_attendees ?? 100,
            },
          }
        : {
            ticket_class: {
              name: "General Admission",
              free: false,
              cost: `USD,${Math.round(Number(event.price) * 100)}`,
              quantity_total: event.max_attendees ?? 100,
            },
          };

      await fetch(`${EB_API_BASE}/events/${ebEventId}/ticket_classes/`, {
        method: "POST",
        headers: ebHeaders,
        body: JSON.stringify(ticketPayload),
      });

      // Step 4: Upload event image if available
      if (event.image_url) {
        try {
          const uploadRes = await fetch(`${EB_API_BASE}/media/upload/?type=image-event-logo`, {
            headers: ebHeaders,
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            const imgRes = await fetch(event.image_url);
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

              const form = new FormData();
              for (const [k, v] of Object.entries(uploadData.upload_data ?? {})) {
                form.append(k, v as string);
              }
              form.append("file", new Blob([imgBuffer], { type: contentType }), "event-image.jpg");

              await fetch(uploadData.upload_url, { method: "POST", body: form });

              const cropRes = await fetch(`${EB_API_BASE}/media/upload/?upload_token=${uploadData.upload_token}`, {
                method: "POST",
                headers: ebHeaders,
                body: JSON.stringify({ upload_token: uploadData.upload_token, crop_mask: null }),
              });
              if (cropRes.ok) {
                const cropData = await cropRes.json();
                await fetch(`${EB_API_BASE}/events/${ebEventId}/`, {
                  method: "POST",
                  headers: ebHeaders,
                  body: JSON.stringify({ event: { logo_id: cropData.id } }),
                });
              }
            }
          }
        } catch (imgErr) {
          console.warn("Failed to upload event image to Eventbrite (non-fatal):", imgErr);
        }
      }
    }

    // Step 5: Publish the event
    const publishRes = await fetch(
      `${EB_API_BASE}/events/${ebEventId}/publish/`,
      { method: "POST", headers: ebHeaders }
    );

    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      console.error("Eventbrite publish failed:", publishData);
      await supabase
        .from("events")
        .update({ eventbrite_event_id: ebEventId })
        .eq("id", event_id);

      return new Response(
        JSON.stringify({ error: "Event created on Eventbrite but publish failed", detail: publishData, eventbrite_event_id: ebEventId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 6: Save back to Supabase
    const eventbriteUrl = `https://www.eventbrite.com/e/${ebEventId}`;
    await supabase
      .from("events")
      .update({
        eventbrite_event_id: ebEventId,
        eventbrite_published: true,
        eventbrite_url: eventbriteUrl,
      })
      .eq("id", event_id);

    return new Response(
      JSON.stringify({
        success: true,
        action: "published",
        eventbrite_event_id: ebEventId,
        eventbrite_url: eventbriteUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("eventbrite-publish error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});