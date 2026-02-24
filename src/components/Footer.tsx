import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "#1A1A1A",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "64px 24px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
            gap: "48px",
          }}
          className="footer-grid"
        >
          {/* Brand */}
          <div>
            <Image src="/logo-nav.png" alt="704 Collective" width={44} height={44} />
            <p
              style={{
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: "0.875rem",
                marginTop: "16px",
                lineHeight: 1.6,
              }}
            >
              Your city. Your people.
              <br />
              Charlotte{"'"}s premier social club and
              <br />
              business membership association.
            </p>
          </div>

          {/* Community */}
          <div>
            <h4
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              Community
            </h4>
            <nav style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link
                href="/#about"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                About
              </Link>
              <Link
                href="/#how-it-works"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                How It Works
              </Link>
              <Link
                href="/#events"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                Events
              </Link>
              <Link
                href="/#faq"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                FAQ
              </Link>
              <Link
                href="/blog"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                Blog
              </Link>
            </nav>
          </div>

          {/* Membership */}
          <div>
            <h4
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              Membership
            </h4>
            <nav style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <a
                href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                Join 704 Social
              </a>
              <Link
                href="/business"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                704 Business
              </Link>
              <Link
                href="/vendor"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                Partner With Us
              </Link>
            </nav>
          </div>

          {/* Connect */}
          <div>
            <h4
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: "16px",
              }}
            >
              Connect
            </h4>
            <nav style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <a
                href="mailto:hello@704collective.com"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                hello@704collective.com
              </a>
              <a
                href="https://instagram.com/704collective"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  transition: "color 200ms ease",
                }}
              >
                Instagram
              </a>
            </nav>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            marginTop: "48px",
            paddingTop: "32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <p
            style={{
              color: "rgba(255, 255, 255, 0.25)",
              fontSize: "0.75rem",
            }}
          >
            &copy; {new Date().getFullYear()} 704 Collective. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: "24px" }}>
            <Link
              href="/privacy"
              style={{
                color: "rgba(255, 255, 255, 0.25)",
                fontSize: "0.75rem",
                textDecoration: "none",
                transition: "color 200ms ease",
              }}
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              style={{
                color: "rgba(255, 255, 255, 0.25)",
                fontSize: "0.75rem",
                textDecoration: "none",
                transition: "color 200ms ease",
              }}
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}