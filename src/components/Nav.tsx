"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);

  /* Close mobile menu on Escape key */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
      aria-label="Main navigation"
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
        }}
      >
        {/* Logo — Left */}
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <Image
            src="/logo-nav.png"
            alt="704 Collective"
            width={40}
            height={40}
            priority
          />
        </Link>

        {/* Desktop Links — Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
          className="desktop-nav"
        >
          <Link href="/#about" className="nav-link">
            About
          </Link>
          <Link href="/#how-it-works" className="nav-link">
            How It Works
          </Link>

          {/* Membership Dropdown */}
          <div
            style={{ position: "relative" }}
            onMouseEnter={() => setMembershipOpen(true)}
            onMouseLeave={() => setMembershipOpen(false)}
          >
            <button
              className="nav-link"
              aria-expanded={membershipOpen}
              aria-haspopup="true"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Membership
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                aria-hidden="true"
                style={{
                  transform: membershipOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 200ms ease",
                }}
              >
                <path
                  d="M1 1L5 5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {membershipOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  paddingTop: "8px",
                }}
              >
                <div
                  role="menu"
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "8px",
                    minWidth: "200px",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  <Link
                    href="/#membership"
                    role="menuitem"
                    style={{
                      display: "block",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontSize: "0.875rem",
                      color: "rgba(255, 255, 255, 0.7)",
                      textDecoration: "none",
                      transition: "all 200ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(255, 255, 255, 0.06)";
                      e.currentTarget.style.color = "#FFFFFF";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>704 Social</span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginTop: "2px",
                      }}
                    >
                      Events, wellness & community
                    </span>
                  </Link>
                  <Link
                    href="/business"
                    role="menuitem"
                    style={{
                      display: "block",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontSize: "0.875rem",
                      color: "rgba(255, 255, 255, 0.7)",
                      textDecoration: "none",
                      transition: "all 200ms ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "rgba(255, 255, 255, 0.06)";
                      e.currentTarget.style.color = "#FFFFFF";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>704 Business</span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginTop: "2px",
                      }}
                    >
                      Strategic networking & growth
                    </span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <Link href="/#events" className="nav-link">
            Events
          </Link>
          <Link href="/blog" className="nav-link">
            Blog
          </Link>

          {/* Social Links */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <a
              href="https://www.instagram.com/704_collective"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
              aria-label="Instagram"
              style={{ display: "flex", alignItems: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/704collectiveclt/"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
              aria-label="Facebook"
              style={{ display: "flex", alignItems: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>
            <a
              href="https://www.tiktok.com/@704_collective"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
              aria-label="TikTok"
              style={{ display: "flex", alignItems: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.78a4.86 4.86 0 0 1-1-.09z" />
              </svg>
            </a>
          </div>

          {/* CTA */}
          <a
            href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#000000",
              fontWeight: 600,
              fontSize: "0.8125rem",
              padding: "10px 24px",
              borderRadius: "8px",
              textDecoration: "none",
              letterSpacing: "0.02em",
              transition: "all 200ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 4px 16px rgba(255, 255, 255, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Join Now
          </a>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="mobile-nav-toggle"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          style={{
            flexDirection: "column",
            gap: "5px",
            padding: "8px",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: "22px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              transition: "all 200ms ease",
              transform: mobileOpen
                ? "rotate(45deg) translateY(7px)"
                : "none",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: "22px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              transition: "all 200ms ease",
              opacity: mobileOpen ? 0 : 1,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: "22px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              transition: "all 200ms ease",
              transform: mobileOpen
                ? "rotate(-45deg) translateY(-7px)"
                : "none",
            }}
          />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          role="menu"
          className="mobile-nav-menu"
          style={{
            backgroundColor: "#000000",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            padding: "24px",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <Link
              href="/#about"
              role="menuitem"
              onClick={() => setMobileOpen(false)}
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                textDecoration: "none",
                padding: "12px 0",
                fontSize: "1rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              About
            </Link>
            <Link
              href="/#how-it-works"
              role="menuitem"
              onClick={() => setMobileOpen(false)}
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                textDecoration: "none",
                padding: "12px 0",
                fontSize: "1rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              How It Works
            </Link>

            {/* Mobile Membership Sub-links */}
            <div
              style={{
                padding: "12px 0",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.4)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Membership
              </span>
              <Link
                href="/#membership"
                role="menuitem"
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "block",
                  color: "rgba(255, 255, 255, 0.7)",
                  textDecoration: "none",
                  padding: "8px 0 4px 12px",
                  fontSize: "1rem",
                }}
              >
                704 Social
              </Link>
              <Link
                href="/business"
                role="menuitem"
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "block",
                  color: "rgba(255, 255, 255, 0.7)",
                  textDecoration: "none",
                  padding: "4px 0 4px 12px",
                  fontSize: "1rem",
                }}
              >
                704 Business
              </Link>
            </div>

            <Link
              href="/#events"
              role="menuitem"
              onClick={() => setMobileOpen(false)}
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                textDecoration: "none",
                padding: "12px 0",
                fontSize: "1rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              Events
            </Link>
            <Link
              href="/blog"
              role="menuitem"
              onClick={() => setMobileOpen(false)}
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                textDecoration: "none",
                padding: "12px 0",
                fontSize: "1rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              Blog
            </Link>

            {/* Mobile Social + CTA */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <a
                  href="https://www.instagram.com/704_collective"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.5)" }}
                  aria-label="Instagram"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <circle cx="12" cy="12" r="5" />
                    <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                </a>
                <a
                  href="https://www.facebook.com/704collectiveclt/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.5)" }}
                  aria-label="Facebook"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </a>
                <a
                  href="https://www.tiktok.com/@704_collective"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255, 255, 255, 0.5)" }}
                  aria-label="TikTok"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.78a4.86 4.86 0 0 1-1-.09z" />
                  </svg>
                </a>
              </div>
              <a
                href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                style={{
                  backgroundColor: "#FFFFFF",
                  color: "#000000",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  padding: "12px 32px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                Join Now
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}