"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadPartners();
  }, []);

  async function loadPartners() {
    const { data } = await supabase
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setPartners(data);
    setLoading(false);
  }

  async function handleBlock(partner: any) {
    setActionLoading(partner.id);
    const newStatus = partner.status === "blocked" ? "active" : "blocked";

    await supabase
      .from("partners")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", partner.id);

    setActionLoading(null);
    loadPartners();
  }

  async function handleDelete(partner: any) {
    if (
      !confirm(
        `Delete partner ${partner.business_name}? This removes their partner access permanently.`
      )
    ) {
      return;
    }

    setActionLoading(partner.id);

    await supabase.from("partners").delete().eq("id", partner.id);

    setActionLoading(null);
    loadPartners();
  }

  const active = partners.filter((p) => p.status === "active");
  const blocked = partners.filter((p) => p.status === "blocked");

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

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#FAF6F0",
            letterSpacing: "-0.025em",
            marginBottom: "8px",
          }}
        >
          Partners
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
          {partners.length} total — {active.length} active, {blocked.length}{" "}
          blocked
        </p>
      </div>

      {/* Partners List */}
      {partners.length === 0 ? (
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              color: "rgba(255, 255, 255, 0.3)",
              fontSize: "0.875rem",
            }}
          >
            No approved partners yet. Approve applications from the
            Applications tab.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {partners.map((partner) => (
            <div
              key={partner.id}
              style={{
                backgroundColor: "#1A1A1A",
                border: `1px solid ${
                  partner.status === "blocked"
                    ? "rgba(239, 68, 68, 0.1)"
                    : "rgba(255, 255, 255, 0.06)"
                }`,
                borderRadius: "12px",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                opacity: actionLoading === partner.id ? 0.5 : 1,
                transition: "opacity 200ms ease",
              }}
            >
              {/* Left: Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "6px",
                  }}
                >
                  <h3
                    style={{
                      color: partner.status === "blocked"
                        ? "rgba(255, 255, 255, 0.4)"
                        : "#FAF6F0",
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                      textDecoration:
                        partner.status === "blocked"
                          ? "line-through"
                          : "none",
                    }}
                  >
                    {partner.business_name}
                  </h3>
                  <StatusBadge status={partner.status} />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.4)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {partner.contact_name}
                  </span>
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.25)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {partner.email}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {partner.partner_types?.map((type: string) => (
                      <span
                        key={type}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(198, 166, 100, 0.08)",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          color: "#C6A664",
                          textTransform: "capitalize",
                        }}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                  {partner.phone && (
                    <span
                      style={{
                        color: "rgba(255, 255, 255, 0.2)",
                        fontSize: "0.75rem",
                      }}
                    >
                      {partner.phone}
                    </span>
                  )}
                  {partner.website && (
                    <a
                      href={
                        partner.website.startsWith("http")
                          ? partner.website
                          : `https://${partner.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "rgba(198, 166, 100, 0.5)",
                        fontSize: "0.75rem",
                        textDecoration: "none",
                      }}
                    >
                      {partner.website}
                    </a>
                  )}
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.15)",
                      fontSize: "0.6875rem",
                    }}
                  >
                    Since{" "}
                    {new Date(partner.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Right: Actions */}
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button
                  onClick={() => handleBlock(partner)}
                  disabled={actionLoading === partner.id}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    backgroundColor:
                      partner.status === "blocked"
                        ? "rgba(34, 197, 94, 0.08)"
                        : "rgba(234, 179, 8, 0.06)",
                    border: `1px solid ${
                      partner.status === "blocked"
                        ? "rgba(34, 197, 94, 0.2)"
                        : "rgba(234, 179, 8, 0.15)"
                    }`,
                    color:
                      partner.status === "blocked" ? "#22C55E" : "#EAB308",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 150ms ease",
                  }}
                >
                  {partner.status === "blocked" ? "Unblock" : "Block"}
                </button>
                <button
                  onClick={() => handleDelete(partner)}
                  disabled={actionLoading === partner.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    backgroundColor: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    color: "rgba(255, 255, 255, 0.25)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(239, 68, 68, 0.3)";
                    e.currentTarget.style.color = "#EF4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(255, 255, 255, 0.06)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.25)";
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
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

  const c = colors[status] || colors.inactive;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "9999px",
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: c.text,
        textTransform: "capitalize",
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          backgroundColor: c.text,
        }}
      />
      {status}
    </span>
  );
}