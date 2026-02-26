"use client";

import { useEffect, useState } from "react";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 600);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: "32px",
        right: "32px",
        zIndex: 40,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        color: "rgba(255, 255, 255, 0.5)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 200ms ease",
        backdropFilter: "blur(8px)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(198, 166, 100, 0.12)";
        e.currentTarget.style.borderColor = "rgba(198, 166, 100, 0.3)";
        e.currentTarget.style.color = "#C6A664";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
        e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15L12 9L6 15" />
      </svg>
    </button>
  );
}