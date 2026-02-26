"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/partners/login");
        return;
      }

      setUser(session.user);
      setLoading(false);
    }

    checkAuth();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/partners/login");
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "24px",
            height: "24px",
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

  const navItems = [
    { label: "Overview", href: "/partners/dashboard" },
    { label: "Profile", href: "/partners/dashboard/profile" },
    { label: "Status", href: "/partners/dashboard/status" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#000000",
        display: "flex",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: "240px",
          backgroundColor: "#0A0A0A",
          borderRight: "1px solid rgba(255, 255, 255, 0.06)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            textDecoration: "none",
            marginBottom: "32px",
            paddingLeft: "8px",
          }}
        >
          <span
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
            }}
          >
            704
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "rgba(255, 255, 255, 0.3)",
              marginLeft: "6px",
            }}
          >
            Partner Portal
          </span>
        </Link>

        {/* Navigation */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)",
                  backgroundColor: isActive
                    ? "rgba(255, 255, 255, 0.06)"
                    : "transparent",
                  textDecoration: "none",
                  transition: "all 150ms ease",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            paddingTop: "16px",
            marginTop: "16px",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              color: "rgba(255, 255, 255, 0.25)",
              marginBottom: "8px",
              paddingLeft: "8px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user?.email}
          </p>
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              backgroundColor: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              color: "rgba(255, 255, 255, 0.35)",
              fontSize: "0.8125rem",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "all 150ms ease",
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}