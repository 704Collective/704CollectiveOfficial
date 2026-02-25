"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/partners/login");
        return;
      }

      // Check admin_users table
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!adminData) {
        // Not an admin — redirect to partner dashboard
        router.push("/partners/dashboard");
        return;
      }

      setUser(session.user);
      setIsAdmin(true);
      setLoading(false);
    }

    checkAdmin();
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

  if (!isAdmin) return null;

  const navItems = [
    { href: "/partners/admin", label: "Applications", icon: "◻" },
    { href: "/partners/admin/partners", label: "Partners", icon: "◈" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#000000" }}>
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
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#EF4444",
            }}
          />
          <span
            style={{
              color: "#EF4444",
              fontSize: "0.6875rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            704 Admin
          </span>
        </div>

        <p
          style={{
            fontSize: "0.6875rem",
            color: "rgba(255, 255, 255, 0.2)",
            padding: "0 12px",
            marginBottom: "24px",
          }}
        >
          Founder Access
        </p>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: isActive
                    ? "rgba(239, 68, 68, 0.06)"
                    : "transparent",
                  color: isActive ? "#FAF6F0" : "rgba(255, 255, 255, 0.4)",
                  fontSize: "0.875rem",
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: "none",
                  transition: "all 150ms ease",
                }}
              >
                <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}

          {/* Divider */}
          <div
            style={{
              height: "1px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              margin: "12px 0",
            }}
          />

          <Link
            href="/partners/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "8px",
              color: "rgba(255, 255, 255, 0.3)",
              fontSize: "0.8125rem",
              textDecoration: "none",
            }}
          >
            ← Partner Dashboard
          </Link>
        </nav>

        {/* Logout */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            paddingTop: "16px",
            marginTop: "auto",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              color: "rgba(255, 255, 255, 0.35)",
              padding: "0 12px",
              marginBottom: "8px",
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
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "6px",
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "0.8125rem",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(220, 38, 38, 0.3)";
              e.currentTarget.style.color = "#EF4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)";
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "32px 40px", overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}