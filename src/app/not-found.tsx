"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function NotFound() {
  usePageTitle("Page Not Found");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session?.user);
    });
  }, []);

  const primaryHref = loggedIn ? "/dashboard" : "/";
  const primaryLabel = loggedIn ? "Go to dashboard" : "Go to homepage";

  return (
    <>
      <Nav />
      <main
        id="main-content"
        className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] px-6 pt-24 pb-16 text-center"
      >
        <div className="mb-8 relative w-40 h-14 mx-auto">
          <img
            src="/logo-nav.svg"
            alt="704 Collective"
            className="object-contain w-full h-full"
          />
        </div>
        <h1 className="text-2xl font-semibold text-[#FAF6F0] mb-2">Page not found</h1>
        <p className="text-sm text-[#A0A0A0] max-w-md mb-8 leading-relaxed">
          This URL doesn&apos;t match any page on our site.
        </p>
        <Button
          asChild
          className="bg-[#C6A664] text-[#1A1A1A] hover:bg-[#C6A664] focus-visible:ring-2 focus-visible:ring-[#C6A664]"
        >
          <Link href={primaryHref}>{primaryLabel}</Link>
        </Button>
      </main>
    </>
  );
}
