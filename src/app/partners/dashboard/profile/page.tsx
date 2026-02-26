"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [application, setApplication] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: partnerData } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (partnerData) {
        setPartner(partnerData);
        setBusinessName(partnerData.business_name || "");
        setContactName(partnerData.contact_name || "");
        setEmail(partnerData.email || "");
        setPhone(partnerData.phone || "");
        setWebsite(partnerData.website || "");
      } else {
        const { data: appData } = await supabase
          .from("applications")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (appData) {
          setApplication(appData);
          setBusinessName(appData.business_name || "");
          setContactName(appData.contact_name || "");
          setEmail(appData.email || "");
          setPhone(appData.phone || "");
          setWebsite(appData.website || "");
        }
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const updates = {
      business_name: businessName,
      contact_name: contactName,
      phone: phone || null,
      website: website || null,
      updated_at: new Date().toISOString(),
    };

    if (partner) {
      await supabase
        .from("partners")
        .update(updates)
        .eq("id", partner.id);
    }

    if (application) {
      await supabase
        .from("applications")
        .update(updates)
        .eq("id", application.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 0" }}>
        <div
          style={{
            width: "20px",
            height: "20px",
            border: "2px solid rgba(198, 166, 100, 0.2)",
            borderTopColor: "#C6A664",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isApproved = !!partner;

  return (
    <div>
      <div style={{ marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#FAF6F0",
            letterSpacing: "-0.025em",
            marginBottom: "8px",
          }}
        >
          Profile
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
          {isApproved
            ? "Manage your partner profile and contact information."
            : "Review your application details. Edits will update your application."}
        </p>
      </div>

      <div
        style={{
          backgroundColor: "#1A1A1A",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "560px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={labelStyle}>Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          <div>
            <label style={labelStyle}>Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              disabled
              style={{
                ...inputStyle,
                opacity: 0.5,
                cursor: "not-allowed",
              }}
            />
            <p
              style={{
                fontSize: "0.6875rem",
                color: "rgba(255, 255, 255, 0.25)",
                marginTop: "4px",
              }}
            >
              Email cannot be changed. Contact hello@704collective.com for help.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="xxx-xxx-xxxx"
              />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Partner Types (read-only) */}
          <div>
            <label style={labelStyle}>Partner Type(s)</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(
                partner?.partner_types ||
                application?.partner_types ||
                []
              ).map((type: string) => (
                <span
                  key={type}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(198, 166, 100, 0.08)",
                    border: "1px solid rgba(198, 166, 100, 0.15)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#C6A664",
                    textTransform: "capitalize",
                  }}
                >
                  {type}
                </span>
              ))}
            </div>
            <p
              style={{
                fontSize: "0.6875rem",
                color: "rgba(255, 255, 255, 0.25)",
                marginTop: "6px",
              }}
            >
              To change partner types, contact hello@704collective.com
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div
          style={{
            marginTop: "32px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-gold"
            style={{
              padding: "12px 32px",
              fontSize: "0.8125rem",
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          {saved && (
            <span
              style={{
                color: "#22C55E",
                fontSize: "0.8125rem",
                fontWeight: 600,
              }}
            >
              ✓ Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  backgroundColor: "#0A0A0A",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  color: "#FAF6F0",
  fontSize: "0.9375rem",
  outline: "none",
  transition: "border-color 200ms ease",
  fontFamily: "inherit",
};

function handleFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  e.currentTarget.style.borderColor = "rgba(198, 166, 100, 0.3)";
}

function handleBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
}