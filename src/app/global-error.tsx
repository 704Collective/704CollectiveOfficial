"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches errors thrown by the root layout itself, which error.tsx cannot.
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error?.message ?? "unknown");
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#0d0d0d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.25)",
              marginBottom: "16px",
            }}
          >
            704 Collective
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#FFFFFF", marginBottom: "12px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "32px" }}>
            We hit an unexpected error. Try again or refresh the page.
          </p>
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: "#FFFFFF",
              color: "#000000",
              fontWeight: 600,
              fontSize: "0.875rem",
              padding: "12px 28px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
