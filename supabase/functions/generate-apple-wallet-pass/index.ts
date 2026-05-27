// generate-apple-wallet-pass
// V1 - static .pkpass generation for 704 Collective membership cards.
//
// Flow:
//   1. JWT auth -> load profile via service-role
//   2. Verify caller is an active social/business member (or admin)
//   3. Build pass.json + manifest.json (SHA-1 hex of every file)
//   4. Sign manifest.json using the Pass Type ID cert + WWDR intermediate
//      (PKCS#7 detached, DER-encoded -> file named `signature`)
//   5. Zip pass.json + manifest.json + signature + 5 PNG assets -> .pkpass
//   6. Return the bytes with `application/vnd.apple.pkpass`
//
// Deploy:  supabase functions deploy generate-apple-wallet-pass

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import forge from "npm:node-forge@1.3.1";
import JSZip from "npm:jszip@3.10.1";
import {
  ICON_1X_BASE64,
  ICON_2X_BASE64,
  ICON_3X_BASE64,
  LOGO_1X_BASE64,
  LOGO_2X_BASE64,
  base64ToUint8Array,
} from "./embedded-assets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[APPLE-WALLET-PASS] ${step}${d}`);
};

// Apple WWDR G4 intermediate certificate (expires 2030-12-10)
// Source: https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
const WWDR_G4_PEM = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQELBQAwYjELMAkG
A1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRp
b24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMw
MTIxMDAwMDAwMFowdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlv
bnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJ
bmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAfeKp6JzKw
Rl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjov9Y5Ui8eZ/xx8YJtPH4G
UnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41tQSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQy
ziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQ
YojZQykn/e2kv1MukBVlPNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeH
dSbCb64DYyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1Ud
IwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0BggrBgEFBQcwAYYo
aHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJvb3RjYTAuBgNVHR8EJzAlMCOgIaAf
hh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+
kchbd6gwDgYDVR0PAQH/BAQDAgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IB
AQA/Vj2e5bbDeeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPefx4elUWY0Gzlx
OSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJEtHlgepZAE9bPFo22noicwkJ
ac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQA1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xK
X+udO7xPiEAGE/+QF4oIRynoYpgppU8RBWk6z/Kf
-----END CERTIFICATE-----`;

// helpers

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function forgeBinaryToUint8Array(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// Synchronous: decodes a base64 constant — no I/O, no filesystem access.
function loadAssetBytes(filename: string): Uint8Array {
  switch (filename) {
    case "icon.png":    return base64ToUint8Array(ICON_1X_BASE64);
    case "icon@2x.png": return base64ToUint8Array(ICON_2X_BASE64);
    case "icon@3x.png": return base64ToUint8Array(ICON_3X_BASE64);
    case "logo.png":    return base64ToUint8Array(LOGO_1X_BASE64);
    case "logo@2x.png": return base64ToUint8Array(LOGO_2X_BASE64);
    default: throw new Error(`Unknown asset: ${filename}`);
  }
}

function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });
}

function tierLabel(memberType: string | null | undefined): string {
  if (memberType === "business") return "704 Business";
  if (memberType === "social") return "704 Social";
  return "704 Member";
}

function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(-8).toUpperCase();
}

// main

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    logStep("Function started");

    // Required secrets
    const passTypeIdentifier = Deno.env.get("APPLE_PASS_TYPE_ID");
    const teamIdentifier = Deno.env.get("APPLE_TEAM_ID");
    const certBase64 = Deno.env.get("APPLE_PASS_CERT_BASE64");
    const certPassword = Deno.env.get("APPLE_PASS_CERT_PASSWORD") ?? "";

    if (!passTypeIdentifier || !teamIdentifier || !certBase64) {
      logStep("Missing required Apple secrets");
      return new Response(
        JSON.stringify({ error: "Server is missing APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, or APPLE_PASS_CERT_BASE64" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (WWDR_G4_PEM.includes("__PASTE_APPLE_WWDR_G4_PEM_HERE__")) {
      logStep("WWDR G4 PEM placeholder still in source");
      return new Response(
        JSON.stringify({ error: "Server is missing the embedded Apple WWDR G4 certificate" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      logStep("JWT validation failed", { error: claimsError?.message });
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId });

    // Profile lookup + member gate
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, member_type, subscription_status, membership_override, created_at, member_since, deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      logStep("Profile lookup failed", { error: profileError?.message });
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.deleted_at) {
      return new Response(JSON.stringify({ error: "Account is deleted" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = profile.role ?? "lead";
    const isAdmin = role === "admin" || role === "super_admin";
    const isActiveMember =
      (profile.member_type === "social" || profile.member_type === "business") &&
      (profile.subscription_status === "active" ||
        profile.subscription_status === "trialing" ||
        profile.membership_override === true);

    if (!isAdmin && !isActiveMember) {
      logStep("Member is not active", {
        role,
        member_type: profile.member_type,
        subscription_status: profile.subscription_status,
        membership_override: profile.membership_override,
      });
      return new Response(JSON.stringify({ error: "Active membership required to generate a wallet pass" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Member verified", { member_type: profile.member_type, role });

    // -- Apple Wallet push: per-pass authentication token --
    // Each pass carries a secret authenticationToken. Apple's web service
    // verifies it on every device call. Stored in apple_wallet_passes keyed
    // by serialNumber (the profile id). Upsert so regenerating a pass for the
    // same member refreshes the row instead of failing on the primary key.
    const passSerial = String(profile.id);
    const authTokenBytes = new Uint8Array(24);
    crypto.getRandomValues(authTokenBytes);
    const passAuthToken = Array.from(authTokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: passUpsertError } = await adminClient
      .from("apple_wallet_passes")
      .upsert(
        {
          serial_number: passSerial,
          auth_token: passAuthToken,
          person_id: null,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "serial_number" },
      );
    if (passUpsertError) {
      logStep("Failed to store apple_wallet_passes row", { error: passUpsertError.message });
      return new Response(JSON.stringify({ error: "Failed to register wallet pass" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("Wallet pass auth token stored", { passSerial });

    // Build pass.json
    const memberSinceISO: string | null = (profile.member_since as string | null) ?? (profile.created_at as string | null) ?? null;
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier,
      serialNumber: profile.id,
      teamIdentifier,
      organizationName: "704 Collective",
      description: "704 Collective Membership",
      webServiceURL: "https://704collective.com/api/wallet/apple/v1",
      authenticationToken: passAuthToken,
      logoText: "",
      backgroundColor: "rgb(26, 26, 26)",
      foregroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(198, 166, 100)",
      generic: {
        primaryFields: [
          { key: "name", label: "MEMBER", value: profile.full_name ?? "Member" },
        ],
        secondaryFields: [
          { key: "tier", label: "TIER", value: tierLabel(profile.member_type as string | null) },
          { key: "since", label: "MEMBER SINCE", value: formatMonthYear(memberSinceISO) },
        ],
        auxiliaryFields: [
          { key: "id", label: "ID", value: shortId(String(profile.id)) },
        ],
        backFields: [
          {
            key: "terms",
            label: "Terms",
            value:
              "This digital membership card is property of 704 Collective. Not transferable. Subject to active membership status. Visit 704collective.com to manage your membership.",
          },
          { key: "support", label: "Support", value: "hello@704collective.com" },
        ],
      },
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: String(profile.id),
          messageEncoding: "iso-8859-1",
        },
      ],
    };

    const passJsonString = JSON.stringify(passJson);
    const passJsonBytes = new TextEncoder().encode(passJsonString);
    logStep("pass.json built", { size: passJsonBytes.length });

    // Load asset PNGs from embedded base64 constants (no filesystem I/O)
    const icon   = loadAssetBytes("icon.png");
    const icon2x = loadAssetBytes("icon@2x.png");
    const icon3x = loadAssetBytes("icon@3x.png");
    const logo   = loadAssetBytes("logo.png");
    const logo2x = loadAssetBytes("logo@2x.png");
    logStep("Assets loaded");

    // Build manifest.json (SHA-1 of every file)
    const manifest: Record<string, string> = {
      "pass.json":    await sha1Hex(passJsonBytes),
      "icon.png":     await sha1Hex(icon),
      "icon@2x.png":  await sha1Hex(icon2x),
      "icon@3x.png":  await sha1Hex(icon3x),
      "logo.png":     await sha1Hex(logo),
      "logo@2x.png":  await sha1Hex(logo2x),
    };
    const manifestJsonString = JSON.stringify(manifest);
    const manifestJsonBytes = new TextEncoder().encode(manifestJsonString);
    logStep("manifest.json built");

    // Decode .p12 and extract cert + private key
    let passTypeCert: forge.pki.Certificate;
    let passTypePrivateKey: forge.pki.PrivateKey;
    try {
      const p12Der = forge.util.decode64(certBase64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPassword);

      // certBag
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBagList = certBags[forge.pki.oids.certBag] ?? [];
      if (certBagList.length === 0 || !certBagList[0]?.cert) {
        throw new Error("No certificate found in .p12 bundle");
      }
      passTypeCert = certBagList[0].cert as forge.pki.Certificate;

      // keyBag (try shrouded first, then plain)
      const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const keyBag =
        (shrouded[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0] ??
        (plain[forge.pki.oids.keyBag] ?? [])[0];
      if (!keyBag?.key) {
        throw new Error("No private key found in .p12 bundle");
      }
      passTypePrivateKey = keyBag.key as forge.pki.PrivateKey;

      logStep("Certificate + private key decoded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Failed to decode .p12", { error: msg });
      return new Response(
        JSON.stringify({ error: "Failed to decode certificate (check APPLE_PASS_CERT_PASSWORD)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sign manifest.json (PKCS#7 detached, DER)
    let signatureBytes: Uint8Array;
    try {
      const wwdrCert = forge.pki.certificateFromPem(WWDR_G4_PEM);

      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(manifestJsonString, "utf8");
      p7.addCertificate(passTypeCert);
      p7.addCertificate(wwdrCert);
      p7.addSigner({
        key: passTypePrivateKey,
        certificate: passTypeCert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() },
        ],
      });
      p7.sign({ detached: true });

      const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
      signatureBytes = forgeBinaryToUint8Array(der);
      logStep("Manifest signed", { signatureSize: signatureBytes.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Failed to sign manifest", { error: msg });
      return new Response(JSON.stringify({ error: "Failed to sign pass" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bundle as .pkpass (zip)
    let pkpassBytes: Uint8Array;
    try {
      const zip = new JSZip();
      zip.file("pass.json", passJsonBytes);
      zip.file("manifest.json", manifestJsonBytes);
      zip.file("signature", signatureBytes);
      zip.file("icon.png", icon);
      zip.file("icon@2x.png", icon2x);
      zip.file("icon@3x.png", icon3x);
      zip.file("logo.png", logo);
      zip.file("logo@2x.png", logo2x);
      pkpassBytes = await zip.generateAsync({ type: "uint8array" });
      logStep("pkpass bundle built", { size: pkpassBytes.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Failed to zip pass bundle", { error: msg });
      return new Response(JSON.stringify({ error: "Failed to build pass bundle" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Done
    return new Response(pkpassBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": 'attachment; filename="704-collective.pkpass"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("Unhandled error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});