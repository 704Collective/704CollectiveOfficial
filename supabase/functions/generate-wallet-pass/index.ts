import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── helpers ──────────────────────────────────────────────────────────────

function base64url(input: Uint8Array): string {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function createServiceAccountJwt(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    sub: email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
  };

  const enc = new TextEncoder();
  const input = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)));
  return `${input}.${base64url(sig)}`;
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createServiceAccountJwt(email, privateKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform } = await req.json().catch(() => ({ platform: "google" }));

    // ── Apple placeholder ──
    if (platform === "apple") {
      return new Response(
        JSON.stringify({ error: "Apple Wallet passes coming soon", available: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // ── Fetch profile ──
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, member_since, subscription_status, created_at")
      .eq("id", userId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.subscription_status !== "active") {
      return new Response(JSON.stringify({ error: "Active membership required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Google Wallet secrets ──
    const issuerId = Deno.env.get("GOOGLE_WALLET_ISSUER_ID");
    const serviceAccountEmail = Deno.env.get("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_WALLET_PRIVATE_KEY");

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return new Response(JSON.stringify({ error: "Google Wallet not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build pass ──
    const classId = `${issuerId}.704collective_social`;
    const objectId = `${issuerId}.member_${userId.replace(/-/g, "_")}`;

    const memberSince = profile.member_since || profile.created_at;
    const memberSinceFormatted = memberSince
      ? new Date(memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "2025";

    const genericObject = {
      id: objectId,
      classId: classId,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      hexBackgroundColor: "#0a0a0a",
      logo: {
        sourceUri: {
          uri: "https://704collective.com/favicon.ico",
        },
      },
      cardTitle: {
        defaultValue: { language: "en", value: "704 Collective" },
      },
      subheader: {
        defaultValue: { language: "en", value: "Social Member" },
      },
      header: {
        defaultValue: { language: "en", value: profile.full_name || "Member" },
      },
      textModulesData: [
        {
          id: "member_since",
          header: "MEMBER SINCE",
          body: memberSinceFormatted,
        },
        {
          id: "location",
          header: "LOCATION",
          body: "Charlotte, NC",
        },
      ],
      barcode: {
        type: "QR_CODE",
        value: profile.id,
        alternateText: profile.id.substring(0, 8).toUpperCase(),
      },
    };

    // ── Ensure class exists ──
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);

    const classPayload = {
      id: classId,
      issuerName: "704 Collective",
      reviewStatus: "UNDER_REVIEW",
    };

    // Try creating class (ignore 409 = already exists)
    const classRes = await fetch(
      "https://walletobjects.googleapis.com/walletobjects/v1/genericClass",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(classPayload),
      }
    );
    if (!classRes.ok && classRes.status !== 409) {
      const errText = await classRes.text();
      console.error("Class creation failed:", errText);
    } else {
      await classRes.text(); // consume body
    }

    // ── Create or update object ──
    const objRes = await fetch(
      "https://walletobjects.googleapis.com/walletobjects/v1/genericObject",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(genericObject),
      }
    );

    if (!objRes.ok && objRes.status === 409) {
      // Already exists — update it
      await objRes.text();
      const updateRes = await fetch(
        `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(genericObject),
        }
      );
      await updateRes.text();
    } else if (!objRes.ok) {
      const errText = await objRes.text();
      console.error("Object creation failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to create wallet pass" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      await objRes.text();
    }

    // ── Build save URL ──
    // Create a JWT for the "Add to Google Wallet" button
    const claims = {
      iss: serviceAccountEmail,
      aud: "google",
      origins: ["https://704collective.com"],
      typ: "savetowallet",
      payload: {
        genericObjects: [{ id: objectId }],
      },
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = { alg: "RS256", typ: "JWT" };
    const jwtPayload = { ...claims, iat: now, exp: now + 3600 };

    const enc = new TextEncoder();
    const jwtInput = `${base64url(enc.encode(JSON.stringify(jwtHeader)))}.${base64url(enc.encode(JSON.stringify(jwtPayload)))}`;
    const key = await importPrivateKey(privateKey);
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(jwtInput)));
    const saveJwt = `${jwtInput}.${base64url(sig)}`;

    const walletUrl = `https://pay.google.com/gp/v/save/${saveJwt}`;

    return new Response(JSON.stringify({ walletUrl, available: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Wallet pass error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
