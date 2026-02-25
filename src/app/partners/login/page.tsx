"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PartnerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/partners/dashboard");
    }
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
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
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
            Welcome back
          </h1>
          <p style={{ color: "#A0A0A0", fontSize: "0.875rem" }}>
            Log in to your partner dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
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
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                backgroundColor: "#1A1A1A",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                color: "#FAF6F0",
                fontSize: "0.9375rem",
                outline: "none",
                transition: "border-color 200ms ease",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "rgba(198, 166, 100, 0.3)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor =
                  "rgba(255, 255, 255, 0.08)")
              }
              placeholder="you@company.com"
            />
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
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                backgroundColor: "#1A1A1A",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                color: "#FAF6F0",
                fontSize: "0.9375rem",
                outline: "none",
                transition: "border-color 200ms ease",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "rgba(198, 166, 100, 0.3)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor =
                  "rgba(255, 255, 255, 0.08)")
              }
              placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading}
            className="btn-gold"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "0.875rem",
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
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
            Don{"'"}t have an account?{" "}
            <Link
              href="/partners/signup"
              style={{
                color: "#C6A664",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Sign up
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