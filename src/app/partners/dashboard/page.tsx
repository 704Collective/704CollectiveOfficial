"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [application, setApplication] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      // Check for partner record (approved)
      const { data: partnerData } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (partnerData) {
        setPartner(partnerData);
      }

      // Check for application
      const { data: appData } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (appData) {
        setApplication(appData);
      }

      setLoading(false);
    }

    loadData();
  }, []);

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

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    pending: {
      bg: "rgba(234, 179, 8, 0.08)",
      text: "#EAB308",
      border: "rgba(234, 179, 8, 0.2)",
    },
    approved: {
      bg: "rgba(34, 197, 94, 0.08)",
      text: "#22C55E",
      border: "rgba(34, 197, 94, 0.2)",
    },
    rejected: {
      bg: "rgba(239, 68, 68, 0.08)",
      text: "#EF4444",
      border: "rgba(239, 68, 68, 0.2)",
    },
    active: {
      bg: "rgba(34, 197, 94, 0.08)",
      text: "#22C55E",
      border: "rgba(34, 197, 94, 0.2)",
    },
    blocked: {
      bg: "rgba(239, 68, 68, 0.08)",
      text: "#EF4444",
      border: "rgba(239, 68, 68, 0.2)",
    },
    inactive: {
      bg: "rgba(255, 255, 255, 0.04)",
      text: "rgba(255, 255, 255, 0.4)",
      border: "rgba(255, 255, 255, 0.08)",
    },
  };

  function StatusBadge({ status }: { status: string }) {
    const colors = statusColors[status] || statusColors.inactive;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 12px",
          borderRadius: "9999px",
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          fontSize: "0.75rem",
          fontWeight: 600,
          color: colors.text,
          textTransform: "capitalize",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: colors.text,
          }}
        />
        {status}
      </span>
    );
  }

  return (
    <div>
      {/* Header */}
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
          {partner
            ? `Welcome back, ${partner.contact_name}`
            : application
            ? `Hey, ${application.contact_name}`
            : "Partner Dashboard"}
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
          {partner
            ? "Here's your partner overview."
            : "Here's the status of your application."}
        </p>
      </div>

      {/* Status Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {/* Application Status */}
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "12px",
            }}
          >
            Application Status
          </p>
          {application ? (
            <StatusBadge status={application.status} />
          ) : (
            <span style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: "0.875rem" }}>
              No application found
            </span>
          )}
        </div>

        {/* Partner Type(s) */}
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "12px",
            }}
          >
            Partner Type(s)
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(partner?.partner_types || application?.partner_types || []).map(
              (type: string) => (
                <span
                  key={type}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(198, 166, 100, 0.08)",
                    border: "1px solid rgba(198, 166, 100, 0.15)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#C6A664",
                    textTransform: "capitalize",
                  }}
                >
                  {type}
                </span>
              )
            )}
          </div>
        </div>

        {/* Business Name */}
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "12px",
            }}
          >
            Business
          </p>
          <p
            style={{
              color: "#FAF6F0",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {partner?.business_name || application?.business_name || "—"}
          </p>
        </div>
      </div>

      {/* Application Details */}
      {application && !partner && (
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "32px",
            marginBottom: "24px",
          }}
        >
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "#FAF6F0",
              marginBottom: "20px",
            }}
          >
            Application Details
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            {[
              { label: "Contact", value: application.contact_name },
              { label: "Email", value: application.email },
              { label: "Phone", value: application.phone || "—" },
              { label: "Website", value: application.website || "—" },
              {
                label: "Submitted",
                value: new Date(application.created_at).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" }
                ),
              },
              {
                label: "Status",
                value: application.status,
              },
            ].map((item, i) => (
              <div key={i}>
                <p
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "4px",
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.65)",
                    fontSize: "0.875rem",
                  }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {application.message && (
            <div style={{ marginTop: "20px" }}>
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "4px",
                }}
              >
                Message
              </p>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                }}
              >
                {application.message}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pending Message */}
      {application?.status === "pending" && !partner && (
        <div
          style={{
            backgroundColor: "rgba(234, 179, 8, 0.04)",
            border: "1px solid rgba(234, 179, 8, 0.1)",
            borderRadius: "12px",
            padding: "24px 28px",
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <span style={{ fontSize: "1.25rem", marginTop: "2px" }}>⏳</span>
          <div>
            <h4
              style={{
                color: "#EAB308",
                fontWeight: 600,
                fontSize: "0.9375rem",
                marginBottom: "4px",
              }}
            >
              Application under review
            </h4>
            <p
              style={{
                color: "rgba(255, 255, 255, 0.45)",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
              }}
            >
              Our team reviews every application personally. You{"'"}ll hear back
              within 48 hours. If you have questions, email{" "}
              <a
                href="mailto:hello@704collective.com"
                style={{ color: "#C6A664", textDecoration: "none" }}
              >
                hello@704collective.com
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Approved Partner Content */}
      {partner && (
        <div
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.04)",
            border: "1px solid rgba(34, 197, 94, 0.1)",
            borderRadius: "12px",
            padding: "24px 28px",
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <span style={{ fontSize: "1.25rem", marginTop: "2px" }}>✅</span>
          <div>
            <h4
              style={{
                color: "#22C55E",
                fontWeight: 600,
                fontSize: "0.9375rem",
                marginBottom: "4px",
              }}
            >
              You{"'"}re an active 704 Partner
            </h4>
            <p
              style={{
                color: "rgba(255, 255, 255, 0.45)",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
              }}
            >
              Welcome to the family. Your partner dashboard will expand with
              more features soon — event calendar, messaging, and analytics.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}