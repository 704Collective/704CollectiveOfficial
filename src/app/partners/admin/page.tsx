"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setApplications(data);
    setLoading(false);
  }

  async function handleApprove(app: any) {
    setActionLoading(app.id);

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", app.id);

    // Create partner record
    await supabase.from("partners").insert({
      user_id: app.user_id,
      application_id: app.id,
      email: app.email,
      business_name: app.business_name,
      contact_name: app.contact_name,
      phone: app.phone,
      website: app.website,
      partner_types: app.partner_types,
      status: "active",
    });

    setActionLoading(null);
    loadApplications();
  }

  async function handleReject(app: any) {
    setActionLoading(app.id);

    await supabase
      .from("applications")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", app.id);

    setActionLoading(null);
    loadApplications();
  }

  async function handleDelete(app: any) {
    if (!confirm(`Delete application from ${app.business_name}? This cannot be undone.`)) {
      return;
    }

    setActionLoading(app.id);

    // Delete partner record if exists
    await supabase.from("partners").delete().eq("application_id", app.id);

    // Delete application
    await supabase.from("applications").delete().eq("id", app.id);

    setActionLoading(null);
    loadApplications();
  }

  const filtered =
    filter === "all"
      ? applications
      : applications.filter((a) => a.status === filter);

  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

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
          Applications
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
          Review and manage partner applications.
        </p>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "24px",
          backgroundColor: "#0A0A0A",
          borderRadius: "10px",
          padding: "4px",
          width: "fit-content",
        }}
      >
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              backgroundColor:
                filter === f ? "rgba(255, 255, 255, 0.06)" : "transparent",
              border: "none",
              color:
                filter === f ? "#FAF6F0" : "rgba(255, 255, 255, 0.35)",
              fontSize: "0.8125rem",
              fontWeight: filter === f ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 150ms ease",
              textTransform: "capitalize",
            }}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Applications List */}
      {filtered.length === 0 ? (
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: "0.875rem" }}>
            No {filter === "all" ? "" : filter} applications yet.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((app) => (
            <div
              key={app.id}
              style={{
                backgroundColor: "#1A1A1A",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "12px",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                opacity: actionLoading === app.id ? 0.5 : 1,
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
                      color: "#FAF6F0",
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                    }}
                  >
                    {app.business_name}
                  </h3>
                  <StatusBadge status={app.status} />
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
                    {app.contact_name}
                  </span>
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.25)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {app.email}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {app.partner_types?.map((type: string) => (
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
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.2)",
                      fontSize: "0.6875rem",
                    }}
                  >
                    {new Date(app.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Right: Actions */}
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                {app.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleApprove(app)}
                      disabled={actionLoading === app.id}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(34, 197, 94, 0.1)",
                        border: "1px solid rgba(34, 197, 94, 0.2)",
                        color: "#22C55E",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 150ms ease",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(app)}
                      disabled={actionLoading === app.id}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(239, 68, 68, 0.06)",
                        border: "1px solid rgba(239, 68, 68, 0.15)",
                        color: "#EF4444",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 150ms ease",
                      }}
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(app)}
                  disabled={actionLoading === app.id}
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
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                    e.currentTarget.style.color = "#EF4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
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

/* ─── Status Badge ─── */

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
  };

  const c = colors[status] || colors.pending;

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