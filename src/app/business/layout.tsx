import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "704 Business | 704 Collective",
  description:
    "704 Business membership: strategic networking, growth, and curated connections for Charlotte professionals and founders.",
  openGraph: {
    title: "704 Business | 704 Collective",
    description:
      "Strategic networking and growth for Charlotte professionals and founders.",
    url: `${SITE_URL}/business`,
    siteName: "704 Collective",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "704 Collective" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "704 Business | 704 Collective",
    description:
      "Strategic networking and growth for Charlotte professionals and founders.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: `${SITE_URL}/business` },
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
