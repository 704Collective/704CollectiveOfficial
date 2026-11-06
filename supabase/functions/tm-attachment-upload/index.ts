// tm-attachment-upload — hands an authenticated Tasks staff member a
// presigned R2 PUT URL so the browser uploads a task attachment directly to Cloudflare R2.
// Gate: caller must be able to tm_get_task(task_id). Returns { uploadUrl, publicUrl, key }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "704-discussion-media";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? "";

const MAX_BYTES = 25 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { task_id, file_name, content_type, file_size } = await req.json();
    if (!task_id || !file_name) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof file_size === "number" && file_size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "File too large (25MB max)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowed, error: gateErr } = await userClient.rpc("tm_get_task", { p_id: task_id });
    if (gateErr || !allowed) {
      return new Response(JSON.stringify({ error: "Not allowed for this task" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (file_name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `tm/${task_id}/${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const type = typeof content_type === "string" && content_type ? content_type : "application/octet-stream";

    const aws = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
    const target = `${R2_ENDPOINT}/${R2_BUCKET}/${key}?X-Amz-Expires=600`;
    const signed = await aws.sign(new Request(target, { method: "PUT", headers: { "Content-Type": type } }), {
      aws: { signQuery: true },
    });

    return new Response(
      JSON.stringify({
        uploadUrl: signed.url,
        key,
        publicUrl: `${R2_PUBLIC_URL}/${key}`,
        contentType: type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
