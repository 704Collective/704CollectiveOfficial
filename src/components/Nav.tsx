"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto max-w-7xl px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo-nav.png"
            alt="704 Collective"
            width={44}
            height={44}
            priority
          />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#how-it-works" className="text-sm text-white/80 hover:text-white transition">
            How It Works
          </Link>
          <Link href="/#events" className="text-sm text-white/80 hover:text-white transition">
            Events
          </Link>
          <Link href="/business" className="text-sm text-white/80 hover:text-white transition">
            704 Business
          </Link>
          <Link href="/blog" className="text-sm text-white/80 hover:text-white transition">
            Blog
          </Link>
          <Link href="/faq" className="text-sm text-white/80 hover:text-white transition">
            FAQ
          </Link>
          <Link
            href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
            className="bg-white text-black text-sm font-bold px-5 py-2 rounded-lg hover:bg-white/90 transition"
          >
            Join Now
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-white transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-white transition-all ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-white transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-black border-t border-white/10 px-6 py-6 flex flex-col gap-4">
          <Link href="/#how-it-works" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">
            How It Works
          </Link>
          <Link href="/#events" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">
            Events
          </Link>
          <Link href="/business" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">
            704 Business
          </Link>
          <Link href="/blog" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">
            Blog
          </Link>
          <Link href="/faq" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">
            FAQ
          </Link>
          <Link
            href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04"
            onClick={() => setMobileOpen(false)}
            className="bg-white text-black text-center font-bold px-5 py-3 rounded-lg"
          >
            Join Now
          </Link>
        </div>
      )}
    </nav>
  );
}