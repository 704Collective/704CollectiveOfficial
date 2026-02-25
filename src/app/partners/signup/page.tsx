"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

const partnerTypeOptions = [
  {
    id: "vendor",
    label: "Vendor",
    tooltip: "You offer a product, service, or experience to our members",
  },
  {
    id: "venue",
    label: "Venue",
    tooltip: "You have a space that can host our events",
  },
  {
    id: "sponsor",
    label: "Sponsor",
    tooltip: "You want brand visibility with our engaged audience",
  },
];

export default function PartnerSignup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleType(id: string) {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (selectedTypes.length === 0) {
      setError("Please select at least one partner type.");
      setLoading(false);
      return;
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
          contact_name: contactName,
          role: "partner",
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Create application record
    if (authData.user) {
      const { error: appError } = await supabase
        .from("applications")
        .insert({
          user_id: authData.user.id,
          email,
          business_name: businessName,
          contact_name: contactName,
          phone: phone || null,
          website: website || null,
          partner_types: selectedTypes,
          message: message || null,
          status: "pending",
        });

      if (appError) {
        setError("Account created but application failed to save. Please contact us at hello@704collective.com");
        setLoading(false);
        return;
      }
    }

    router.push("/partners/dashboard");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Link
            href="/partners"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              border: "1px solid rgba(198,166,100,0.25)",
              borderRadius: "9999px",
              padding: "8px 20px",
              marginBottom: "24px",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#C6A664",
              }}
            />
            <span
              style={{
                color: "#C6A664",
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
              }}
            >
              Partner Portal
            </span>
          </Link>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#FAF6F0",
              letterSpacing: "-0.025em",
              marginBottom: "8px",
            }}
          >
            Become a partner
          </h1>
          <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
            {step === 1
              ? "Tell us about your business"
              : "Select your partner type(s) and submit"}
          </p>

          {/* Progress indicator */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              marginTop: "20px",
            }}
          >
            {[1, 2].map((s) => (
              <div
                key={s}
                style={{
                  width: s === step ? "32px" : "8px",
                  height: "4px",
                  borderRadius: "2px",
                  backgroundColor:
                    s === step ? "#C6A664" : "rgba(255, 255, 255, 0.1)",
                  transition: "all 300ms ease",
                }}
              />
            ))}
          </div>
        </div>

        <form onSubmit={handleSignup}>
          {/* Step 1: Business Info */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "8px",
                  }}
                >
                  Business Name *
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="Your Business Name"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "8px",
                  }}
                >
                  Your Name *
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="Full Name"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "8px",
                  }}
                >
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="you@company.com"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "8px",
                  }}
                >
                  Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="Min 6 characters"
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "rgba(255, 255, 255, 0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "8px",
                    }}
                  >
                    Phone
                  </label>
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
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "rgba(255, 255, 255, 0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "8px",
                    }}
                  >
                    Website
                  </label>
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

              <button
                type="button"
                onClick={() => {
                  if (!businessName || !contactName || !email || !password) {
                    setError("Please fill in all required fields.");
                    return;
                  }
                  if (password.length < 6) {
                    setError("Password must be at least 6 characters.");
                    return;
                  }
                  setError("");
                  setStep(2);
                }}
                className="btn-gold"
                style={{ width: "100%", padding: "14px", fontSize: "0.875rem" }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: Partner Types + Message */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "12px",
                  }}
                >
                  Partner Type(s) * — Select all that apply
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {partnerTypeOptions.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => toggleType(type.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 18px",
                        backgroundColor: selectedTypes.includes(type.id)
                          ? "rgba(198, 166, 100, 0.08)"
                          : "#1A1A1A",
                        border: `1px solid ${
                          selectedTypes.includes(type.id)
                            ? "rgba(198, 166, 100, 0.3)"
                            : "rgba(255, 255, 255, 0.08)"
                        }`,
                        borderRadius: "10px",
                        cursor: "pointer",
                        transition: "all 200ms ease",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Checkbox */}
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "4px",
                            border: `2px solid ${
                              selectedTypes.includes(type.id)
                                ? "#C6A664"
                                : "rgba(255, 255, 255, 0.15)"
                            }`,
                            backgroundColor: selectedTypes.includes(type.id)
                              ? "#C6A664"
                              : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "all 200ms ease",
                          }}
                        >
                          {selectedTypes.includes(type.id) && (
                            <span
                              style={{
                                color: "#000",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <div>
                          <span
                            style={{
                              color: selectedTypes.includes(type.id)
                                ? "#FAF6F0"
                                : "rgba(255, 255, 255, 0.6)",
                              fontWeight: 600,
                              fontSize: "0.9375rem",
                            }}
                          >
                            {type.label}
                          </span>
                          <p
                            style={{
                              color: "rgba(255, 255, 255, 0.35)",
                              fontSize: "0.75rem",
                              marginTop: "2px",
                            }}
                          >
                            {type.tooltip}
                          </p>
                        </div>
                      </div>

                      {/* Tooltip ? */}
                      <span
                        title={type.tooltip}
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          color: "rgba(255, 255, 255, 0.25)",
                          flexShrink: 0,
                          cursor: "help",
                        }}
                      >
                        ?
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "8px",
                  }}
                >
                  Anything else we should know?
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: "80px",
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="Tell us a bit about what you're looking for in a partnership..."
                />
              </div>

              {error && (
                <div
                  style={{
                    backgroundColor: "rgba(220, 38, 38, 0.1)",
                    border: "1px solid rgba(220, 38, 38, 0.2)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    marginBottom: "16px",
                    fontSize: "0.8125rem",
                    color: "#EF4444",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-ghost"
                  style={{
                    padding: "14px 20px",
                    fontSize: "0.875rem",
                    flex: "0 0 auto",
                  }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gold"
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontSize: "0.875rem",
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer links */}
        <div
          style={{
            textAlign: "center",
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <p style={{ color: "#A0A0A0", fontSize: "0.8125rem" }}>
            Already have an account?{" "}
            <Link
              href="/partners/login"
              style={{
                color: "#C6A664",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Log in
            </Link>
          </p>
          <Link
            href="/partners"
            style={{
              color: "rgba(255, 255, 255, 0.3)",
              fontSize: "0.75rem",
              textDecoration: "none",
            }}
          >
            ← Back to Partner Info
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared styles ─── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "10px",
  color: "#FAF6F0",
  fontSize: "0.9375rem",
  outline: "none",
  transition: "border-color 200ms ease",
  fontFamily: "inherit",
};

function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(198, 166, 100, 0.3)";
}

function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
}