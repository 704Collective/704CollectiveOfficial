"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StatusPage() {
  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);

  useEffect(() => {
    async function loadStatus() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: partnerData } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (partnerData) setPartner(partnerData);

      const { data: appData } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (appData) setApplication(appData);

      setLoading(false);
    }

    loadStatus();
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

  const status = partner ? "active" : application?.status || "none";

  const steps = [
    {
      label: "Application Submitted",
      complete: !!application,
      date: application?.created_at,
    },
    {
      label: "Under Review",
      complete: application?.status !== "pending" || !!partner,
      active: application?.status === "pending" && !partner,
      date: null,
    },
    {
      label: "Approved",
      complete: application?.status === "approved" || !!partner,
      date: application?.status === "approved" ? application?.updated_at : null,
    },
    {
      label: "Partner Active",
      complete: !!partner,
      date: partner?.created_at,
    },
  ];

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
          Status
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
          Track your application and partnership status.
        </p>
      </div>

      {/* Current Status */}
      <div
        style={{
          backgroundColor: "#1A1A1A",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "12px",
          padding: "28px 32px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "8px",
            }}
          >
            Current Status
          </p>
          <StatusBadge status={status} />
        </div>

        {application && (
          <div style={{ textAlign: "right" }}>
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
              Applied
            </p>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "0.875rem" }}>
              {new Date(application.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div
        style={{
          backgroundColor: "#1A1A1A",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "500px",
        }}
      >
        <h3
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "#FAF6F0",
            marginBottom: "28px",
          }}
        >
          Application Timeline
        </h3>

        <div style={{ position: "relative" }}>
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const dotColor = step.complete
              ? "#22C55E"
              : step.active
              ? "#EAB308"
              : "rgba(255, 255, 255, 0.1)";

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "16px",
                  marginBottom: isLast ? 0 : "32px",
                  position: "relative",
                }}
              >
                {/* Line + Dot */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "20px",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: dotColor,
                      flexShrink: 0,
                      boxShadow: step.active
                        ? "0 0 8px rgba(234, 179, 8, 0.3)"
                        : step.complete
                        ? "0 0 8px rgba(34, 197, 94, 0.2)"
                        : "none",
                    }}
                  />
                  {!isLast && (
                    <div
                      style={{
                        width: "2px",
                        flex: 1,
                        backgroundColor: step.complete
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(255, 255, 255, 0.06)",
                        marginTop: "4px",
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ paddingTop: "0px" }}>
                  <p
                    style={{
                      color: step.complete || step.active
                        ? "#FAF6F0"
                        : "rgba(255, 255, 255, 0.3)",
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                      marginBottom: "2px",
                    }}
                  >
                    {step.label}
                    {step.active && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "0.6875rem",
                          color: "#EAB308",
                          fontWeight: 400,
                        }}
                      >
                        — In progress
                      </span>
                    )}
                  </p>
                  {step.date && (
                    <p
                      style={{
                        color: "rgba(255, 255, 255, 0.25)",
                        fontSize: "0.75rem",
                      }}
                    >
                      {new Date(step.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rejected message */}
      {application?.status === "rejected" && !partner && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.04)",
            border: "1px solid rgba(239, 68, 68, 0.1)",
            borderRadius: "12px",
            padding: "24px 28px",
            marginTop: "24px",
            maxWidth: "500px",
          }}
        >
          <h4
            style={{
              color: "#EF4444",
              fontWeight: 600,
              fontSize: "0.9375rem",
              marginBottom: "4px",
            }}
          >
            Application not approved
          </h4>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.45)",
              fontSize: "0.8125rem",
              lineHeight: 1.6,
            }}
          >
            If you have questions or would like to discuss, please email{" "}
            <a
              href="mailto:hello@704collective.com"
              style={{ color: "#C6A664", textDecoration: "none" }}
            >
              hello@704collective.com
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
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
    none: {
      bg: "rgba(255, 255, 255, 0.04)",
      text: "rgba(255, 255, 255, 0.4)",
      border: "rgba(255, 255, 255, 0.08)",
    },
  };

  const c = colors[status] || colors.none;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 14px",
        borderRadius: "9999px",
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: "0.8125rem",
        fontWeight: 600,
        color: c.text,
        textTransform: "capitalize",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: c.text,
        }}
      />
      {status}
    </span>
  );
}