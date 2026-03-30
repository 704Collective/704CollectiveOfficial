"use client";

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#1A1A1A] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#FAF6F0] focus:ring-2 focus:ring-[#C6A664] focus:ring-offset-2 focus:ring-offset-[#1A1A1A]"
    >
      Skip to main content
    </a>
  );
}
