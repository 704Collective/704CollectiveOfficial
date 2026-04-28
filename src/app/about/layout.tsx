import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet the founders and learn how 704 Collective builds real connections for Charlotte's social and business community.",
  openGraph: {
    title: "About | 704 Collective",
    description:
      "Meet the founders and learn how 704 Collective builds real connections in Charlotte.",
    url: `${SITE_URL}/about`,
    siteName: "704 Collective",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "704 Collective" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About | 704 Collective",
    description:
      "Meet the founders and learn how 704 Collective builds real connections in Charlotte.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: `${SITE_URL}/about` },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
