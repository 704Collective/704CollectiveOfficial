"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);

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
          <a
            href="https://instagram.com/704collective"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link"
            aria-label="Instagram"
            style={{ display: "flex", alignItems: "center" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="5" />
              <circle
                cx="17.5"
                cy="6.5"
                r="1.5"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </a>

          {/* CTA */}
          <Link
            href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
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
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="mobile-nav-toggle"
          aria-label="Toggle menu"
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
              <a
                href="https://instagram.com/704collective"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "rgba(255, 255, 255, 0.5)" }}
                aria-label="Instagram"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="5" />
                  <circle
                    cx="17.5"
                    cy="6.5"
                    r="1.5"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </a>
              <Link
                href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
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
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}