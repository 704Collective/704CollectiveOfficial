// discussion-media-upload — hands an authenticated, discussion-eligible member a
// presigned R2 PUT URL so the browser uploads media directly to Cloudflare R2.
// Gate: caller must pass can_view_event_discussion(event_id). Returns { uploadUrl, publicUrl, key }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "704-discussion-media";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? "";

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm",
]);
const MAX_BYTES = 500 * 1024 * 1024; // 500MB ceiling per file

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { event_id, file_name, content_type, file_size } = await req.json();
    if (!event_id || !file_name || !content_type) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!ALLOWED_TYPES.has(content_type)) return new Response(JSON.stringify({ error: "File type not allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (typeof file_size === "number" && file_size > MAX_BYTES) return new Response(JSON.stringify({ error: "File too large (500MB max)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Gate: caller must be able to view this event's discussion (RLS-equivalent check, run AS the user).
    const { data: allowed, error: gateErr } = await userClient.rpc("can_view_event_discussion", { p_event_id: event_id });
    if (gateErr || allowed !== true) return new Response(JSON.stringify({ error: "Not eligible for this discussion" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Build a collision-proof object key: eventId/userId/timestamp-random.ext
    const ext = (file_name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `${event_id}/${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    // Presign a PUT to R2 (S3-compatible), valid 10 minutes.
    const aws = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
    const target = `${R2_ENDPOINT}/${R2_BUCKET}/${key}?X-Amz-Expires=600`;
    const signed = await aws.sign(new Request(target, { method: "PUT", headers: { "Content-Type": content_type } }), { aws: { signQuery: true } });

    return new Response(JSON.stringify({
      uploadUrl: signed.url,
      key,
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
      contentType: content_type,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
