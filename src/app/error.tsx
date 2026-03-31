"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    console.error("[app-error]", error?.message ?? "unknown");
  }, [error]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session?.user);
    });
  }, []);

  const primaryHref = loggedIn ? "/dashboard" : "/";
  const primaryLabel = loggedIn ? "Go to dashboard" : "Go to homepage";

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-8 relative w-40 h-14 mx-auto">
        <Image
          src="/logo-white.png"
          alt="704 Collective"
          fill
          className="object-contain"
          sizes="160px"
          priority
        />
      </div>
      <h1 className="text-2xl font-semibold text-[#FAF6F0] mb-2">Something went wrong</h1>
      <p className="text-sm text-[#A0A0A0] max-w-md mb-8 leading-relaxed">
        We couldn&apos;t load this page. You can try again or return to a familiar place.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          type="button"
          variant="outline"
          className="border-white/20 text-[#FAF6F0] hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#C6A664]"
          onClick={() => reset()}
        >
          Try again
        </Button>
        <Button
          asChild
          className="bg-[#C6A664] text-[#1A1A1A] hover:bg-[#C6A664] focus-visible:ring-2 focus-visible:ring-[#C6A664]"
        >
          <Link href={primaryHref}>{primaryLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
