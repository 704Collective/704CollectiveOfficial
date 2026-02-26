"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
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
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <p
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "rgba(255, 255, 255, 0.25)",
                marginBottom: "16px",
              }}
            >
              704 Collective
            </p>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#FFFFFF",
                marginBottom: "12px",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                color: "rgba(255, 255, 255, 0.45)",
                fontSize: "0.9375rem",
                lineHeight: 1.6,
                marginBottom: "32px",
              }}
            >
              We hit an unexpected error. Try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#FFFFFF",
                color: "#000000",
                fontWeight: 600,
                fontSize: "0.875rem",
                padding: "12px 28px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 200ms ease",
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}